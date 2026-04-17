/**
 * @fileoverview Creator Payouts Module
 *
 * Manages creator earnings and payout processing via Stripe.
 *
 * Features:
 *   - Earnings summary calculation
 *   - Payout request and processing
 *   - Payout history tracking
 *   - Stripe Connect integration
 *   - Admin approval workflow
 *
 * Payout Flow:
 *   pending -> processing -> completed/failed
 *
 * Limits:
 *   - Minimum payout: $50
 *   - Platform fee: 10%
 *
 * Security:
 *   - Rate limiting on payout requests
 *   - Stripe Connect onboarding required
 *   - Balance verification before payout
 */

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";

import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const MIN_PAYOUT = 5000;
const PLATFORM_FEE_PERCENT = 10;

type PayoutStatus = "pending" | "processing" | "completed" | "failed" | "canceled";

// ===== QUERIES =====

/** Get creator's earnings summary */
export const getEarningsSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      return null;
    }

    // Calculate total earnings from tips using by_type index: [userId, type, createdAt]
    const tipTransactions = await ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) => q.eq("userId", userId).eq("type", "tip_received"))
      .take(500);

    const totalTips = tipTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Calculate earnings from active subscriptions using by_creator_status index
    const activeSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_creator_status", (q) => q.eq("creatorId", userId).eq("status", "active"))
      .take(500);

    const monthlyRecurring = activeSubscriptions.reduce((sum, s) => sum + s.priceAtSubscription, 0);

    // Calculate total earnings from unlocks using by_related_user_type index
    const unlockTransactions = await ctx.db
      .query("coinTransactions")
      .withIndex("by_related_user_type", (q) => q.eq("relatedUserId", userId).eq("type", "unlock"))
      .take(500);

    const totalUnlocks = unlockTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Get completed payouts using by_creator index
    const allPayouts = await ctx.db
      .query("payouts")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(200);

    const completedPayouts = allPayouts
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingPayouts = allPayouts
      .filter((p) => p.status === "pending" || p.status === "processing")
      .reduce((sum, p) => sum + p.amount, 0);

    // Calculate gross and net
    const grossEarnings = totalTips + totalUnlocks;
    const platformFee = Math.floor(grossEarnings * (PLATFORM_FEE_PERCENT / 100));
    const netEarnings = grossEarnings - platformFee;
    const availableBalance = netEarnings - completedPayouts - pendingPayouts;

    return {
      grossEarnings,
      platformFee,
      netEarnings,
      totalTips,
      totalUnlocks,
      monthlyRecurring,
      completedPayouts,
      pendingPayouts,
      availableBalance,
      activeSubscribers: activeSubscriptions.length,
    };
  },
});

/** Get payout history */
export const getPayoutHistory = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("canceled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .order("desc")
      .take(limit * 2);

    const filtered = args.status ? payouts.filter((p) => p.status === args.status) : payouts;

    return filtered.slice(0, limit);
  },
});

/** Get earnings by time period */
export const getEarningsByPeriod = query({
  args: {
    period: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const now = Date.now();
    const periodMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };

    const startTime = now - periodMs[args.period];

    // Get transactions in the period using by_type index: [userId, type, createdAt]
    const transactions = await ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) =>
        q.eq("userId", userId).eq("type", "tip_received").gt("createdAt", startTime)
      )
      .take(500);

    // Group by day/week
    const bucketMs = args.period === "day" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const buckets = new Map<number, number>();

    for (const tx of transactions) {
      const bucket = Math.floor(tx.createdAt / bucketMs) * bucketMs;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + tx.amount);
    }

    return Array.from(buckets.entries())
      .map(([timestamp, amount]) => ({ timestamp, amount }))
      .sort((a, b) => a.timestamp - b.timestamp);
  },
});

// ===== MUTATIONS =====

/** Request a payout */
export const requestPayout = mutation({
  args: {
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // SECURITY: Rate limit payout requests to prevent abuse
    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "payout",
    });
    if (!rateCheck.allowed) {
      throw new Error(`Too many payout requests. Try again later.`);
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to request payouts");
    }

    if (!user.stripeConnectId || !user.stripeConnectOnboarded) {
      throw new Error("Please complete Stripe Connect onboarding first");
    }

    if (args.amount < MIN_PAYOUT) {
      throw new Error(`Minimum payout is $${MIN_PAYOUT / 100}`);
    }

    // Calculate available balance using indexed queries
    const tipTransactions = await ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) => q.eq("userId", userId).eq("type", "tip_received"))
      .take(500);

    const totalTips = tipTransactions.reduce((sum, t) => sum + t.amount, 0);

    const unlockTransactions = await ctx.db
      .query("coinTransactions")
      .withIndex("by_related_user_type", (q) => q.eq("relatedUserId", userId).eq("type", "unlock"))
      .take(500);

    const totalUnlocks = unlockTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const grossEarnings = totalTips + totalUnlocks;
    const platformFee = Math.floor(grossEarnings * (PLATFORM_FEE_PERCENT / 100));
    const netEarnings = grossEarnings - platformFee;

    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(200);

    const paidOut = payouts
      .filter(
        (p) => p.status === "completed" || p.status === "pending" || p.status === "processing"
      )
      .reduce((sum, p) => sum + p.amount, 0);

    const availableBalance = netEarnings - paidOut;

    if (args.amount > availableBalance) {
      throw new Error(`Insufficient balance. Available: $${(availableBalance / 100).toFixed(2)}`);
    }

    // Create payout request
    const payoutId = await ctx.db.insert("payouts", {
      creatorId: userId,
      amount: args.amount,
      status: "pending",
      requestedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Schedule payout processing (in production, this would trigger Stripe transfer)
    await ctx.scheduler.runAfter(0, internal.payouts.processPayout, {
      payoutId,
    });

    return { payoutId };
  },
});

/** Cancel a pending payout */
export const cancelPayout = mutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.creatorId !== userId) {
      throw new Error("Payout not found");
    }

    if (payout.status !== "pending") {
      throw new Error("Can only cancel pending payouts");
    }

    await ctx.db.patch(args.payoutId, {
      status: "canceled",
    });

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Process a payout (triggered by scheduler) */
export const processPayout = internalMutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.status !== "pending") {
      return { processed: false };
    }

    // Mark as processing
    await ctx.db.patch(args.payoutId, {
      status: "processing",
    });

    // In production, this would call Stripe to initiate the transfer
    // For now, we'll schedule the completion
    await ctx.scheduler.runAfter(
      5000, // Simulate processing delay
      internal.payouts.completePayout,
      { payoutId: args.payoutId }
    );

    return { processed: true };
  },
});

/** Complete a payout */
export const completePayout = internalMutation({
  args: {
    payoutId: v.id("payouts"),
    stripeTransferId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout || payout.status !== "processing") {
      return { completed: false };
    }

    if (args.error) {
      await ctx.db.patch(args.payoutId, {
        status: "failed",
        failureReason: args.error,
      });
      return { completed: false, error: args.error };
    }

    await ctx.db.patch(args.payoutId, {
      status: "completed",
      stripeTransferId: args.stripeTransferId,
      completedAt: Date.now(),
    });

    // Log admin action
    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: payout.creatorId, // Self-action, but still log
      targetUserId: payout.creatorId,
      action: "payout_approved",
      metadata: JSON.stringify({
        payoutId: args.payoutId,
        amount: payout.amount,
      }),
    });

    return { completed: true };
  },
});

/** Handle transfer failure from Stripe webhook */
export const handleTransferFailed = internalMutation({
  args: {
    payoutId: v.id("payouts"),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) {
      console.error(`Payout not found for failed transfer: ${args.payoutId}`);
      return { updated: false };
    }

    // Only update if currently processing
    if (payout.status === "processing") {
      await ctx.db.patch(args.payoutId, {
        status: "failed",
        failureReason: args.failureReason,
      });

      // Notify creator about failed payout
      await ctx.scheduler.runAfter(0, internal.notifications.create, {
        userId: payout.creatorId,
        type: "system",
        message: `Your payout of $${(payout.amount / 100).toFixed(2)} failed: ${args.failureReason}`,
      });

      return { updated: true };
    }

    return { updated: false };
  },
});

/** Handle successful transfer from Stripe webhook */
export const handleTransferSuccess = internalMutation({
  args: {
    payoutId: v.id("payouts"),
    stripeTransferId: v.string(),
  },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) {
      console.error(`Payout not found for successful transfer: ${args.payoutId}`);
      return { updated: false };
    }

    // Only update if currently processing
    if (payout.status === "processing") {
      await ctx.db.patch(args.payoutId, {
        status: "completed",
        stripeTransferId: args.stripeTransferId,
        completedAt: Date.now(),
      });

      // Notify creator about successful payout
      await ctx.scheduler.runAfter(0, internal.notifications.create, {
        userId: payout.creatorId,
        type: "system",
        message: `Your payout of $${(payout.amount / 100).toFixed(2)} has been processed successfully!`,
      });

      return { updated: true };
    }

    return { updated: false };
  },
});

/** Admin: Approve or reject a payout */
export const adminUpdatePayout = internalMutation({
  args: {
    adminId: v.id("users"),
    payoutId: v.id("payouts"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) {
      throw new Error("Payout not found");
    }

    if (args.action === "approve") {
      await ctx.db.patch(args.payoutId, {
        status: "processing",
      });

      // Schedule transfer
      await ctx.scheduler.runAfter(0, internal.stripe.createPayoutTransfer, {
        creatorId: payout.creatorId,
        amount: payout.amount,
        payoutId: args.payoutId,
      });

      await ctx.scheduler.runAfter(0, internal.admin.logAction, {
        adminId: args.adminId,
        targetUserId: payout.creatorId,
        action: "payout_approved",
        metadata: JSON.stringify({
          payoutId: args.payoutId,
          amount: payout.amount,
        }),
      });
    } else {
      await ctx.db.patch(args.payoutId, {
        status: "failed",
        failureReason: args.reason ?? "Rejected by admin",
      });

      await ctx.scheduler.runAfter(0, internal.admin.logAction, {
        adminId: args.adminId,
        targetUserId: payout.creatorId,
        action: "payout_rejected",
        reason: args.reason,
        metadata: JSON.stringify({
          payoutId: args.payoutId,
          amount: payout.amount,
        }),
      });
    }

    return { success: true };
  },
});
