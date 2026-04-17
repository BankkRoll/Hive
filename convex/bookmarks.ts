/**
 * @fileoverview Post Bookmarks Module
 *
 * Allows users to save posts for later viewing.
 *
 * Features:
 *   - Add/remove/toggle bookmarks
 *   - Check bookmark status
 *   - Get all bookmarked posts
 *   - Clear all bookmarks
 */

import type { Doc, Id } from "./_generated/dataModel";
import { QueryCtx, mutation, query } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { v } from "convex/values";

const DEFAULT_LIMIT = 20;

// ===== HELPERS =====

/** Enrich a bookmarked post with author data */
async function enrichBookmarkedPost(ctx: QueryCtx, post: Doc<"posts">, viewerId: Id<"users">) {
  const author = await ctx.db.get(post.authorId);
  if (!author || author.status !== "active") return null;

  let mediaUrls: string[] = [];
  if (post.mediaIds && post.mediaIds.length > 0) {
    const mediaPromises = post.mediaIds.map(async (mediaId) => {
      const media = await ctx.db.get(mediaId);
      if (media?.storageId) {
        return await ctx.storage.getUrl(media.storageId);
      }
      return null;
    });
    mediaUrls = (await Promise.all(mediaPromises)).filter((url): url is string => url !== null);
  }

  return {
    ...post,
    author: {
      _id: author._id,
      username: author.username,
      displayName: author.displayName,
      avatarR2Key: author.avatarR2Key,
      dicebearSeed: author.dicebearSeed,
      dicebearBgColor: author.dicebearBgColor,
      dicebearEyes: author.dicebearEyes,
      dicebearMouth: author.dicebearMouth,
      isVerified: author.isVerified,
    },
    mediaUrls,
    isBookmarked: true,
  };
}

// ===== MUTATIONS =====

/** Add a bookmark */
export const add = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");

    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    if (existing) throw new Error("Post already bookmarked");

    await ctx.db.insert("bookmarks", {
      userId,
      postId: args.postId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/** Remove a bookmark */
export const remove = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    if (!existing) throw new Error("Bookmark not found");

    await ctx.db.delete(existing._id);

    return { success: true };
  },
});

/** Toggle bookmark status */
export const toggle = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { bookmarked: false };
    } else {
      const post = await ctx.db.get(args.postId);
      if (!post) throw new Error("Post not found");

      await ctx.db.insert("bookmarks", {
        userId,
        postId: args.postId,
        createdAt: Date.now(),
      });
      return { bookmarked: true };
    }
  },
});

/** Clear all bookmarks */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    return { deleted: bookmarks.length };
  },
});

// ===== QUERIES =====

/** Check if a post is bookmarked */
export const isBookmarked = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const bookmark = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    return bookmark !== null;
  },
});

/** Get user's bookmarked posts */
export const getAll = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { posts: [], hasMore: false };

    const limit = args.limit ?? DEFAULT_LIMIT;

    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit + 1);

    const hasMore = bookmarks.length > limit;
    const items = bookmarks.slice(0, limit);

    const posts = await Promise.all(
      items.map(async (bookmark) => {
        const post = await ctx.db.get(bookmark.postId);
        if (!post) return null;

        const enriched = await enrichBookmarkedPost(ctx, post, userId);
        if (!enriched) return null;

        return {
          ...enriched,
          bookmarkedAt: bookmark.createdAt,
        };
      })
    );

    return {
      posts: posts.filter((p) => p !== null),
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Get bookmark count for current user */
export const getCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    return bookmarks.length;
  },
});
