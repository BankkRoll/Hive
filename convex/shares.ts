/**
 * @fileoverview Share Tracking and Analytics
 *
 * Tracks when users share posts to external platforms and provides
 * analytics for creators to understand their content distribution.
 *
 * Features:
 *   - Multi-platform share tracking (Twitter, Facebook, WhatsApp, etc.)
 *   - Per-post share analytics with daily breakdowns
 *   - Creator-wide analytics across all posts
 *   - Platform distribution breakdowns with percentages
 *   - Referrer tracking for share sources
 *
 * Security:
 *   - Analytics queries verify post/creator ownership
 *   - Anonymous share tracking allowed (userId optional)
 *
 * Limits:
 *   - Post analytics: 1,000 shares per post
 *   - Creator analytics: 100 posts, 500 shares per post
 *   - Platform breakdown: 100 posts, 200 shares per post
 *   - Recent shares display: 10 items
 *   - Top posts display: 5 items
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

const platformValidator = v.union(
  v.literal("twitter"),
  v.literal("facebook"),
  v.literal("linkedin"),
  v.literal("whatsapp"),
  v.literal("telegram"),
  v.literal("email"),
  v.literal("copy_link"),
  v.literal("native_share"),
  v.literal("other")
);

// ===== MUTATIONS =====

/** Records a share event for a post to an external platform */
export const track = mutation({
  args: {
    postId: v.id("posts"),
    platform: platformValidator,
    referrer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    await ctx.db.insert("shares", {
      postId: args.postId,
      userId: userId ?? undefined,
      platform: args.platform,
      referrer: args.referrer,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// ===== QUERIES =====

/** Returns share analytics for a specific post (owner only) */
export const getPostAnalytics = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== userId) {
      return null;
    }

    const shares = await ctx.db
      .query("shares")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(1000);

    const byPlatform: Record<string, number> = {};
    for (const share of shares) {
      byPlatform[share.platform] = (byPlatform[share.platform] ?? 0) + 1;
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const byDay: Record<string, number> = {};
    for (const share of shares) {
      if (share.createdAt >= thirtyDaysAgo) {
        const day = new Date(share.createdAt).toISOString().split("T")[0];
        byDay[day] = (byDay[day] ?? 0) + 1;
      }
    }

    const recentShares = shares
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((s) => ({
        platform: s.platform,
        createdAt: s.createdAt,
        referrer: s.referrer,
      }));

    return {
      total: shares.length,
      byPlatform,
      byDay,
      recentShares,
    };
  },
});

/** Returns aggregate share analytics across all creator posts */
export const getCreatorAnalytics = query({
  args: {
    days: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      return null;
    }

    const daysBack = args.days ?? 30;
    const limit = args.limit ?? 100;
    const startTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .order("desc")
      .take(limit);

    const postIds = new Set(posts.map((p) => p._id));

    const allShares = [];
    for (const post of posts) {
      const shares = await ctx.db
        .query("shares")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .take(500);
      allShares.push(...shares);
    }

    const recentShares = allShares.filter((s) => s.createdAt >= startTime);

    const byPlatform: Record<string, number> = {};
    for (const share of recentShares) {
      byPlatform[share.platform] = (byPlatform[share.platform] ?? 0) + 1;
    }

    const byDay: Record<string, number> = {};
    for (const share of recentShares) {
      const day = new Date(share.createdAt).toISOString().split("T")[0];
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    const sharesByPost: Record<string, number> = {};
    for (const share of recentShares) {
      const postIdStr = share.postId.toString();
      sharesByPost[postIdStr] = (sharesByPost[postIdStr] ?? 0) + 1;
    }

    const topPosts = await Promise.all(
      Object.entries(sharesByPost)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(async ([postIdStr, count]) => {
          const postId = posts.find((p) => p._id.toString() === postIdStr)?._id;
          if (!postId) return null;
          const post = await ctx.db.get(postId);
          if (!post) return null;
          return {
            _id: post._id,
            content: post.content.substring(0, 50) + (post.content.length > 50 ? "..." : ""),
            shares: count,
          };
        })
    );

    return {
      totalShares: recentShares.length,
      totalSharesAllTime: allShares.length,
      postsAnalyzed: posts.length,
      byPlatform,
      byDay,
      topPosts: topPosts.filter((p) => p !== null),
      period: {
        start: new Date(startTime).toISOString(),
        end: new Date().toISOString(),
        days: daysBack,
      },
    };
  },
});

/** Returns share counts grouped by platform with percentages */
export const getPlatformBreakdown = query({
  args: { postId: v.optional(v.id("posts")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    let shares;

    if (args.postId) {
      const postId = args.postId;
      const post = await ctx.db.get(postId);
      if (!post || post.authorId !== userId) {
        return null;
      }

      shares = await ctx.db
        .query("shares")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .take(1000);
    } else {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_author", (q) => q.eq("authorId", userId))
        .take(100);

      shares = [];
      for (const post of posts) {
        const postShares = await ctx.db
          .query("shares")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .take(200);
        shares.push(...postShares);
      }
    }

    const platformCounts: Record<string, number> = {};
    const platformNames: Record<string, string> = {
      twitter: "Twitter/X",
      facebook: "Facebook",
      linkedin: "LinkedIn",
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      email: "Email",
      copy_link: "Copy Link",
      native_share: "Native Share",
      other: "Other",
    };

    for (const share of shares) {
      platformCounts[share.platform] = (platformCounts[share.platform] ?? 0) + 1;
    }

    const total = shares.length;
    const breakdown = Object.entries(platformCounts)
      .map(([platform, count]) => ({
        platform,
        name: platformNames[platform] ?? platform,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      breakdown,
    };
  },
});
