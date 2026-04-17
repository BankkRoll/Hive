/**
 * @fileoverview Tipping and Coin Transaction System
 *
 * Handles virtual currency (coins) for tipping creators and tracking transactions.
 *
 * Features:
 *   - Send tips to creators on posts or directly
 *   - Coin balance management with purchase integration
 *   - Transaction history with filtering by type
 *   - Creator earnings analytics (daily/weekly/monthly)
 *   - Top tippers leaderboard
 *   - Configurable tip multipliers
 *
 * Limits:
 *   - Minimum tip: 1 coin
 *   - Maximum tip: 1,000,000 coins
 *   - Transaction history capped at 500 records for aggregation
 *
 * Security:
 *   - Rate limiting on tip submissions
 *   - Block relationship enforcement (cannot tip blocked users)
 *   - Stripe payment deduplication via indexed lookup
 *   - Balance cannot go negative
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MIN_TIP = 1;
const MAX_TIP = 1000000;
const TIP_MULTIPLIERS = [1, 10, 50, 100, 500, 1000];

// ===== MUTATIONS =====

/** Send a tip to a creator, optionally on a specific post */
export const sendTip = mutation({
  args: {
    creatorId: v.id("users"),
    postId: v.optional(v.id("posts")),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "tip",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    if (userId === args.creatorId) {
      throw new Error("Cannot tip yourself");
    }

    if (args.amount < MIN_TIP || args.amount > MAX_TIP) {
      throw new Error(`Tip must be between ${MIN_TIP} and ${MAX_TIP} coins`);
    }

    if (!Number.isInteger(args.amount)) {
      throw new Error("Tip amount must be a whole number");
    }

    const creator = await ctx.db.get(args.creatorId);
    if (!creator || creator.status !== "active") {
      throw new Error("Creator not found");
    }

    const blockedByCreator = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", args.creatorId).eq("blockedId", userId))
      .unique();
    if (blockedByCreator) {
      throw new Error("Cannot send tip to this user");
    }

    if (args.postId) {
      const post = await ctx.db.get(args.postId);
      if (!post || post.authorId !== args.creatorId) {
        throw new Error("Post not found");
      }
    }

    const user = await ctx.db.get(userId);
    if (!user || (user.coinsBalance ?? 0) < args.amount) {
      throw new Error("Insufficient coin balance");
    }

    const newSenderBalance = Math.max(0, (user.coinsBalance ?? 0) - args.amount);
    await ctx.db.patch(userId, {
      coinsBalance: newSenderBalance,
    });

    await ctx.db.patch(args.creatorId, {
      coinsBalance: (creator.coinsBalance ?? 0) + args.amount,
    });

    await ctx.db.insert("coinTransactions", {
      userId,
      type: "tip_sent",
      amount: -args.amount,
      relatedUserId: args.creatorId,
      relatedPostId: args.postId,
      createdAt: Date.now(),
    });

    await ctx.db.insert("coinTransactions", {
      userId: args.creatorId,
      type: "tip_received",
      amount: args.amount,
      relatedUserId: userId,
      relatedPostId: args.postId,
      createdAt: Date.now(),
    });

    if (args.postId) {
      const post = await ctx.db.get(args.postId);
      if (post) {
        await ctx.db.patch(args.postId, {
          tipsTotal: (post.tipsTotal ?? 0) + args.amount,
        });
      }
    }

    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: args.creatorId,
      type: "tip",
      actorId: userId,
      postId: args.postId,
      amount: args.amount,
    });

    return { success: true };
  },
});

// ===== QUERIES =====

/** Get the current user's coin balance */
export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return 0;
    }

    const user = await ctx.db.get(userId);
    return user?.coinsBalance ?? 0;
  },
});

/** Get transaction history with optional type filtering */
export const getTransactions = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(
      v.union(
        v.literal("purchase"),
        v.literal("tip_sent"),
        v.literal("tip_received"),
        v.literal("unlock"),
        v.literal("payout"),
        v.literal("all")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;
    const typeFilter = args.type ?? "all";

    const transactions = await ctx.db
      .query("coinTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit * 2);

    const filtered =
      typeFilter === "all" ? transactions : transactions.filter((t) => t.type === typeFilter);

    const items = filtered.slice(0, limit);

    const enriched = await Promise.all(
      items.map(async (tx) => {
        let relatedUser = null;
        if (tx.relatedUserId) {
          const user = await ctx.db.get(tx.relatedUserId);
          if (user) {
            relatedUser = {
              _id: user._id,
              username: user.username,
              displayName: user.displayName,
              avatarR2Key: user.avatarR2Key,
            };
          }
        }

        return {
          ...tx,
          relatedUser,
        };
      })
    );

    return enriched;
  },
});

/** Get tips received by a creator with period filtering */
export const getTipsReceived = query({
  args: {
    limit: v.optional(v.number()),
    period: v.optional(
      v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("all"))
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { tips: [], total: 0 };
    }

    const limit = args.limit ?? 50;
    const period = args.period ?? "all";

    let cutoff = 0;
    const now = Date.now();
    if (period === "day") cutoff = now - 24 * 60 * 60 * 1000;
    if (period === "week") cutoff = now - 7 * 24 * 60 * 60 * 1000;
    if (period === "month") cutoff = now - 30 * 24 * 60 * 60 * 1000;

    const tipsQuery = ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) => {
        const baseQuery = q.eq("userId", userId).eq("type", "tip_received");
        return period === "all" ? baseQuery : baseQuery.gt("createdAt", cutoff);
      })
      .order("desc");

    const allTipsInPeriod = await tipsQuery.take(500);
    const total = allTipsInPeriod.reduce((sum, t) => sum + t.amount, 0);

    const items = allTipsInPeriod.slice(0, limit);

    const enriched = await Promise.all(
      items.map(async (tx) => {
        let tipper = null;
        if (tx.relatedUserId) {
          const user = await ctx.db.get(tx.relatedUserId);
          if (user) {
            tipper = {
              _id: user._id,
              username: user.username,
              displayName: user.displayName,
              avatarR2Key: user.avatarR2Key,
            };
          }
        }

        return {
          ...tx,
          tipper,
        };
      })
    );

    return { tips: enriched, total };
  },
});

/** Get top tippers for a creator aggregated by total amount */
export const getTopTippers = query({
  args: {
    creatorId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = args.creatorId ?? (await getAuthUserId(ctx));
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 10;

    const tips = await ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) => q.eq("userId", userId).eq("type", "tip_received"))
      .take(500);

    const tipsByUser = new Map<Id<"users">, number>();
    for (const tip of tips) {
      if (tip.relatedUserId) {
        const current = tipsByUser.get(tip.relatedUserId) ?? 0;
        tipsByUser.set(tip.relatedUserId, current + tip.amount);
      }
    }

    const sorted = Array.from(tipsByUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const enriched = await Promise.all(
      sorted.map(async ([tipperId, total]) => {
        const user = await ctx.db.get(tipperId);
        if (!user || user.status !== "active") return null;

        return {
          user: {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarR2Key: user.avatarR2Key,
            isVerified: user.isVerified,
          },
          totalTipped: total,
        };
      })
    );

    return enriched.filter((t) => t !== null);
  },
});

/** Get available tip multiplier options */
export const getTipMultipliers = query({
  args: {},
  handler: async () => {
    return TIP_MULTIPLIERS;
  },
});

/** Get earnings summary for creators with period breakdowns */
export const getEarningsSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const earnings = await ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) => q.eq("userId", userId).eq("type", "tip_received"))
      .take(500);

    return {
      total: earnings.reduce((sum, t) => sum + t.amount, 0),
      today: earnings.filter((t) => t.createdAt >= dayAgo).reduce((sum, t) => sum + t.amount, 0),
      thisWeek: earnings
        .filter((t) => t.createdAt >= weekAgo)
        .reduce((sum, t) => sum + t.amount, 0),
      thisMonth: earnings
        .filter((t) => t.createdAt >= monthAgo)
        .reduce((sum, t) => sum + t.amount, 0),
      transactionCount: earnings.length,
    };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Add coins to user balance after successful Stripe payment */
export const addCoinsFromPayment = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    stripePaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingTransaction = await ctx.db
      .query("coinTransactions")
      .withIndex("by_stripePaymentId", (q) => q.eq("stripePaymentId", args.stripePaymentId))
      .unique();

    if (existingTransaction) {
      return { success: false, reason: "duplicate_payment" };
    }

    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { success: false, reason: "user_not_found" };
    }

    const coinsToAdd = args.amount;

    await ctx.db.patch(args.userId, {
      coinsBalance: (user.coinsBalance ?? 0) + coinsToAdd,
    });

    await ctx.db.insert("coinTransactions", {
      userId: args.userId,
      type: "purchase",
      amount: coinsToAdd,
      stripePaymentId: args.stripePaymentId,
      createdAt: Date.now(),
    });

    return { success: true, coinsAdded: coinsToAdd };
  },
});
