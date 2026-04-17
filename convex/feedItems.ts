/**
 * @fileoverview Materialized Feed System
 *
 * Fan-out-on-write architecture for O(1) feed queries.
 * When a user posts, feed items are created for all followers.
 *
 * Features:
 *   - Fan out posts to followers' feeds on creation
 *   - Fan out subscriber-only content to subscribers
 *   - Remove feed items when posts are deleted
 *   - Remove feed items when user unfollows
 *   - Sync denormalized author info on profile changes
 *   - Sync engagement counts on likes/comments
 *
 * Performance:
 *   - Single indexed query for feed reads (O(1))
 *   - Denormalized author data avoids joins
 *   - Batched processing for large follower counts
 */

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./auth";
import { batchGetInteractionStates, batchGetSubscriptionStatus } from "./batchHelpers";

const CONTENT_PREVIEW_LENGTH = 200;
const BATCH_SIZE = 100;

// ===== FAN-OUT =====

/** Fan out a new post to all followers' feeds */
export const fanOutPost = internalMutation({
  args: {
    postId: v.id("posts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return { success: false, reason: "post_not_found" };

    const author = await ctx.db.get(post.authorId);
    if (!author) return { success: false, reason: "author_not_found" };

    const followers = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", post.authorId))
      .take(BATCH_SIZE);

    const now = Date.now();
    let created = 0;

    for (const follow of followers) {
      let canView = post.visibility === "public" || post.visibility === "followers";

      if (post.visibility === "subscribers" || post.visibility === "vip") {
        const subscription = await ctx.db
          .query("subscriptions")
          .withIndex("by_fan_creator", (q) =>
            q.eq("fanId", follow.followerId).eq("creatorId", post.authorId)
          )
          .first();
        canView = subscription?.status === "active";
      }

      if (!canView) continue;

      await ctx.db.insert("feedItems", {
        userId: follow.followerId,
        postId: args.postId,
        authorId: post.authorId,
        authorUsername: author.username,
        authorDisplayName: author.displayName,
        authorAvatarR2Key: author.avatarR2Key,
        authorIsVerified: author.isVerified,
        contentPreview: post.content.slice(0, CONTENT_PREVIEW_LENGTH),
        visibility: post.visibility,
        isLocked: post.isLocked,
        hasMedia: (post.mediaIds?.length ?? 0) > 0,
        likesCount: post.likesCount ?? 0,
        commentsCount: post.commentsCount ?? 0,
        feedType: "following",
        postCreatedAt: post.createdAt,
        createdAt: now,
      });
      created++;
    }

    if (followers.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.feedItems.fanOutPost, {
        postId: args.postId,
        cursor: followers[followers.length - 1]._id,
      });
    }

    return { success: true, created };
  },
});

/** Fan out a post to subscribers' feeds */
export const fanOutToSubscribers = internalMutation({
  args: {
    postId: v.id("posts"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return { success: false, reason: "post_not_found" };

    const author = await ctx.db.get(post.authorId);
    if (!author) return { success: false, reason: "author_not_found" };

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_creator_status", (q) =>
        q.eq("creatorId", post.authorId).eq("status", "active")
      )
      .take(BATCH_SIZE);

    const now = Date.now();
    let created = 0;

    for (const sub of subscriptions) {
      const existing = await ctx.db
        .query("feedItems")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .filter((q) => q.eq(q.field("userId"), sub.fanId))
        .first();

      if (existing) continue;

      await ctx.db.insert("feedItems", {
        userId: sub.fanId,
        postId: args.postId,
        authorId: post.authorId,
        authorUsername: author.username,
        authorDisplayName: author.displayName,
        authorAvatarR2Key: author.avatarR2Key,
        authorIsVerified: author.isVerified,
        contentPreview: post.content.slice(0, CONTENT_PREVIEW_LENGTH),
        visibility: post.visibility,
        isLocked: post.isLocked,
        hasMedia: (post.mediaIds?.length ?? 0) > 0,
        likesCount: post.likesCount ?? 0,
        commentsCount: post.commentsCount ?? 0,
        feedType: "subscription",
        postCreatedAt: post.createdAt,
        createdAt: now,
      });
      created++;
    }

    if (subscriptions.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.feedItems.fanOutToSubscribers, {
        postId: args.postId,
        cursor: subscriptions[subscriptions.length - 1]._id,
      });
    }

    return { success: true, created };
  },
});

// ===== CLEANUP =====

/** Remove all feed items for a deleted post */
export const removePostFromFeeds = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(BATCH_SIZE);

    for (const item of feedItems) {
      await ctx.db.delete(item._id);
    }

    if (feedItems.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.feedItems.removePostFromFeeds, {
        postId: args.postId,
      });
    }

    return { deleted: feedItems.length };
  },
});

/** Remove feed items when user unfollows someone */
export const removeAuthorFromUserFeed = internalMutation({
  args: {
    userId: v.id("users"),
    authorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("authorId"), args.authorId))
      .take(BATCH_SIZE);

    for (const item of feedItems) {
      await ctx.db.delete(item._id);
    }

    if (feedItems.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.feedItems.removeAuthorFromUserFeed, {
        userId: args.userId,
        authorId: args.authorId,
      });
    }

    return { deleted: feedItems.length };
  },
});

// ===== SYNC =====

/** Update author info on all their feed items */
export const syncAuthorInfo = internalMutation({
  args: { authorId: v.id("users") },
  handler: async (ctx, args) => {
    const author = await ctx.db.get(args.authorId);
    if (!author) return { success: false };

    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_author", (q) => q.eq("authorId", args.authorId))
      .take(BATCH_SIZE);

    for (const item of feedItems) {
      await ctx.db.patch(item._id, {
        authorUsername: author.username,
        authorDisplayName: author.displayName,
        authorAvatarR2Key: author.avatarR2Key,
        authorIsVerified: author.isVerified,
      });
    }

    if (feedItems.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.feedItems.syncAuthorInfo, {
        authorId: args.authorId,
      });
    }

    return { updated: feedItems.length };
  },
});

/** Update engagement counts on feed items for a post */
export const syncPostCounts = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return { success: false };

    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(BATCH_SIZE);

    for (const item of feedItems) {
      await ctx.db.patch(item._id, {
        likesCount: post.likesCount ?? 0,
        commentsCount: post.commentsCount ?? 0,
      });
    }

    if (feedItems.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.feedItems.syncPostCounts, {
        postId: args.postId,
      });
    }

    return { updated: feedItems.length };
  },
});

// ===== QUERIES =====

/** Get following feed from materialized feed items */
export const getFollowingFeed = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { posts: [], nextCursor: undefined };

    const limit = Math.min(args.limit ?? 20, 50);

    let feedQuery = ctx.db
      .query("feedItems")
      .withIndex("by_user_following", (q) => q.eq("userId", userId).eq("feedType", "following"))
      .order("desc");

    const feedItems = await feedQuery.take(limit + 1);

    const filtered = args.cursor
      ? feedItems.filter((f) => f.postCreatedAt < args.cursor!)
      : feedItems;

    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    if (items.length === 0) return { posts: [], nextCursor: undefined };

    const postIds = items.map((i) => i.postId);
    const posts = await Promise.all(postIds.map((id) => ctx.db.get(id)));
    const validPosts = posts.filter((p): p is NonNullable<typeof p> => p !== null);

    const interactionMap = await batchGetInteractionStates(ctx, userId, validPosts);

    const enrichedPosts = items
      .map((item) => {
        const post = posts[items.indexOf(item)];
        if (!post) return null;

        const interactions = interactionMap.get(post._id) ?? {
          isLiked: false,
          isBookmarked: false,
          isUnlocked: !post.isLocked,
        };

        return {
          ...post,
          author: {
            _id: item.authorId,
            username: item.authorUsername,
            displayName: item.authorDisplayName,
            avatarR2Key: item.authorAvatarR2Key,
            isVerified: item.authorIsVerified,
          },
          isLiked: interactions.isLiked,
          isBookmarked: interactions.isBookmarked,
          isUnlocked: interactions.isUnlocked,
          subscriberTier: null,
        };
      })
      .filter((p) => p !== null);

    return {
      posts: enrichedPosts,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].postCreatedAt : undefined,
    };
  },
});

/** Get subscriptions feed from materialized feed items */
export const getSubscriptionsFeed = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { posts: [], nextCursor: undefined };

    const limit = Math.min(args.limit ?? 20, 50);

    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_user_following", (q) => q.eq("userId", userId).eq("feedType", "subscription"))
      .order("desc")
      .take(limit + 1);

    const filtered = args.cursor
      ? feedItems.filter((f) => f.postCreatedAt < args.cursor!)
      : feedItems;

    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    if (items.length === 0) return { posts: [], nextCursor: undefined };

    const postIds = items.map((i) => i.postId);
    const posts = await Promise.all(postIds.map((id) => ctx.db.get(id)));
    const validPosts = posts.filter((p): p is NonNullable<typeof p> => p !== null);

    const [interactionMap, subMap] = await Promise.all([
      batchGetInteractionStates(ctx, userId, validPosts),
      batchGetSubscriptionStatus(ctx, userId, [...new Set(items.map((i) => i.authorId))]),
    ]);

    const tierPromises = [...subMap.entries()]
      .filter(([, { tierId }]) => tierId)
      .map(async ([creatorId, { tierId }]) => {
        const tier = await ctx.db.get(tierId!);
        return [creatorId, tier ? { name: tier.name, ringColor: tier.ringColor } : null] as const;
      });
    const tierResults = await Promise.all(tierPromises);
    const tierMap = new Map(tierResults);

    const enrichedPosts = items
      .map((item) => {
        const post = posts[items.indexOf(item)];
        if (!post) return null;

        const interactions = interactionMap.get(post._id) ?? {
          isLiked: false,
          isBookmarked: false,
          isUnlocked: !post.isLocked,
        };

        return {
          ...post,
          author: {
            _id: item.authorId,
            username: item.authorUsername,
            displayName: item.authorDisplayName,
            avatarR2Key: item.authorAvatarR2Key,
            isVerified: item.authorIsVerified,
          },
          isLiked: interactions.isLiked,
          isBookmarked: interactions.isBookmarked,
          isUnlocked: interactions.isUnlocked,
          subscriberTier: tierMap.get(item.authorId) ?? null,
        };
      })
      .filter((p) => p !== null);

    return {
      posts: enrichedPosts,
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].postCreatedAt : undefined,
    };
  },
});
