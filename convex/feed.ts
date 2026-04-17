/**
 * @fileoverview Feed Queries Module
 *
 * Optimized feed queries using batch helpers to minimize database reads.
 *
 * Feed Types:
 *   - For You: Algorithmic feed based on engagement scores
 *   - Following: Posts from followed users (uses materialized feedItems)
 *   - Subscriptions: Posts from subscribed creators
 *   - Trending: High-engagement posts within time window
 *   - Discover: Curated public posts for discovery
 *   - Hashtag: Posts matching a search term
 *
 * Performance:
 *   - Batch visibility checks to avoid N+1 queries
 *   - Batch author lookups with deduplication
 *   - Batch interaction state lookups (likes, bookmarks, unlocks)
 *   - Batch subscription tier lookups
 *   - Uses materialized feedItems for O(1) following/subscription feeds
 */

import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";
import {
  batchGetAuthors,
  batchCheckVisibility,
  batchGetInteractionStates,
  batchGetSubscriptionStatus,
  type PublicAuthor,
} from "./batchHelpers";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// ===== TYPES =====

type EnrichedFeedPost = {
  _id: Id<"posts">;
  _creationTime: number;
  authorId: Id<"users">;
  content: string;
  mediaIds?: Id<"media">[];
  visibility: "public" | "followers" | "subscribers" | "vip";
  isLocked?: boolean;
  unlockPrice?: number;
  likesCount?: number;
  commentsCount?: number;
  viewsCount?: number;
  tipsTotal?: number;
  isPinned?: boolean;
  createdAt: number;
  updatedAt?: number;
  author: PublicAuthor;
  isLiked: boolean;
  isBookmarked: boolean;
  subscriberTier: { name: string; ringColor?: string } | null;
};

// ===== BATCH ENRICHMENT =====

/** Batch enrich posts for feed display */
async function batchEnrichFeedPosts(
  ctx: QueryCtx,
  posts: Doc<"posts">[],
  viewerId: Id<"users"> | null
): Promise<EnrichedFeedPost[]> {
  if (posts.length === 0) return [];

  const visibilityMap = await batchCheckVisibility(ctx, posts, viewerId);
  const visiblePosts = posts.filter((p) => visibilityMap.get(p._id) === true);
  if (visiblePosts.length === 0) return [];

  const authorIds = visiblePosts.map((p) => p.authorId);
  const authorMap = await batchGetAuthors(ctx, authorIds);

  let interactionMap = new Map<
    string,
    { isLiked: boolean; isBookmarked: boolean; isUnlocked: boolean }
  >();
  if (viewerId) {
    interactionMap = await batchGetInteractionStates(ctx, viewerId, visiblePosts);
  }

  let tierMap = new Map<string, { name: string; ringColor?: string } | null>();
  if (viewerId) {
    const otherAuthorIds = [
      ...new Set(visiblePosts.filter((p) => p.authorId !== viewerId).map((p) => p.authorId)),
    ];

    if (otherAuthorIds.length > 0) {
      const subMap = await batchGetSubscriptionStatus(ctx, viewerId, otherAuthorIds);

      const tierPromises: Promise<[string, { name: string; ringColor?: string } | null]>[] = [];
      for (const [creatorId, { isSubscribed, tierId }] of subMap) {
        if (isSubscribed && tierId) {
          tierPromises.push(
            ctx.db
              .get(tierId)
              .then((tier) => [
                creatorId,
                tier ? { name: tier.name, ringColor: tier.ringColor } : null,
              ])
          );
        } else {
          tierMap.set(creatorId, null);
        }
      }

      const tierResults = await Promise.all(tierPromises);
      for (const [creatorId, tier] of tierResults) {
        tierMap.set(creatorId, tier);
      }
    }
  }

  const enrichedPosts: EnrichedFeedPost[] = [];
  for (const post of visiblePosts) {
    const author = authorMap.get(post.authorId);
    if (!author) continue;

    const interactions = interactionMap.get(post._id) ?? {
      isLiked: false,
      isBookmarked: false,
      isUnlocked: !post.isLocked,
    };

    enrichedPosts.push({
      ...post,
      author,
      isLiked: interactions.isLiked,
      isBookmarked: interactions.isBookmarked,
      subscriberTier: tierMap.get(post.authorId) ?? null,
    });
  }

  return enrichedPosts;
}

// ===== LEGACY HELPERS =====

/** Check if viewer can see a post */
async function canViewPost(
  ctx: QueryCtx,
  post: Doc<"posts">,
  viewerId: Id<"users"> | null
): Promise<boolean> {
  if (viewerId && post.authorId === viewerId) return true;
  if (post.visibility === "public") return true;
  if (!viewerId) return false;

  if (post.visibility === "followers") {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", viewerId).eq("followingId", post.authorId))
      .unique();
    return follow !== null;
  }

  if (post.visibility === "subscribers" || post.visibility === "vip") {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", viewerId).eq("creatorId", post.authorId))
      .first();
    return subscription?.status === "active";
  }

  return false;
}

/** Enrich a single post with author and interaction data */
async function enrichPost(ctx: QueryCtx, post: Doc<"posts">, viewerId: Id<"users"> | null) {
  const author = await ctx.db.get(post.authorId);
  if (!author || author.status !== "active") return null;

  let isLiked = false;
  let isBookmarked = false;

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
  }

  let subscriberTier = null;
  if (viewerId && viewerId !== post.authorId) {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", viewerId).eq("creatorId", post.authorId))
      .first();

    if (subscription?.status === "active") {
      const tier = await ctx.db.get(subscription.tierId);
      if (tier) {
        subscriberTier = { name: tier.name, ringColor: tier.ringColor };
      }
    }
  }

  return {
    ...post,
    author: {
      _id: author._id,
      username: author.username,
      displayName: author.displayName,
      avatarR2Key: author.avatarR2Key,
      isVerified: author.isVerified,
      role: author.role,
    },
    isLiked,
    isBookmarked,
    subscriberTier,
  };
}

// ===== FEED QUERIES =====

/** Get "For You" algorithmic feed */
export const getForYouFeed = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const postsQuery = ctx.db
      .query("posts")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .order("desc");

    const recentPosts = await postsQuery.take(args.cursor ? limit * 5 : limit * 3);

    const filteredPosts = args.cursor
      ? recentPosts.filter((p) => p.createdAt < args.cursor!)
      : recentPosts;

    const scoredPosts = filteredPosts.map((post) => ({
      post,
      score:
        (post.likesCount ?? 0) * 3 +
        (post.commentsCount ?? 0) * 2 +
        (post.viewsCount ?? 0) * 0.1 +
        (post.tipsTotal ?? 0) * 5,
    }));

    scoredPosts.sort((a, b) => b.score - a.score);

    const topPosts = scoredPosts.slice(0, limit).map((s) => s.post);
    const enrichedPosts = await batchEnrichFeedPosts(ctx, topPosts, userId);
    const oldestPost = topPosts[topPosts.length - 1];

    return {
      posts: enrichedPosts,
      nextCursor: enrichedPosts.length === limit && oldestPost ? oldestPost.createdAt : undefined,
    };
  },
});

/** Get "Following" feed from materialized feedItems */
export const getFollowingFeed = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { posts: [], nextCursor: undefined };

    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const feedItems = await ctx.db
      .query("feedItems")
      .withIndex("by_user_following", (q) => q.eq("userId", userId).eq("feedType", "following"))
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
            username: item.authorUsername ?? "",
            displayName: item.authorDisplayName ?? "",
            avatarR2Key: item.authorAvatarR2Key,
            isVerified: item.authorIsVerified ?? false,
          },
          isLiked: interactions.isLiked,
          isBookmarked: interactions.isBookmarked,
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

/** Check for new posts since timestamp */
export const checkNewPosts = query({
  args: {
    feedType: v.union(v.literal("for_you"), v.literal("following")),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (args.feedType === "following") {
      if (!userId) return { count: 0 };

      const newFeedItems = await ctx.db
        .query("feedItems")
        .withIndex("by_user_following", (q) => q.eq("userId", userId).eq("feedType", "following"))
        .order("desc")
        .take(100);

      const count = newFeedItems.filter((f) => f.postCreatedAt > args.since).length;
      return { count: Math.min(count, 99) };
    }

    const newPosts = await ctx.db
      .query("posts")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .order("desc")
      .take(20);

    const count = newPosts.filter((p) => p.createdAt > args.since).length;
    return { count: Math.min(count, 99) };
  },
});

/** Get "Subscriptions" feed from materialized feedItems */
export const getSubscriptionsFeed = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { posts: [], nextCursor: undefined };

    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

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
            username: item.authorUsername ?? "",
            displayName: item.authorDisplayName ?? "",
            avatarR2Key: item.authorAvatarR2Key,
            isVerified: item.authorIsVerified ?? false,
          },
          isLiked: interactions.isLiked,
          isBookmarked: interactions.isBookmarked,
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

/** Get trending posts */
export const getTrending = query({
  args: {
    limit: v.optional(v.number()),
    timeWindow: v.optional(v.union(v.literal("day"), v.literal("week"), v.literal("month"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const now = Date.now();
    const windowMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };
    const cutoff = now - (windowMs[args.timeWindow ?? "week"] ?? windowMs.week);

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .order("desc")
      .take(200);

    const filteredPosts = posts
      .filter((p) => p.createdAt >= cutoff)
      .map((post) => ({
        post,
        score:
          ((post.likesCount ?? 0) * 3 +
            (post.commentsCount ?? 0) * 5 +
            (post.tipsTotal ?? 0) * 10) /
          Math.max(1, (now - post.createdAt) / (60 * 60 * 1000)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const enriched = await Promise.all(
      filteredPosts.map(async ({ post }) => await enrichPost(ctx, post, userId))
    );

    return { posts: enriched.filter((p) => p !== null) };
  },
});

/** Get discover feed for non-authenticated users */
export const getDiscover = query({
  args: {
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const verifiedCreators = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "creator"))
      .take(50);

    const verifiedIds = verifiedCreators
      .filter((c) => c.isVerified && c.status === "active")
      .map((c) => c._id);

    const allPosts: Doc<"posts">[] = [];

    for (const creatorId of verifiedIds.slice(0, 20)) {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_author", (q) => q.eq("authorId", creatorId))
        .order("desc")
        .take(5);
      allPosts.push(...posts.filter((p) => p.visibility === "public" && !p.isLocked));
    }

    const recentPublic = await ctx.db
      .query("posts")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .order("desc")
      .take(50);

    allPosts.push(...recentPublic.filter((p) => !p.isLocked));

    const uniquePosts = Array.from(new Map(allPosts.map((p) => [p._id, p])).values());

    const sorted = uniquePosts
      .sort(
        (a, b) =>
          (b.likesCount ?? 0) +
          (b.commentsCount ?? 0) -
          (a.likesCount ?? 0) -
          (a.commentsCount ?? 0)
      )
      .slice(0, limit);

    const enriched = await Promise.all(
      sorted.map(async (post) => await enrichPost(ctx, post, userId))
    );

    return { posts: enriched.filter((p) => p !== null) };
  },
});

/** Get posts by hashtag */
export const getByHashtag = query({
  args: {
    hashtag: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const hashtag = args.hashtag.startsWith("#") ? args.hashtag : `#${args.hashtag}`;

    const posts = await ctx.db
      .query("posts")
      .withSearchIndex("search_content", (q) =>
        q.search("content", hashtag).eq("visibility", "public")
      )
      .take(limit);

    const enriched = await Promise.all(
      posts.map(async (post) => {
        if (!(await canViewPost(ctx, post, userId))) return null;
        return await enrichPost(ctx, post, userId);
      })
    );

    return { posts: enriched.filter((p) => p !== null) };
  },
});
