/**
 * @fileoverview Posts Module
 *
 * Core content creation and feed management.
 *
 * Features:
 *   - Create, edit, delete posts
 *   - Visibility levels (public, followers, subscribers, vip)
 *   - Locked/paid content with coin unlocks
 *   - Media attachments
 *   - Feed queries (for you, following)
 *   - Full-text search
 *   - Post pinning
 *
 * Security:
 *   - Block enforcement on post visibility
 *   - Rate limiting on post creation
 *   - Sanitized search queries
 *   - Balance verification for unlocks
 *
 * Limits:
 *   - Max content length: 5000 chars
 *   - Min unlock price: $1.00 (100 cents)
 */

import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal, api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const POST_MAX_LENGTH = 5000;
const FEED_DEFAULT_LIMIT = 20;

const visibilityValidator = v.union(
  v.literal("public"),
  v.literal("followers"),
  v.literal("subscribers"),
  v.literal("vip")
);

// ===== HELPERS =====

/** Check if user can view a post */
async function canViewPost(
  ctx: QueryCtx,
  post: Doc<"posts">,
  viewerId: Id<"users"> | null
): Promise<boolean> {
  // Author can always view their own posts
  if (viewerId && post.authorId === viewerId) {
    return true;
  }

  // SECURITY: Check if viewer is blocked by the post author
  if (viewerId) {
    const blocked = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", post.authorId).eq("blockedId", viewerId))
      .unique();
    if (blocked) {
      return false;
    }
  }

  // Public posts are visible to everyone (who isn't blocked)
  if (post.visibility === "public") {
    return true;
  }

  // Must be logged in for non-public posts
  if (!viewerId) {
    return false;
  }

  // Check follower status for follower-only posts
  if (post.visibility === "followers") {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", viewerId).eq("followingId", post.authorId))
      .unique();
    return follow !== null;
  }

  // Check subscription for subscriber-only posts
  if (post.visibility === "subscribers" || post.visibility === "vip") {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", viewerId).eq("creatorId", post.authorId))
      .first();
    return subscription?.status === "active";
  }

  return false;
}

/** Enrich post with author and engagement data */
async function enrichPost(ctx: QueryCtx, post: Doc<"posts">, viewerId: Id<"users"> | null) {
  const author = await ctx.db.get(post.authorId);
  if (!author) return null;

  let isLiked = false;
  let isBookmarked = false;
  let isUnlocked = false;

  if (viewerId) {
    const like = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", viewerId).eq("targetType", "post").eq("targetId", post._id)
      )
      .unique();
    isLiked = like !== null;

    const bookmark = await ctx.db
      .query("bookmarks")
      .withIndex("by_user_post", (q) => q.eq("userId", viewerId).eq("postId", post._id))
      .unique();
    isBookmarked = bookmark !== null;

    // Check if locked content is unlocked
    if (post.isLocked) {
      const unlock = await ctx.db
        .query("postUnlocks")
        .withIndex("by_user_post", (q) => q.eq("userId", viewerId).eq("postId", post._id))
        .unique();
      isUnlocked = unlock !== null || post.authorId === viewerId;
    }
  }

  // Get media URLs if present
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
      // DiceBear avatar fields for fallback
      dicebearSeed: author.dicebearSeed,
      dicebearBgColor: author.dicebearBgColor,
      dicebearEyes: author.dicebearEyes,
      dicebearMouth: author.dicebearMouth,
      isVerified: author.isVerified,
      role: author.role,
    },
    isLiked,
    isBookmarked,
    isUnlocked,
    mediaUrls,
    // Hide content if locked and not unlocked
    content:
      post.isLocked && !isUnlocked && viewerId !== post.authorId
        ? post.content.slice(0, 100) + "..."
        : post.content,
  };
}

// ===== MUTATIONS =====

/** Create a new post */
export const create = mutation({
  args: {
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),
    visibility: visibilityValidator,
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Rate limit check
    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "post",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Validate content
    const content = args.content.trim();
    if (!content) {
      throw new Error("Post content cannot be empty");
    }
    if (content.length > POST_MAX_LENGTH) {
      throw new Error(`Post content must be at most ${POST_MAX_LENGTH} characters`);
    }

    // Validate locked content
    if (args.isLocked && (!args.unlockPrice || args.unlockPrice < 100)) {
      throw new Error("Locked content must have a price of at least $1.00 (100 cents)");
    }

    // Validate media IDs belong to user
    if (args.mediaIds && args.mediaIds.length > 0) {
      for (const mediaId of args.mediaIds) {
        const media = await ctx.db.get(mediaId);
        if (!media || media.userId !== userId) {
          throw new Error("Invalid media ID");
        }
      }
    }

    const postId = await ctx.db.insert("posts", {
      authorId: userId,
      content,
      mediaIds: args.mediaIds,
      visibility: args.visibility,
      isLocked: args.isLocked ?? false,
      unlockPrice: args.isLocked ? args.unlockPrice : undefined,
      likesCount: 0,
      commentsCount: 0,
      viewsCount: 0,
      tipsTotal: 0,
      createdAt: Date.now(),
    });

    // Update user's post count
    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId,
      field: "postsCount",
      delta: 1,
    });

    // Fan out post to followers' feeds (materialized feed)
    await ctx.scheduler.runAfter(0, internal.feedItems.fanOutPost, {
      postId,
    });

    // Also fan out to subscribers if subscriber/vip content
    if (args.visibility === "subscribers" || args.visibility === "vip") {
      await ctx.scheduler.runAfter(0, internal.feedItems.fanOutToSubscribers, {
        postId,
      });
    }

    // Sync post digest
    await ctx.scheduler.runAfter(0, internal.postDigests.syncPostDigest, {
      postId,
    });

    return postId;
  },
});

// ===== QUERIES =====

/** Get a single post by ID */
export const getById = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const post = await ctx.db.get(args.postId);

    if (!post) {
      return null;
    }

    const canView = await canViewPost(ctx, post, viewerId);
    if (!canView) {
      return null;
    }

    return await enrichPost(ctx, post, viewerId);
  },
});

/** Get posts by a specific user */
export const getByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const limit = args.limit ?? FEED_DEFAULT_LIMIT;

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", args.userId))
      .order("desc")
      .take(limit + 1);

    const hasMore = posts.length > limit;
    const items = posts.slice(0, limit);

    // Filter by visibility and enrich
    const enrichedPosts = await Promise.all(
      items.map(async (post) => {
        const canView = await canViewPost(ctx, post, viewerId);
        if (!canView) return null;
        return await enrichPost(ctx, post, viewerId);
      })
    );

    return {
      posts: enrichedPosts.filter((p) => p !== null),
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Get feed (following or for you) */
export const getFeed = query({
  args: {
    type: v.union(v.literal("forYou"), v.literal("following")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const limit = args.limit ?? FEED_DEFAULT_LIMIT;

    if (args.type === "following" && !viewerId) {
      return { posts: [], hasMore: false };
    }

    let posts: Doc<"posts">[];

    if (args.type === "following" && viewerId) {
      // Get posts from followed users
      const follows = await ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", viewerId))
        .take(100);

      const followingIds = new Set(follows.map((f) => f.followingId));

      // Get recent posts from followed users
      const allPosts = await ctx.db
        .query("posts")
        .withIndex("by_createdAt")
        .order("desc")
        .take(limit * 5);

      posts = allPosts.filter((p) => followingIds.has(p.authorId)).slice(0, limit + 1);
    } else {
      // For You - get public posts sorted by engagement
      posts = await ctx.db
        .query("posts")
        .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
        .order("desc")
        .take(limit + 1);
    }

    const hasMore = posts.length > limit;
    const items = posts.slice(0, limit);

    const enrichedPosts = await Promise.all(
      items.map(async (post) => {
        const canView = await canViewPost(ctx, post, viewerId);
        if (!canView) return null;
        return await enrichPost(ctx, post, viewerId);
      })
    );

    return {
      posts: enrichedPosts.filter((p) => p !== null),
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Update a post */
export const update = mutation({
  args: {
    postId: v.id("posts"),
    content: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.authorId !== userId) {
      throw new Error("Not authorized to edit this post");
    }

    const updates: Partial<Doc<"posts">> = {
      updatedAt: Date.now(),
    };

    if (args.content !== undefined) {
      const content = args.content.trim();
      if (!content) {
        throw new Error("Post content cannot be empty");
      }
      if (content.length > POST_MAX_LENGTH) {
        throw new Error(`Post content must be at most ${POST_MAX_LENGTH} characters`);
      }
      updates.content = content;
    }

    if (args.visibility !== undefined) {
      updates.visibility = args.visibility;
    }

    await ctx.db.patch(args.postId, updates);
    return await ctx.db.get(args.postId);
  },
});

/** Delete a post */
export const remove = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.authorId !== userId) {
      throw new Error("Not authorized to delete this post");
    }

    // Delete associated data
    // Delete comments
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(500);
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Delete likes
    const likes = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) => q.eq("targetType", "post").eq("targetId", args.postId))
      .take(1000);
    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    // Delete bookmarks
    const bookmarks = await ctx.db
      .query("bookmarks")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(1000);
    for (const bookmark of bookmarks) {
      await ctx.db.delete(bookmark._id);
    }

    // Delete post
    await ctx.db.delete(args.postId);

    // Update user's post count
    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId,
      field: "postsCount",
      delta: -1,
    });

    // Remove from all feeds
    await ctx.scheduler.runAfter(0, internal.feedItems.removePostFromFeeds, {
      postId: args.postId,
    });

    // Remove post digest
    await ctx.scheduler.runAfter(0, internal.postDigests.deletePostDigest, {
      postId: args.postId,
    });
  },
});

/** Pin/unpin a post */
export const togglePin = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (post.authorId !== userId) {
      throw new Error("Not authorized");
    }

    // Unpin other posts if pinning this one
    if (!post.isPinned) {
      // Use compound index to efficiently find pinned posts (avoids JS filtering)
      const pinnedPosts = await ctx.db
        .query("posts")
        .withIndex("by_author_pinned", (q) => q.eq("authorId", userId).eq("isPinned", true))
        .take(10);

      for (const p of pinnedPosts) {
        await ctx.db.patch(p._id, { isPinned: false });
      }
    }

    await ctx.db.patch(args.postId, { isPinned: !post.isPinned });
  },
});

// ===== INTERNAL MUTATIONS =====

/** Record a view */
export const recordView = internalMutation({
  args: {
    postId: v.id("posts"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return;

    await ctx.db.patch(args.postId, {
      viewsCount: (post.viewsCount ?? 0) + 1,
    });
  },
});

/** Unlock locked content */
export const unlock = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }

    if (!post.isLocked || !post.unlockPrice) {
      throw new Error("Post is not locked");
    }

    // Check if already unlocked
    const existing = await ctx.db
      .query("postUnlocks")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    if (existing) {
      throw new Error("Post already unlocked");
    }

    // Check user balance
    const user = await ctx.db.get(userId);
    if (!user || (user.coinsBalance ?? 0) < post.unlockPrice) {
      throw new Error("Insufficient coin balance");
    }

    // Deduct coins from user (with safety check to prevent negative balance)
    const newUserBalance = Math.max(0, (user.coinsBalance ?? 0) - post.unlockPrice);
    await ctx.db.patch(userId, {
      coinsBalance: newUserBalance,
    });

    // Add coins to creator
    const creator = await ctx.db.get(post.authorId);
    if (creator) {
      await ctx.db.patch(post.authorId, {
        coinsBalance: (creator.coinsBalance ?? 0) + post.unlockPrice,
      });
    }

    // Create transaction records
    const sentTransaction = await ctx.db.insert("coinTransactions", {
      userId,
      type: "unlock",
      amount: -post.unlockPrice,
      relatedUserId: post.authorId,
      relatedPostId: args.postId,
      createdAt: Date.now(),
    });

    await ctx.db.insert("coinTransactions", {
      userId: post.authorId,
      type: "tip_received",
      amount: post.unlockPrice,
      relatedUserId: userId,
      relatedPostId: args.postId,
      createdAt: Date.now(),
    });

    // Create unlock record
    await ctx.db.insert("postUnlocks", {
      userId,
      postId: args.postId,
      amount: post.unlockPrice,
      transactionId: sentTransaction,
      createdAt: Date.now(),
    });

    // Update post tips total
    await ctx.db.patch(args.postId, {
      tipsTotal: (post.tipsTotal ?? 0) + post.unlockPrice,
    });

    return { success: true };
  },
});

/** Search posts implementation */
async function searchPostsImpl(
  ctx: QueryCtx,
  searchQuery: string,
  limit: number,
  viewerId: Id<"users"> | null
) {
  const posts = await ctx.db
    .query("posts")
    .withSearchIndex("search_content", (q) =>
      q.search("content", searchQuery).eq("visibility", "public")
    )
    .take(limit);

  const enrichedPosts = await Promise.all(
    posts.map(async (post) => {
      // Also filter by block status in search results
      const canView = await canViewPost(ctx, post, viewerId);
      if (!canView) return null;
      return await enrichPost(ctx, post, viewerId);
    })
  );

  return enrichedPosts.filter((p) => p !== null);
}

/** Sanitize search query */
function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[<>'"`;\\]/g, "") // Remove XSS-prone characters
    .replace(/[^\w\s@#\-_.]/g, "") // Keep only safe characters
    .slice(0, 100); // Limit length
}

// ===== INTERNAL QUERIES =====

/** Search posts (internal) */
export const searchInternal = internalQuery({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    viewerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const searchQuery = sanitizeSearchQuery(args.query);
    const limit = Math.min(args.limit ?? 20, 50); // Cap limit

    if (searchQuery.length < 2) {
      return [];
    }

    return await searchPostsImpl(ctx, searchQuery, limit, args.viewerId ?? null);
  },
});

/** Search posts (public) */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const searchQuery = sanitizeSearchQuery(args.query);
    // Unauthenticated users get lower limit
    const maxLimit = viewerId ? 50 : 20;
    const limit = Math.min(args.limit ?? 20, maxLimit);

    if (searchQuery.length < 2) {
      return [];
    }

    return await searchPostsImpl(ctx, searchQuery, limit, viewerId);
  },
});

// ===== ACTIONS =====

/** Rate-limited search action */
export const searchSecure = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      // Get user ID for rate limiting
      const user = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
        tokenIdentifier: identity.tokenIdentifier,
      });

      if (user) {
        // Check rate limit
        const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
          userId: user._id,
          action: "search",
        });

        if (!rateCheck.allowed) {
          throw new Error(
            `Search rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
          );
        }
      }
    }

    // Run the actual search (explicit type to break circular inference)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchResults: any[] = await ctx.runQuery(internal.posts.searchInternal, {
      query: args.query,
      limit: args.limit,
      viewerId: undefined,
    });

    return searchResults;
  },
});
