/**
 * @fileoverview Hidden Posts Module
 *
 * Allows users to hide posts from their feed.
 *
 * Features:
 *   - Hide/unhide individual posts
 *   - Unhide all posts from a specific author
 *   - Optional hide reason tracking
 *   - Get list of hidden posts
 *   - Get hidden post IDs for feed filtering
 *   - Stats on hidden posts by reason
 *
 * Hide Reasons:
 *   - not_interested: User not interested in this content
 *   - seen_too_often: Content shown too frequently
 *   - offensive: Content is offensive
 *   - other: Other reason
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

// ===== MUTATIONS =====

/** Hide a post */
export const hide = mutation({
  args: {
    postId: v.id("posts"),
    reason: v.optional(
      v.union(
        v.literal("not_interested"),
        v.literal("seen_too_often"),
        v.literal("offensive"),
        v.literal("other")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");

    const existing = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    if (existing) throw new Error("Post already hidden");

    await ctx.db.insert("hiddenPosts", {
      userId,
      postId: args.postId,
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** Unhide a post */
export const unhide = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    if (!existing) throw new Error("Post not hidden");

    await ctx.db.delete(existing._id);

    return { success: true };
  },
});

/** Unhide all posts from a specific author */
export const unhideAllFromUser = mutation({
  args: { authorId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const hiddenPosts = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    let unhiddenCount = 0;
    for (const hidden of hiddenPosts) {
      const post = await ctx.db.get(hidden.postId);
      if (post && post.authorId === args.authorId) {
        await ctx.db.delete(hidden._id);
        unhiddenCount++;
      }
    }

    return { success: true, unhiddenCount };
  },
});

// ===== QUERIES =====

/** Check if a post is hidden */
export const isHidden = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const hidden = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    return hidden !== null;
  },
});

/** Get list of hidden posts with details */
export const getHidden = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = args.limit ?? 50;

    const hiddenPosts = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    const posts = await Promise.all(
      hiddenPosts.map(async (hidden) => {
        const post = await ctx.db.get(hidden.postId);
        if (!post) return null;

        const author = await ctx.db.get(post.authorId);
        if (!author) return null;

        return {
          _id: post._id,
          content: post.content.substring(0, 100) + (post.content.length > 100 ? "..." : ""),
          hiddenAt: hidden.createdAt,
          reason: hidden.reason,
          author: {
            _id: author._id,
            username: author.username,
            displayName: author.displayName,
            avatarR2Key: author.avatarR2Key,
          },
        };
      })
    );

    return posts.filter((p) => p !== null);
  },
});

/** Get hidden post IDs for feed filtering */
export const getHiddenIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const hiddenPosts = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    return hiddenPosts.map((h) => h.postId);
  },
});

/** Get stats on hidden posts by reason */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { total: 0, byReason: {} };

    const hiddenPosts = await ctx.db
      .query("hiddenPosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    const byReason: Record<string, number> = {
      not_interested: 0,
      seen_too_often: 0,
      offensive: 0,
      other: 0,
      unspecified: 0,
    };

    for (const hidden of hiddenPosts) {
      const reason = hidden.reason ?? "unspecified";
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }

    return { total: hiddenPosts.length, byReason };
  },
});
