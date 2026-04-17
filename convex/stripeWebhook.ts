/**
 * @fileoverview Stripe Webhook Handler
 *
 * Processes incoming Stripe webhook events with signature verification,
 * replay protection, and idempotent event handling.
 *
 * Features:
 *   - Checkout session completion (subscriptions and coin purchases)
 *   - Subscription lifecycle (create, update, delete)
 *   - Invoice events (paid, payment failed)
 *   - Connect account updates and deauthorization
 *   - Transfer events (created, updated, reversed)
 *   - Payout events to connected account banks
 *   - Payment intent status tracking
 *
 * Security:
 *   - Webhook signature verification using STRIPE_WEBHOOK_SECRET
 *   - Replay protection rejects events older than 5 minutes
 *   - Event deduplication prevents duplicate processing
 *   - Failed events tracked with error messages for retry
 *
 * Limits:
 *   - Maximum event age: 5 minutes (300 seconds)
 */
"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ===== HELPERS =====

/** Lazily initializes and returns the Stripe client singleton */
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return _stripe;
}

// ===== INTERNAL ACTIONS =====

/** Main webhook handler - processes all Stripe webhook events */
export const handleWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    statusCode: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        args.body,
        args.signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return {
        success: false,
        error: "Webhook signature verification failed",
        statusCode: 400,
      };
    }

    console.log(`Received Stripe webhook: ${event.type} (${event.id})`);

    // ===== REPLAY PROTECTION =====

    const eventAgeSeconds = Math.floor(Date.now() / 1000) - event.created;
    const MAX_EVENT_AGE_SECONDS = 5 * 60; // 5 minutes

    if (eventAgeSeconds > MAX_EVENT_AGE_SECONDS) {
      console.warn(
        `Rejecting stale webhook event ${event.id}: ${eventAgeSeconds}s old (max ${MAX_EVENT_AGE_SECONDS}s)`
      );
      return {
        success: false,
        error: "Event timestamp too old",
        statusCode: 400,
      };
    }

    // ===== EVENT DEDUPLICATION =====

    const { processed, status } = await ctx.runQuery(internal.stripeHelpers.checkEventProcessed, {
      eventId: event.id,
    });

    if (processed) {
      if (status === "completed") {
        console.log(`Event ${event.id} already processed successfully, skipping`);
        return { success: true };
      }
      if (status === "processing") {
        console.log(`Event ${event.id} is currently being processed, skipping`);
        return { success: true };
      }
      console.log(`Retrying previously failed event ${event.id}`);
    }

    await ctx.runMutation(internal.stripeHelpers.markEventProcessed, {
      eventId: event.id,
      eventType: event.type,
      status: "processing",
    });

    // ===== EVENT HANDLERS =====

    try {
      switch (event.type) {
        // ----- Checkout Events -----
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;

          if (session.mode === "subscription" && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription as string,
              { expand: ["items.data"] }
            );

            const metadata = session.metadata;
            if (metadata?.convexUserId && metadata?.convexTierId && metadata?.creatorId) {
              const firstItem = subscription.items?.data?.[0];
              const currentPeriodStart =
                firstItem?.current_period_start ?? Math.floor(Date.now() / 1000);
              const currentPeriodEnd =
                firstItem?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

              await ctx.runMutation(internal.stripeHelpers.createSubscriptionInternal, {
                fanId: metadata.convexUserId as Id<"users">,
                creatorId: metadata.creatorId as Id<"users">,
                tierId: metadata.convexTierId as Id<"subscriptionTiers">,
                stripeSubscriptionId: subscription.id,
                priceAtSubscription: 0, // Will be updated from tier
                currentPeriodStart: currentPeriodStart * 1000, // Convert to ms
                currentPeriodEnd: currentPeriodEnd * 1000,
              });
              console.log(`Created subscription for user ${metadata.convexUserId}`);
            } else {
              console.error("Missing metadata in checkout session:", session.id);
            }
          } else if (session.mode === "payment" && session.metadata?.type === "coin_purchase") {
            const metadata = session.metadata;
            if (metadata?.convexUserId && metadata?.amount) {
              await ctx.runMutation(internal.tips.addCoinsFromPayment, {
                userId: metadata.convexUserId as Id<"users">,
                amount: parseInt(metadata.amount, 10),
                stripePaymentId: session.payment_intent as string,
              });
              console.log(`Processed coin purchase for user ${metadata.convexUserId}`);
            }
          }
          break;
        }

        // ----- Subscription Events -----
        case "customer.subscription.created": {
          const subscription = event.data.object as Stripe.Subscription;
          console.log(`Subscription created: ${subscription.id}`);
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const firstItem = subscription.items?.data?.[0];
          const currentPeriodStart =
            firstItem?.current_period_start ?? Math.floor(Date.now() / 1000);
          const currentPeriodEnd =
            firstItem?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

          type SubscriptionStatus = "active" | "trialing" | "canceled" | "past_due" | "paused";
          const statusMap: Record<string, SubscriptionStatus> = {
            active: "active",
            trialing: "trialing",
            canceled: "canceled",
            past_due: "past_due",
            paused: "paused",
            unpaid: "past_due",
            incomplete: "past_due",
            incomplete_expired: "canceled",
          };
          const status: SubscriptionStatus = statusMap[subscription.status] ?? "active";

          await ctx.runMutation(internal.subscriptions.handleStripeUpdate, {
            stripeSubscriptionId: subscription.id,
            status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodStart: currentPeriodStart * 1000,
            currentPeriodEnd: currentPeriodEnd * 1000,
          });
          console.log(`Updated subscription ${subscription.id} to status ${subscription.status}`);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const firstItem = subscription.items?.data?.[0];
          const currentPeriodStart =
            firstItem?.current_period_start ?? Math.floor(Date.now() / 1000);
          const currentPeriodEnd =
            firstItem?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

          await ctx.runMutation(internal.subscriptions.handleStripeUpdate, {
            stripeSubscriptionId: subscription.id,
            status: "canceled",
            cancelAtPeriodEnd: false,
            currentPeriodStart: currentPeriodStart * 1000,
            currentPeriodEnd: currentPeriodEnd * 1000,
          });
          console.log(`Deleted subscription ${subscription.id}`);
          break;
        }

        // ----- Invoice Events -----
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = (invoice as any).parent?.subscription_details?.subscription;
          if (subscriptionId) {
            console.log(`Invoice paid for subscription ${subscriptionId}`);
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = (invoice as any).parent?.subscription_details?.subscription;
          if (subscriptionId) {
            console.log(`Invoice payment failed for subscription ${subscriptionId}`);
          }
          break;
        }

        // ----- Connect Account Events -----
        case "account.updated": {
          const account = event.data.object as Stripe.Account;
          if (account.charges_enabled && account.payouts_enabled) {
            await ctx.runMutation(internal.stripeHelpers.markConnectOnboardedByAccountId, {
              stripeConnectId: account.id,
            });
          }
          console.log(
            `Updated Connect account ${account.id}: charges=${account.charges_enabled}, payouts=${account.payouts_enabled}`
          );
          break;
        }

        case "account.application.deauthorized": {
          const application = event.data.object as { account?: string; id: string };
          const accountId = application.account ?? application.id;
          console.log(`Connect account deauthorized: ${accountId}`);
          await ctx.runMutation(internal.stripeHelpers.handleConnectDeauthorized, {
            stripeConnectId: accountId,
          });
          break;
        }

        // ----- Transfer Events -----
        case "transfer.created": {
          const transfer = event.data.object as Stripe.Transfer;
          console.log(`Transfer created: ${transfer.id} to ${transfer.destination}`);
          if (transfer.metadata?.convexPayoutId) {
            await ctx.runMutation(internal.payouts.handleTransferSuccess, {
              payoutId: transfer.metadata.convexPayoutId as Id<"payouts">,
              stripeTransferId: transfer.id,
            });
          }
          break;
        }

        case "transfer.updated": {
          const transfer = event.data.object as Stripe.Transfer;
          console.log(`Transfer updated: ${transfer.id}`);
          if (transfer.reversed && transfer.metadata?.convexPayoutId) {
            await ctx.runMutation(internal.payouts.handleTransferFailed, {
              payoutId: transfer.metadata.convexPayoutId as Id<"payouts">,
              failureReason: "Transfer was reversed",
            });
          }
          break;
        }

        case "transfer.reversed": {
          const transfer = event.data.object as Stripe.Transfer;
          console.error(`Transfer reversed: ${transfer.id}`);
          if (transfer.metadata?.convexPayoutId) {
            await ctx.runMutation(internal.payouts.handleTransferFailed, {
              payoutId: transfer.metadata.convexPayoutId as Id<"payouts">,
              failureReason: "Transfer was reversed",
            });
          }
          break;
        }

        // ----- Payout Events -----
        case "payout.failed": {
          const payout = event.data.object as Stripe.Payout;
          console.error(`Payout to bank failed: ${payout.id}, reason: ${payout.failure_message}`);
          break;
        }

        case "payout.paid": {
          const payout = event.data.object as Stripe.Payout;
          console.log(`Payout to bank completed: ${payout.id}`);
          break;
        }

        // ----- Payment Intent Events -----
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log(`Payment succeeded: ${paymentIntent.id}`);
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log(
            `Payment failed: ${paymentIntent.id}, error: ${paymentIntent.last_payment_error?.message}`
          );
          break;
        }

        // ----- Customer Events -----
        case "customer.created":
        case "customer.updated":
        case "customer.deleted": {
          const customer = event.data.object as Stripe.Customer;
          console.log(`Customer ${event.type.split(".")[1]}: ${customer.id}`);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      await ctx.runMutation(internal.stripeHelpers.markEventProcessed, {
        eventId: event.id,
        eventType: event.type,
        status: "completed",
      });

      return { success: true };
    } catch (error) {
      console.error(`Error processing webhook ${event.type}:`, error);

      await ctx.runMutation(internal.stripeHelpers.markEventProcessed, {
        eventId: event.id,
        eventType: event.type,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        error: `Error processing ${event.type}`,
        statusCode: 500,
      };
    }
  },
});
