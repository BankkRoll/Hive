/**
 * @fileoverview Stripe Helper Functions
 *
 * Internal queries and mutations used by Stripe actions and webhooks.
 * These functions handle database operations for Stripe-related data.
 *
 * Features:
 *   - User lookups by token identifier and ID
 *   - Stripe customer and Connect ID management
 *   - Subscription creation from webhook events
 *   - Event deduplication and idempotency tracking
 *   - Automatic cleanup of processed events
 *
 * Security:
 *   - All functions are internal (not exposed to clients)
 *   - Connect deauthorization logged for audit
 *   - Idempotency prevents duplicate event processing
 *
 * Limits:
 *   - Stripe events retained for 7 days
 *   - Cleanup processes 500 events per batch
 */
import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ===== INTERNAL QUERIES =====

/** Retrieves a user by their authentication token identifier */
export const getUserByTokenIdentifier = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const authAccount = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("providerAccountId"), args.tokenIdentifier))
      .first();

    if (!authAccount) {
      return null;
    }

    return await ctx.db.get(authAccount.userId as Id<"users">);
  },
});

/** Retrieves a user by their Convex user ID */
export const getUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/** Retrieves a subscription tier by ID */
export const getTierInternal = internalQuery({
  args: { tierId: v.id("subscriptionTiers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tierId);
  },
});

// ===== INTERNAL MUTATIONS =====

/** Updates a user's Stripe customer ID */
export const updateStripeCustomerId = internalMutation({
  args: {
    userId: v.id("users"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

/** Updates a user's Stripe Connect account ID */
export const updateStripeConnectId = internalMutation({
  args: {
    userId: v.id("users"),
    stripeConnectId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeConnectId: args.stripeConnectId,
    });
  },
});

/** Marks a user's Connect account as fully onboarded */
export const markConnectOnboarded = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      stripeConnectOnboarded: true,
    });
  },
});

/** Marks a Connect account as onboarded using the Stripe account ID */
export const markConnectOnboardedByAccountId = internalMutation({
  args: { stripeConnectId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeConnectId", (q) => q.eq("stripeConnectId", args.stripeConnectId))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        stripeConnectOnboarded: true,
      });
    }
  },
});

/** Handles Connect account deauthorization when user disconnects */
export const handleConnectDeauthorized = internalMutation({
  args: { stripeConnectId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripeConnectId", (q) => q.eq("stripeConnectId", args.stripeConnectId))
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        stripeConnectId: undefined,
        stripeConnectOnboarded: false,
      });

      await ctx.scheduler.runAfter(0, internal.admin.logAction, {
        adminId: user._id,
        targetUserId: user._id,
        action: "connect_deauthorized",
        metadata: JSON.stringify({
          previousConnectId: args.stripeConnectId,
        }),
      });
    }
  },
});

/** Creates a subscription record from Stripe webhook data */
export const createSubscriptionInternal = internalMutation({
  args: {
    fanId: v.id("users"),
    creatorId: v.id("users"),
    tierId: v.id("subscriptionTiers"),
    stripeSubscriptionId: v.string(),
    priceAtSubscription: v.number(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    const tier = await ctx.db.get(args.tierId);
    const priceAtSubscription = tier?.priceMonthly ?? args.priceAtSubscription;

    const subscriptionId = await ctx.db.insert("subscriptions", {
      fanId: args.fanId,
      creatorId: args.creatorId,
      tierId: args.tierId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      status: "active",
      priceAtSubscription,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      createdAt: Date.now(),
    });

    const expiryFunctionId = await ctx.scheduler.runAt(
      args.currentPeriodEnd,
      internal.subscriptions.handleSubscriptionExpiry,
      { subscriptionId }
    );
    await ctx.db.patch(subscriptionId, { expiryFunctionId });

    if (tier) {
      await ctx.db.patch(args.tierId, {
        currentSubscribers: (tier.currentSubscribers ?? 0) + 1,
      });
    }

    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId: args.creatorId,
      field: "subscribersCount",
      delta: 1,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: args.creatorId,
      type: "subscription",
      actorId: args.fanId,
    });

    return subscriptionId;
  },
});

// ===== EVENT DEDUPLICATION =====

/** Checks if a Stripe event has already been processed */
export const checkEventProcessed = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("stripeEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();

    return {
      processed: event !== null,
      status: event?.status,
    };
  },
});

/** Marks a Stripe event as processed with status tracking */
export const markEventProcessed = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    status: v.union(v.literal("processing"), v.literal("completed"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        errorMessage: args.errorMessage,
        processedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("stripeEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      status: args.status,
      errorMessage: args.errorMessage,
      processedAt: Date.now(),
    });
  },
});

/** Deletes processed Stripe events older than 7 days */
export const cleanupOldStripeEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const oldEvents = await ctx.db
      .query("stripeEvents")
      .withIndex("by_processedAt")
      .filter((q) =>
        q.and(
          q.lt(q.field("processedAt"), sevenDaysAgo),
          q.or(q.eq(q.field("status"), "completed"), q.eq(q.field("status"), "failed"))
        )
      )
      .take(500);

    let deleted = 0;
    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
      deleted++;
    }

    if (oldEvents.length === 500) {
      await ctx.scheduler.runAfter(1000, internal.stripeHelpers.cleanupOldStripeEvents, {});
    }

    return { deleted };
  },
});
