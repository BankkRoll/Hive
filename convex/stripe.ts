/**
 * @fileoverview Stripe Integration Actions
 *
 * Public and internal actions for Stripe payment processing, including
 * checkout sessions, Connect account management, and webhook handlers.
 *
 * Features:
 *   - Subscription checkout with tiered pricing (monthly/annual)
 *   - Coin purchase checkout for in-app currency
 *   - Stripe Connect onboarding for creator payouts
 *   - Connect dashboard and account status management
 *   - Webhook handlers for subscription lifecycle events
 *   - Payout transfers to creator Connect accounts
 *
 * Security:
 *   - All actions require authentication via ctx.auth
 *   - Creator-only operations enforce role checks
 *   - Stripe customer IDs linked to Convex user records
 *   - Connect accounts use manual payout schedule for platform control
 *
 * Limits:
 *   - Coin purchases: $1.00 minimum, $1,000.00 maximum
 */
"use node";

import { action, internalAction } from "./_generated/server";

import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";

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

// ===== CHECKOUT ACTIONS =====

/** Creates a Stripe checkout session for subscription purchases */
export const createSubscriptionCheckout = action({
  args: {
    tierId: v.id("subscriptionTiers"),
    billingPeriod: v.union(v.literal("monthly"), v.literal("annual")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const tier = await ctx.runQuery(internal.stripeHelpers.getTierInternal, {
      tierId: args.tierId,
    });

    if (!tier || !tier.isActive) {
      throw new Error("Subscription tier not found");
    }

    const user = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!user) {
      throw new Error("User not found");
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email ?? undefined,
        name: user.displayName ?? user.username ?? undefined,
        metadata: {
          convexUserId: user._id,
        },
      });
      customerId = customer.id;

      await ctx.runMutation(internal.stripeHelpers.updateStripeCustomerId, {
        userId: user._id,
        stripeCustomerId: customerId,
      });
    }

    const priceId =
      args.billingPeriod === "annual" ? tier.stripePriceIdAnnual : tier.stripePriceIdMonthly;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: "subscription",
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        convexUserId: user._id,
        convexTierId: args.tierId,
        creatorId: tier.creatorId,
        billingPeriod: args.billingPeriod,
      },
      subscription_data: {
        metadata: {
          convexUserId: user._id,
          convexTierId: args.tierId,
          creatorId: tier.creatorId,
        },
      },
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `${tier.name} Subscription`,
                  description: tier.description ?? `Subscribe to this creator`,
                },
                unit_amount:
                  args.billingPeriod === "annual"
                    ? (tier.priceAnnual ?? tier.priceMonthly * 10)
                    : tier.priceMonthly,
                recurring: {
                  interval: args.billingPeriod === "annual" ? "year" : "month",
                },
              },
              quantity: 1,
            },
          ],
    };

    const session = await getStripe().checkout.sessions.create(sessionParams);

    return { url: session.url };
  },
});

/** Creates a Stripe checkout session for coin purchases */
export const createCoinPurchaseCheckout = action({
  args: {
    amount: v.number(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    if (args.amount < 100) {
      throw new Error("Minimum purchase is $1.00");
    }

    if (args.amount > 100000) {
      throw new Error("Maximum purchase is $1000.00");
    }

    const user = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!user) {
      throw new Error("User not found");
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email ?? undefined,
        name: user.displayName ?? user.username ?? undefined,
        metadata: {
          convexUserId: user._id,
        },
      });
      customerId = customer.id;

      await ctx.runMutation(internal.stripeHelpers.updateStripeCustomerId, {
        userId: user._id,
        stripeCustomerId: customerId,
      });
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        convexUserId: user._id,
        type: "coin_purchase",
        amount: args.amount.toString(),
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Coins",
              description: `${args.amount} coins for tipping and unlocking content`,
            },
            unit_amount: args.amount,
          },
          quantity: 1,
        },
      ],
    });

    return { url: session.url };
  },
});

// ===== STRIPE CONNECT ACTIONS =====

/** Creates a Stripe Connect Express account for creator payouts */
export const createConnectAccount = action({
  args: {
    returnUrl: v.string(),
    refreshUrl: v.string(),
    country: v.optional(v.string()),
  },
  returns: v.object({
    url: v.string(),
    accountId: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string; accountId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.role !== "creator") {
      throw new Error("Must be a creator to set up payouts");
    }

    let accountId: string | undefined = user.stripeConnectId;

    if (!accountId) {
      const nameParts = (user.displayName ?? "").trim().split(/\s+/);
      const firstName = nameParts[0] || undefined;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

      const account = await getStripe().accounts.create({
        type: "express",
        country: args.country ?? "US",
        email: user.email ?? undefined,
        business_type: "individual",
        individual: {
          email: user.email ?? undefined,
          first_name: firstName,
          last_name: lastName,
        },
        business_profile: {
          mcc: "5815",
          url: user.username
            ? `${process.env.NEXT_PUBLIC_APP_URL ?? "https://yourplatform.com"}/@${user.username}`
            : undefined,
        },
        metadata: {
          convexUserId: user._id,
          platform: "hive",
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        settings: {
          payouts: {
            schedule: {
              interval: "manual",
            },
          },
        },
      });
      accountId = account.id;

      await ctx.runMutation(internal.stripeHelpers.updateStripeConnectId, {
        userId: user._id,
        stripeConnectId: accountId,
      });
    }

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: "account_onboarding",
      collection_options: {
        fields: "eventually_due",
        future_requirements: "include",
      },
    });

    return {
      url: accountLink.url,
      accountId,
    };
  },
});

/** Generates a login link to the Stripe Connect Express dashboard */
export const getConnectDashboardLink = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!user || !user.stripeConnectId) {
      throw new Error("Connect account not found");
    }

    const loginLink = await getStripe().accounts.createLoginLink(user.stripeConnectId);

    return { url: loginLink.url };
  },
});

/** Retrieves the onboarding and capability status of a Connect account */
export const getConnectAccountStatus = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!user || !user.stripeConnectId) {
      return {
        hasAccount: false,
        isOnboarded: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      };
    }

    const account = await getStripe().accounts.retrieve(user.stripeConnectId);

    if (account.charges_enabled && !user.stripeConnectOnboarded) {
      await ctx.runMutation(internal.stripeHelpers.markConnectOnboarded, {
        userId: user._id,
      });
    }

    return {
      hasAccount: true,
      isOnboarded: account.details_submitted ?? false,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
    };
  },
});

// ===== INTERNAL ACTIONS =====

/** Handles subscription creation from successful checkout */
export const handleSubscriptionCreated = internalAction({
  args: {
    stripeSubscriptionId: v.string(),
    stripeCustomerId: v.string(),
    convexUserId: v.id("users"),
    convexTierId: v.id("subscriptionTiers"),
    creatorId: v.id("users"),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.stripeHelpers.createSubscriptionInternal, {
      fanId: args.convexUserId,
      creatorId: args.creatorId,
      tierId: args.convexTierId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      priceAtSubscription: 0,
      currentPeriodStart: args.currentPeriodStart * 1000,
      currentPeriodEnd: args.currentPeriodEnd * 1000,
    });
  },
});

/** Handles coin credit from successful payment */
export const handleCoinPurchase = internalAction({
  args: {
    convexUserId: v.id("users"),
    amount: v.number(),
    stripePaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.tips.addCoinsFromPayment, {
      userId: args.convexUserId,
      amount: args.amount,
      stripePaymentId: args.stripePaymentId,
    });
  },
});

/** Handles subscription status changes from Stripe */
export const handleSubscriptionUpdated = internalAction({
  args: {
    stripeSubscriptionId: v.string(),
    status: v.string(),
    cancelAtPeriodEnd: v.boolean(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
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

    const status: SubscriptionStatus = statusMap[args.status] ?? "active";

    await ctx.runMutation(internal.subscriptions.handleStripeUpdate, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      status,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      currentPeriodStart: args.currentPeriodStart * 1000,
      currentPeriodEnd: args.currentPeriodEnd * 1000,
    });
  },
});

/** Handles Connect account capability updates */
export const handleConnectAccountUpdated = internalAction({
  args: {
    accountId: v.string(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.chargesEnabled && args.payoutsEnabled) {
      await ctx.runMutation(internal.stripeHelpers.markConnectOnboardedByAccountId, {
        stripeConnectId: args.accountId,
      });
    }
  },
});

/** Creates a transfer to a creator's Connect account for payout */
export const createPayoutTransfer = internalAction({
  args: {
    creatorId: v.id("users"),
    amount: v.number(),
    payoutId: v.id("payouts"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.stripeHelpers.getUserInternal, {
      userId: args.creatorId,
    });

    if (!user || !user.stripeConnectId) {
      throw new Error("Creator Connect account not found");
    }

    const transfer = await getStripe().transfers.create({
      amount: args.amount,
      currency: "usd",
      destination: user.stripeConnectId,
      metadata: {
        convexUserId: args.creatorId,
        convexPayoutId: args.payoutId,
      },
    });

    return { transferId: transfer.id };
  },
});
