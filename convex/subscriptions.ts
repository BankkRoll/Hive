/**
 * @fileoverview Subscriptions Module
 *
 * Manages subscription tiers and active subscriptions between fans and creators.
 * Handles tier CRUD operations, subscription lifecycle, and Stripe webhook integration.
 *
 * Features:
 *   - Subscription tier management (create, update, delete, reorder)
 *   - Monthly and annual pricing with configurable benefits
 *   - Subscriber limit enforcement per tier
 *   - Subscription cancellation and resumption
 *   - Automatic expiry handling via scheduled functions
 *   - Stripe webhook integration for payment status updates
 *
 * Security:
 *   - Tier management restricted to creators only
 *   - Subscription cancellation/resumption restricted to subscription owner
 *   - Internal mutations for system operations (cron, webhooks)
 *
 * Limits:
 *   - Maximum 5 tiers per creator
 *   - Price range: $1.00 - $10,000.00
 *   - getTiers: 10 tiers per query
 *   - getMySubscriptions: 100 subscriptions per user
 *   - getMySubscribers: default 50, configurable
 *   - checkExpired (cron): 100 subscriptions per run
 */

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";

import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const MIN_PRICE = 100;
const MAX_PRICE = 1000000;

// ===== QUERIES =====

/** Get active subscription tiers for a creator (public) */
export const getTiers = query({
  args: { creatorId: v.id("users") },
  handler: async (ctx, args) => {
    const tiers = await ctx.db
      .query("subscriptionTiers")
      .withIndex("by_creator_active", (q) => q.eq("creatorId", args.creatorId).eq("isActive", true))
      .take(10);

    return tiers.sort((a, b) => a.order - b.order);
  },
});

/** Get all tiers for the current creator including inactive (creator only) */
export const getMyTiers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const tiers = await ctx.db
      .query("subscriptionTiers")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(10);

    return tiers.sort((a, b) => a.order - b.order);
  },
});

/** Get current user's subscriptions to creators */
export const getMySubscriptions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan", (q) => q.eq("fanId", userId))
      .take(100);

    const enriched = await Promise.all(
      subscriptions.map(async (sub) => {
        const creator = await ctx.db.get(sub.creatorId);
        const tier = await ctx.db.get(sub.tierId);

        if (!creator || !tier) return null;

        return {
          ...sub,
          creator: {
            _id: creator._id,
            username: creator.username,
            displayName: creator.displayName,
            avatarR2Key: creator.avatarR2Key,
            isVerified: creator.isVerified,
          },
          tier: {
            _id: tier._id,
            name: tier.name,
            ringColor: tier.ringColor,
          },
        };
      })
    );

    return enriched.filter((s) => s !== null);
  },
});

/** Get subscribers for the current creator with optional status filter */
export const getMySubscribers = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("canceled"), v.literal("past_due"), v.literal("all"))
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { subscribers: [], total: 0 };
    }

    const limit = args.limit ?? 50;
    const statusFilter = args.status ?? "all";

    let items;
    if (statusFilter !== "all") {
      items = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator_status", (q) => q.eq("creatorId", userId).eq("status", statusFilter))
        .order("desc")
        .take(limit);
    } else {
      items = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator", (q) => q.eq("creatorId", userId))
        .order("desc")
        .take(limit);
    }

    const enriched = await Promise.all(
      items.map(async (sub) => {
        const fan = await ctx.db.get(sub.fanId);
        const tier = await ctx.db.get(sub.tierId);

        if (!fan || !tier) return null;

        return {
          ...sub,
          fan: {
            _id: fan._id,
            username: fan.username,
            displayName: fan.displayName,
            avatarR2Key: fan.avatarR2Key,
          },
          tier: {
            _id: tier._id,
            name: tier.name,
          },
        };
      })
    );

    return {
      subscribers: enriched.filter((s) => s !== null),
      total: items.length,
    };
  },
});

/** Check if current user is subscribed to a creator */
export const isSubscribed = query({
  args: { creatorId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { subscribed: false, tier: null };
    }

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", userId).eq("creatorId", args.creatorId))
      .first();

    if (!subscription || subscription.status !== "active") {
      return { subscribed: false, tier: null };
    }

    const tier = await ctx.db.get(subscription.tierId);

    return {
      subscribed: true,
      tier: tier
        ? {
            _id: tier._id,
            name: tier.name,
            ringColor: tier.ringColor,
          }
        : null,
      subscription: {
        _id: subscription._id,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
    };
  },
});

// ===== MUTATIONS =====

/** Create a new subscription tier (creator only) */
export const createTier = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    priceMonthly: v.number(),
    priceAnnual: v.optional(v.number()),
    ringColor: v.optional(v.string()),
    benefits: v.optional(v.array(v.string())),
    canDM: v.optional(v.boolean()),
    subscriberLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to create subscription tiers");
    }

    if (args.priceMonthly < MIN_PRICE || args.priceMonthly > MAX_PRICE) {
      throw new Error(`Price must be between $${MIN_PRICE / 100} and $${MAX_PRICE / 100}`);
    }

    const existingTiers = await ctx.db
      .query("subscriptionTiers")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(10);

    if (existingTiers.length >= 5) {
      throw new Error("Maximum of 5 subscription tiers allowed");
    }

    const tierId = await ctx.db.insert("subscriptionTiers", {
      creatorId: userId,
      name: args.name.trim(),
      description: args.description?.trim(),
      order: existingTiers.length + 1,
      priceMonthly: args.priceMonthly,
      priceAnnual: args.priceAnnual,
      ringColor: args.ringColor ?? "#FF006E",
      benefits: args.benefits ?? [],
      canDM: args.canDM ?? false,
      subscriberLimit: args.subscriberLimit,
      currentSubscribers: 0,
      isActive: true,
      createdAt: Date.now(),
    });

    return tierId;
  },
});

/** Update an existing subscription tier (creator only) */
export const updateTier = mutation({
  args: {
    tierId: v.id("subscriptionTiers"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceMonthly: v.optional(v.number()),
    priceAnnual: v.optional(v.number()),
    ringColor: v.optional(v.string()),
    benefits: v.optional(v.array(v.string())),
    canDM: v.optional(v.boolean()),
    subscriberLimit: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const tier = await ctx.db.get(args.tierId);
    if (!tier || tier.creatorId !== userId) {
      throw new Error("Tier not found");
    }

    const updates: Partial<Doc<"subscriptionTiers">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      updates.name = args.name.trim();
    }
    if (args.description !== undefined) {
      updates.description = args.description.trim();
    }
    if (args.priceMonthly !== undefined) {
      if (args.priceMonthly < MIN_PRICE || args.priceMonthly > MAX_PRICE) {
        throw new Error(`Price must be between $${MIN_PRICE / 100} and $${MAX_PRICE / 100}`);
      }
      updates.priceMonthly = args.priceMonthly;
    }
    if (args.priceAnnual !== undefined) {
      updates.priceAnnual = args.priceAnnual;
    }
    if (args.ringColor !== undefined) {
      updates.ringColor = args.ringColor;
    }
    if (args.benefits !== undefined) {
      updates.benefits = args.benefits;
    }
    if (args.canDM !== undefined) {
      updates.canDM = args.canDM;
    }
    if (args.subscriberLimit !== undefined) {
      updates.subscriberLimit = args.subscriberLimit;
    }
    if (args.isActive !== undefined) {
      updates.isActive = args.isActive;
    }

    await ctx.db.patch(args.tierId, updates);
    return await ctx.db.get(args.tierId);
  },
});

/** Delete a subscription tier (creator only, requires no active subscribers) */
export const deleteTier = mutation({
  args: { tierId: v.id("subscriptionTiers") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const tier = await ctx.db.get(args.tierId);
    if (!tier || tier.creatorId !== userId) {
      throw new Error("Tier not found");
    }

    if ((tier.currentSubscribers ?? 0) > 0) {
      throw new Error("Cannot delete tier with active subscribers");
    }

    await ctx.db.delete(args.tierId);
    return { success: true };
  },
});

/** Cancel a subscription at period end (subscriber only) */
export const cancel = mutation({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription || subscription.fanId !== userId) {
      throw new Error("Subscription not found");
    }

    if (subscription.status !== "active") {
      throw new Error("Subscription is not active");
    }

    await ctx.db.patch(args.subscriptionId, {
      cancelAtPeriodEnd: true,
    });

    return { success: true };
  },
});

/** Resume a canceled subscription before period end (subscriber only) */
export const resume = mutation({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription || subscription.fanId !== userId) {
      throw new Error("Subscription not found");
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new Error("Subscription is not canceled");
    }

    await ctx.db.patch(args.subscriptionId, {
      cancelAtPeriodEnd: false,
    });

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Update tier subscriber count (called by subscription lifecycle handlers) */
export const updateTierCount = internalMutation({
  args: {
    tierId: v.id("subscriptionTiers"),
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const tier = await ctx.db.get(args.tierId);
    if (!tier) return;

    await ctx.db.patch(args.tierId, {
      currentSubscribers: Math.max(0, (tier.currentSubscribers ?? 0) + args.delta),
    });
  },
});

/** Handle subscription expiry at exact period end (scheduled function) */
export const handleSubscriptionExpiry = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);

    if (!subscription) {
      return { success: false, reason: "Subscription not found" };
    }

    if (subscription.status !== "active") {
      return { success: false, reason: "Subscription not active" };
    }

    if (subscription.currentPeriodEnd > Date.now()) {
      return { success: false, reason: "Period not yet ended" };
    }

    await ctx.db.patch(args.subscriptionId, {
      expiryFunctionId: undefined,
    });

    if (subscription.cancelAtPeriodEnd) {
      await ctx.db.patch(args.subscriptionId, {
        status: "canceled",
      });

      await ctx.scheduler.runAfter(0, internal.subscriptions.updateTierCount, {
        tierId: subscription.tierId,
        delta: -1,
      });

      await ctx.scheduler.runAfter(0, internal.users.updateStats, {
        userId: subscription.creatorId,
        field: "subscribersCount",
        delta: -1,
      });

      return { success: true, action: "canceled" };
    } else {
      await ctx.db.patch(args.subscriptionId, {
        status: "past_due",
      });

      return { success: true, action: "past_due" };
    }
  },
});

/** Check for missed expired subscriptions (daily cron fallback) */
export const checkExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "active").lt("currentPeriodEnd", now))
      .take(100);

    let processed = 0;
    for (const subscription of expiredSubscriptions) {
      await ctx.scheduler.runAfter(0, internal.subscriptions.handleSubscriptionExpiry, {
        subscriptionId: subscription._id,
      });
      processed++;
    }

    return { processed, expired: expiredSubscriptions.length };
  },
});

/** Handle Stripe subscription updates via webhook */
export const handleStripeUpdate = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("paused")
    ),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      console.log(`Subscription not found: ${args.stripeSubscriptionId}`);
      return { updated: false };
    }

    const previousStatus = subscription.status;
    const updates: Partial<Doc<"subscriptions">> = {
      status: args.status,
    };

    if (args.currentPeriodStart !== undefined) {
      updates.currentPeriodStart = args.currentPeriodStart;
    }
    if (args.currentPeriodEnd !== undefined) {
      updates.currentPeriodEnd = args.currentPeriodEnd;

      if (subscription.expiryFunctionId) {
        await ctx.scheduler.cancel(subscription.expiryFunctionId);
      }

      if (args.status === "active") {
        const expiryFunctionId = await ctx.scheduler.runAt(
          args.currentPeriodEnd,
          internal.subscriptions.handleSubscriptionExpiry,
          { subscriptionId: subscription._id }
        );
        updates.expiryFunctionId = expiryFunctionId;
      } else {
        updates.expiryFunctionId = undefined;
      }
    }
    if (args.cancelAtPeriodEnd !== undefined) {
      updates.cancelAtPeriodEnd = args.cancelAtPeriodEnd;
    }

    await ctx.db.patch(subscription._id, updates);

    if (previousStatus === "active" && args.status === "canceled") {
      await ctx.scheduler.runAfter(0, internal.subscriptions.updateTierCount, {
        tierId: subscription.tierId,
        delta: -1,
      });
      await ctx.scheduler.runAfter(0, internal.users.updateStats, {
        userId: subscription.creatorId,
        field: "subscribersCount",
        delta: -1,
      });
    } else if (previousStatus !== "active" && args.status === "active") {
      await ctx.scheduler.runAfter(0, internal.subscriptions.updateTierCount, {
        tierId: subscription.tierId,
        delta: 1,
      });
      await ctx.scheduler.runAfter(0, internal.users.updateStats, {
        userId: subscription.creatorId,
        field: "subscribersCount",
        delta: 1,
      });
    }

    return { updated: true };
  },
});
