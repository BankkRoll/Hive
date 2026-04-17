/**
 * @fileoverview Creator Analytics Module
 *
 * Provides analytics and insights for content creators to track performance,
 * audience growth, and revenue metrics.
 *
 * Features:
 *   - Dashboard stats (posts, views, likes, comments, followers, revenue)
 *   - Follower/subscriber growth over time
 *   - Top performing posts and supporters
 *   - Engagement metrics by time of day
 *   - Content type performance comparison
 *   - Revenue breakdown (tips, unlocks, subscriptions)
 *
 * Security: All queries require authentication. Creators can only view their own analytics.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "./auth";
import type { Id } from "./_generated/dataModel";

// ===== DASHBOARD =====

/** Get overview stats for creator dashboard */
export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .take(1000);

    const totalPosts = posts.length;
    const totalViews = posts.reduce((sum, p) => sum + (p.viewsCount ?? 0), 0);
    const totalLikes = posts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0);
    const totalComments = posts.reduce((sum, p) => sum + (p.commentsCount ?? 0), 0);

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentPosts = posts.filter((p) => p.createdAt >= weekAgo);
    const recentViews = recentPosts.reduce((sum, p) => sum + (p.viewsCount ?? 0), 0);
    const recentLikes = recentPosts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0);

    const followers = user.followersCount ?? 0;
    const following = user.followingCount ?? 0;

    let subscribers = 0;
    let monthlyRevenue = 0;
    if (user.role === "creator") {
      subscribers = user.subscribersCount ?? 0;

      const activeSubscriptions = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator_status", (q) => q.eq("creatorId", userId).eq("status", "active"))
        .collect();

      monthlyRevenue = activeSubscriptions.reduce((sum, s) => sum + s.priceAtSubscription, 0);
    }

    return {
      totalPosts,
      totalViews,
      totalLikes,
      totalComments,
      recentViews,
      recentLikes,
      followers,
      following,
      subscribers,
      monthlyRevenue,
      engagementRate: totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0,
    };
  },
});

// ===== GROWTH METRICS =====

/** Get follower growth over time period */
export const getFollowerGrowth = query({
  args: {
    period: v.union(v.literal("week"), v.literal("month"), v.literal("year")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const periodMs = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };

    const startTime = now - periodMs[args.period];

    const recentFollows = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", userId).gt("createdAt", startTime))
      .collect();

    const dayMs = 24 * 60 * 60 * 1000;
    const buckets = new Map<number, number>();

    for (const follow of recentFollows) {
      const bucket = Math.floor(follow.createdAt / dayMs) * dayMs;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    return Array.from(buckets.entries())
      .map(([timestamp, count]) => ({ timestamp, count }))
      .sort((a, b) => a.timestamp - b.timestamp);
  },
});

/** Get subscriber growth over time period */
export const getSubscriberGrowth = query({
  args: {
    period: v.union(v.literal("week"), v.literal("month"), v.literal("year")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const periodMs = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };

    const startTime = now - periodMs[args.period];

    const recentSubs = await ctx.db
      .query("subscriptions")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId).gt("createdAt", startTime))
      .collect();

    const dayMs = 24 * 60 * 60 * 1000;
    const buckets = new Map<number, { gained: number; lost: number }>();

    for (const sub of recentSubs) {
      const bucket = Math.floor(sub.createdAt / dayMs) * dayMs;
      const current = buckets.get(bucket) ?? { gained: 0, lost: 0 };

      if (sub.status === "active" || sub.status === "trialing") {
        current.gained++;
      } else if (sub.status === "canceled") {
        current.lost++;
      }

      buckets.set(bucket, current);
    }

    return Array.from(buckets.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        gained: data.gained,
        lost: data.lost,
        net: data.gained - data.lost,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  },
});

// ===== TOP CONTENT & SUPPORTERS =====

/** Get top performing posts by metric */
export const getTopPosts = query({
  args: {
    sortBy: v.union(
      v.literal("views"),
      v.literal("likes"),
      v.literal("comments"),
      v.literal("tips")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = args.limit ?? 10;

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .take(500);

    const sortFn = {
      views: (p: (typeof posts)[0]) => p.viewsCount ?? 0,
      likes: (p: (typeof posts)[0]) => p.likesCount ?? 0,
      comments: (p: (typeof posts)[0]) => p.commentsCount ?? 0,
      tips: (p: (typeof posts)[0]) => p.tipsTotal ?? 0,
    };

    const sorted = posts.sort((a, b) => sortFn[args.sortBy](b) - sortFn[args.sortBy](a));

    return sorted.slice(0, limit).map((p) => ({
      _id: p._id,
      content: p.content.slice(0, 100),
      visibility: p.visibility,
      viewsCount: p.viewsCount ?? 0,
      likesCount: p.likesCount ?? 0,
      commentsCount: p.commentsCount ?? 0,
      tipsTotal: p.tipsTotal ?? 0,
      createdAt: p.createdAt,
    }));
  },
});

/** Get top supporters by tips given */
export const getTopSupporters = query({
  args: {
    limit: v.optional(v.number()),
    period: v.optional(
      v.union(v.literal("week"), v.literal("month"), v.literal("year"), v.literal("all"))
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = args.limit ?? 10;
    const now = Date.now();
    const periodMs = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
      all: Infinity,
    };

    const startTime = args.period === "all" ? 0 : now - periodMs[args.period ?? "all"];

    const tips = await ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) =>
        q.eq("userId", userId).eq("type", "tip_received").gt("createdAt", startTime)
      )
      .collect();

    const supporterTotals = new Map<Id<"users">, number>();
    for (const tip of tips) {
      if (tip.relatedUserId) {
        const current = supporterTotals.get(tip.relatedUserId) ?? 0;
        supporterTotals.set(tip.relatedUserId, current + tip.amount);
      }
    }

    const topSupporterIds = Array.from(supporterTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const supporters = await Promise.all(
      topSupporterIds.map(async ([supporterId, totalTips]) => {
        const user = await ctx.db.get(supporterId);
        if (!user) return null;

        const subscription = await ctx.db
          .query("subscriptions")
          .withIndex("by_fan_creator", (q) => q.eq("fanId", supporterId).eq("creatorId", userId))
          .first();

        return {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatarR2Key: user.avatarR2Key,
          totalTips,
          isSubscribed: subscription?.status === "active",
        };
      })
    );

    return supporters.filter((s) => s !== null);
  },
});

// ===== ENGAGEMENT ANALYSIS =====

/** Get engagement metrics grouped by hour of day */
export const getEngagementByTime = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .take(500);

    const hourlyEngagement = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      posts: 0,
      totalLikes: 0,
      totalComments: 0,
      avgEngagement: 0,
    }));

    for (const post of posts) {
      const hour = new Date(post.createdAt).getUTCHours();
      hourlyEngagement[hour].posts++;
      hourlyEngagement[hour].totalLikes += post.likesCount ?? 0;
      hourlyEngagement[hour].totalComments += post.commentsCount ?? 0;
    }

    for (const h of hourlyEngagement) {
      if (h.posts > 0) {
        h.avgEngagement = (h.totalLikes + h.totalComments) / h.posts;
      }
    }

    return hourlyEngagement;
  },
});

/** Get performance stats by content type */
export const getContentTypePerformance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .take(1000);

    const categories = {
      text_only: { count: 0, likes: 0, comments: 0, views: 0 },
      with_image: { count: 0, likes: 0, comments: 0, views: 0 },
      with_video: { count: 0, likes: 0, comments: 0, views: 0 },
      locked: { count: 0, likes: 0, comments: 0, views: 0 },
    };

    for (const post of posts) {
      let category: keyof typeof categories = "text_only";

      if (post.isLocked) {
        category = "locked";
      } else if (post.mediaIds && post.mediaIds.length > 0) {
        category = "with_image";
      }

      categories[category].count++;
      categories[category].likes += post.likesCount ?? 0;
      categories[category].comments += post.commentsCount ?? 0;
      categories[category].views += post.viewsCount ?? 0;
    }

    return Object.entries(categories).map(([type, stats]) => ({
      type,
      ...stats,
      avgEngagement: stats.count > 0 ? (stats.likes + stats.comments) / stats.count : 0,
    }));
  },
});

// ===== REVENUE =====

/** Get revenue breakdown by source */
export const getRevenueBreakdown = query({
  args: {
    period: v.union(v.literal("week"), v.literal("month"), v.literal("year")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") return null;

    const now = Date.now();
    const periodMs = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };

    const startTime = now - periodMs[args.period];

    const tips = await ctx.db
      .query("coinTransactions")
      .withIndex("by_type", (q) =>
        q.eq("userId", userId).eq("type", "tip_received").gt("createdAt", startTime)
      )
      .collect();

    const tipRevenue = tips.reduce((sum, t) => sum + t.amount, 0);

    const unlocks = await ctx.db
      .query("coinTransactions")
      .withIndex("by_related_user_type", (q) =>
        q.eq("relatedUserId", userId).eq("type", "unlock").gt("createdAt", startTime)
      )
      .collect();

    const unlockRevenue = unlocks.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const activeSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_creator_status", (q) => q.eq("creatorId", userId).eq("status", "active"))
      .collect();

    const subscriptionRevenue = activeSubscriptions.reduce(
      (sum, s) => sum + s.priceAtSubscription,
      0
    );

    const totalRevenue = tipRevenue + unlockRevenue + subscriptionRevenue;

    return {
      tips: {
        amount: tipRevenue,
        percentage: totalRevenue > 0 ? (tipRevenue / totalRevenue) * 100 : 0,
        count: tips.length,
      },
      unlocks: {
        amount: unlockRevenue,
        percentage: totalRevenue > 0 ? (unlockRevenue / totalRevenue) * 100 : 0,
        count: unlocks.length,
      },
      subscriptions: {
        amount: subscriptionRevenue,
        percentage: totalRevenue > 0 ? (subscriptionRevenue / totalRevenue) * 100 : 0,
        count: activeSubscriptions.length,
      },
      total: totalRevenue,
    };
  },
});
