/**
 * @fileoverview Post Digests Module
 *
 * Lightweight post summaries for efficient feed queries.
 *
 * Features:
 *   - Denormalized author data (username, avatar, verification)
 *   - Post content previews (200 chars)
 *   - Engagement counts (likes, comments)
 *   - Avoids N+1 joins on hot feed paths
 *
 * Usage:
 *   - syncPostDigest() after creating/updating a post
 *   - syncAuthorDigests() after updating user profile
 *   - deletePostDigest() when deleting a post
 */

import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

const CONTENT_PREVIEW_LENGTH = 200;

// ===== INTERNAL MUTATIONS =====

/** Create or update a post digest */
export const syncPostDigest = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return { success: false, reason: "post_not_found" };

    const author = await ctx.db.get(post.authorId);
    if (!author) return { success: false, reason: "author_not_found" };

    // Check if digest already exists
    const existingDigest = await ctx.db
      .query("postDigests")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .unique();

    const digestData = {
      postId: args.postId,
      authorId: post.authorId,
      // Denormalized author fields
      authorUsername: author.username,
      authorDisplayName: author.displayName,
      authorAvatarR2Key: author.avatarR2Key,
      authorIsVerified: author.isVerified,
      authorRole: author.role,
      // Post summary
      contentPreview: post.content.slice(0, CONTENT_PREVIEW_LENGTH),
      visibility: post.visibility,
      isLocked: post.isLocked,
      hasMedia: (post.mediaIds?.length ?? 0) > 0,
      mediaCount: post.mediaIds?.length ?? 0,
      // Engagement counts
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      // Timestamps
      createdAt: post.createdAt,
      updatedAt: Date.now(),
    };

    if (existingDigest) {
      await ctx.db.patch(existingDigest._id, digestData);
      return { success: true, action: "updated", digestId: existingDigest._id };
    } else {
      const digestId = await ctx.db.insert("postDigests", digestData);
      return { success: true, action: "created", digestId };
    }
  },
});

/** Delete a post digest */
export const deletePostDigest = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const digest = await ctx.db
      .query("postDigests")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .unique();

    if (digest) {
      await ctx.db.delete(digest._id);
      return { success: true };
    }
    return { success: false, reason: "digest_not_found" };
  },
});

/** Update all digests for a user when their profile changes */
export const syncAuthorDigests = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { success: false, reason: "user_not_found" };

    // Get all digests for this author
    const digests = await ctx.db
      .query("postDigests")
      .withIndex("by_author", (q) => q.eq("authorId", args.userId))
      .take(100); // Process in batches

    let updated = 0;
    for (const digest of digests) {
      await ctx.db.patch(digest._id, {
        authorUsername: user.username,
        authorDisplayName: user.displayName,
        authorAvatarR2Key: user.avatarR2Key,
        authorIsVerified: user.isVerified,
        authorRole: user.role,
        updatedAt: Date.now(),
      });
      updated++;
    }

    // If there are more, schedule continuation
    if (digests.length === 100) {
      await ctx.scheduler.runAfter(0, internal.postDigests.syncAuthorDigests, {
        userId: args.userId,
      });
    }

    return { success: true, updated };
  },
});

/** Sync engagement counts on digests */
export const syncDigestCounts = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return { success: false };

    const digest = await ctx.db
      .query("postDigests")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .unique();

    if (digest) {
      await ctx.db.patch(digest._id, {
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        updatedAt: Date.now(),
      });
      return { success: true };
    }
    return { success: false, reason: "digest_not_found" };
  },
});

// ===== QUERIES =====

/** Get public post digests for "For You" feed */
export const getPublicDigests = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50);

    const digests = await ctx.db
      .query("postDigests")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .order("desc")
      .take(limit + 1);

    // Filter by cursor if provided
    const filtered = args.cursor ? digests.filter((d) => d.createdAt < args.cursor!) : digests;

    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    return {
      digests: items,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].createdAt : undefined,
    };
  },
});

/** Get digests by author for profile page */
export const getAuthorDigests = query({
  args: {
    authorId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50);

    const digests = await ctx.db
      .query("postDigests")
      .withIndex("by_author", (q) => q.eq("authorId", args.authorId))
      .order("desc")
      .take(limit);

    return digests;
  },
});
