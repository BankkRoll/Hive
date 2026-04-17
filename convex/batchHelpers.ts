/**
 * @fileoverview Batch Helpers for Efficient Data Lookups
 *
 * Reduces N+1 query patterns by batching lookups and deduplicating IDs.
 * Use these in query handlers instead of individual lookups per item.
 *
 * Optimizes:
 *   - Author lookups for posts
 *   - Like/bookmark/unlock status checks
 *   - Subscription status checks
 *   - Follow status checks
 *   - Block status checks
 *   - Post enrichment and visibility checks
 */

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ===== TYPES =====

export type PublicAuthor = {
  _id: Id<"users">;
  username?: string;
  displayName?: string;
  avatarR2Key?: string;
  dicebearSeed?: string;
  dicebearBgColor?: string;
  dicebearEyes?: string;
  dicebearMouth?: string;
  isVerified?: boolean;
  role?: string;
};

export type PostInteractionState = {
  isLiked: boolean;
  isBookmarked: boolean;
  isUnlocked: boolean;
};

export type EnrichedPost = Doc<"posts"> & {
  author: PublicAuthor;
  isLiked: boolean;
  isBookmarked: boolean;
  isUnlocked: boolean;
  mediaUrls?: string[];
};

// ===== AUTHOR LOOKUPS =====

/** Batch fetch authors, deduplicating IDs */
export async function batchGetAuthors(
  ctx: QueryCtx,
  authorIds: Id<"users">[]
): Promise<Map<string, PublicAuthor | null>> {
  const uniqueIds = [...new Set(authorIds)];
  const authors = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));

  const authorMap = new Map<string, PublicAuthor | null>();
  for (let i = 0; i < uniqueIds.length; i++) {
    const author = authors[i];
    if (author && author.status === "active") {
      authorMap.set(uniqueIds[i], {
        _id: author._id,
        username: author.username,
        displayName: author.displayName,
        avatarR2Key: author.avatarR2Key,
        dicebearSeed: author.dicebearSeed,
        dicebearBgColor: author.dicebearBgColor,
        dicebearEyes: author.dicebearEyes,
        dicebearMouth: author.dicebearMouth,
        isVerified: author.isVerified,
        role: author.role,
      });
    } else {
      authorMap.set(uniqueIds[i], null);
    }
  }

  return authorMap;
}

// ===== INTERACTION STATE LOOKUPS =====

/** Batch check like status for posts */
export async function batchGetLikeStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
  postIds: Id<"posts">[]
): Promise<Map<string, boolean>> {
  const likeChecks = await Promise.all(
    postIds.map((postId) =>
      ctx.db
        .query("likes")
        .withIndex("by_user_target", (q) =>
          q.eq("userId", userId).eq("targetType", "post").eq("targetId", postId)
        )
        .unique()
    )
  );

  const likeMap = new Map<string, boolean>();
  for (let i = 0; i < postIds.length; i++) {
    likeMap.set(postIds[i], likeChecks[i] !== null);
  }
  return likeMap;
}

/** Batch check bookmark status for posts */
export async function batchGetBookmarkStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
  postIds: Id<"posts">[]
): Promise<Map<string, boolean>> {
  const bookmarkChecks = await Promise.all(
    postIds.map((postId) =>
      ctx.db
        .query("bookmarks")
        .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", postId))
        .unique()
    )
  );

  const bookmarkMap = new Map<string, boolean>();
  for (let i = 0; i < postIds.length; i++) {
    bookmarkMap.set(postIds[i], bookmarkChecks[i] !== null);
  }
  return bookmarkMap;
}

/** Batch check unlock status for locked posts */
export async function batchGetUnlockStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
  postIds: Id<"posts">[]
): Promise<Map<string, boolean>> {
  const unlockChecks = await Promise.all(
    postIds.map((postId) =>
      ctx.db
        .query("postUnlocks")
        .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", postId))
        .unique()
    )
  );

  const unlockMap = new Map<string, boolean>();
  for (let i = 0; i < postIds.length; i++) {
    unlockMap.set(postIds[i], unlockChecks[i] !== null);
  }
  return unlockMap;
}

/** Batch get all interaction states for posts */
export async function batchGetInteractionStates(
  ctx: QueryCtx,
  userId: Id<"users">,
  posts: Doc<"posts">[]
): Promise<Map<string, PostInteractionState>> {
  const postIds = posts.map((p) => p._id);
  const lockedPostIds = posts.filter((p) => p.isLocked).map((p) => p._id);

  const [likeMap, bookmarkMap, unlockMap] = await Promise.all([
    batchGetLikeStatus(ctx, userId, postIds),
    batchGetBookmarkStatus(ctx, userId, postIds),
    lockedPostIds.length > 0
      ? batchGetUnlockStatus(ctx, userId, lockedPostIds)
      : Promise.resolve(new Map<string, boolean>()),
  ]);

  const stateMap = new Map<string, PostInteractionState>();
  for (const post of posts) {
    stateMap.set(post._id, {
      isLiked: likeMap.get(post._id) ?? false,
      isBookmarked: bookmarkMap.get(post._id) ?? false,
      isUnlocked: !post.isLocked || unlockMap.get(post._id) === true,
    });
  }

  return stateMap;
}

// ===== SUBSCRIPTION LOOKUPS =====

/** Batch check subscription status for creators */
export async function batchGetSubscriptionStatus(
  ctx: QueryCtx,
  fanId: Id<"users">,
  creatorIds: Id<"users">[]
): Promise<Map<string, { isSubscribed: boolean; tierId?: Id<"subscriptionTiers"> }>> {
  const uniqueCreatorIds = [...new Set(creatorIds)];

  const subscriptionChecks = await Promise.all(
    uniqueCreatorIds.map((creatorId) =>
      ctx.db
        .query("subscriptions")
        .withIndex("by_fan_creator", (q) => q.eq("fanId", fanId).eq("creatorId", creatorId))
        .first()
    )
  );

  const subMap = new Map<string, { isSubscribed: boolean; tierId?: Id<"subscriptionTiers"> }>();
  for (let i = 0; i < uniqueCreatorIds.length; i++) {
    const sub = subscriptionChecks[i];
    const isActive = sub?.status === "active" || sub?.status === "trialing";
    subMap.set(uniqueCreatorIds[i], {
      isSubscribed: isActive,
      tierId: isActive ? sub?.tierId : undefined,
    });
  }

  return subMap;
}

// ===== FOLLOW LOOKUPS =====

/** Batch check if user follows multiple users */
export async function batchGetFollowStatus(
  ctx: QueryCtx,
  followerId: Id<"users">,
  targetIds: Id<"users">[]
): Promise<Map<string, boolean>> {
  const uniqueTargetIds = [...new Set(targetIds)];

  const followChecks = await Promise.all(
    uniqueTargetIds.map((targetId) =>
      ctx.db
        .query("follows")
        .withIndex("by_pair", (q) => q.eq("followerId", followerId).eq("followingId", targetId))
        .unique()
    )
  );

  const followMap = new Map<string, boolean>();
  for (let i = 0; i < uniqueTargetIds.length; i++) {
    followMap.set(uniqueTargetIds[i], followChecks[i] !== null);
  }

  return followMap;
}

// ===== BLOCK LOOKUPS =====

/** Batch check if viewer is blocked by authors */
export async function batchGetBlockedByStatus(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  authorIds: Id<"users">[]
): Promise<Map<string, boolean>> {
  const uniqueAuthorIds = [...new Set(authorIds)];

  const blockChecks = await Promise.all(
    uniqueAuthorIds.map((authorId) =>
      ctx.db
        .query("blocks")
        .withIndex("by_pair", (q) => q.eq("blockerId", authorId).eq("blockedId", viewerId))
        .unique()
    )
  );

  const blockMap = new Map<string, boolean>();
  for (let i = 0; i < uniqueAuthorIds.length; i++) {
    blockMap.set(uniqueAuthorIds[i], blockChecks[i] !== null);
  }

  return blockMap;
}

// ===== POST ENRICHMENT =====

/** Batch enrich posts with author data and interaction states */
export async function batchEnrichPosts(
  ctx: QueryCtx,
  posts: Doc<"posts">[],
  viewerId: Id<"users"> | null
): Promise<EnrichedPost[]> {
  if (posts.length === 0) return [];

  const authorIds = posts.map((p) => p.authorId);
  const authorMap = await batchGetAuthors(ctx, authorIds);

  let interactionMap = new Map<string, PostInteractionState>();
  if (viewerId) {
    interactionMap = await batchGetInteractionStates(ctx, viewerId, posts);
  }

  const enrichedPosts: EnrichedPost[] = [];
  for (const post of posts) {
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
      ...interactions,
    });
  }

  return enrichedPosts;
}

/** Batch visibility check for posts */
export async function batchCheckVisibility(
  ctx: QueryCtx,
  posts: Doc<"posts">[],
  viewerId: Id<"users"> | null
): Promise<Map<string, boolean>> {
  const visibilityMap = new Map<string, boolean>();

  const publicPosts = posts.filter((p) => p.visibility === "public");
  const followerPosts = posts.filter((p) => p.visibility === "followers");
  const subscriberPosts = posts.filter(
    (p) => p.visibility === "subscribers" || p.visibility === "vip"
  );

  // Public posts
  if (viewerId && publicPosts.length > 0) {
    const publicAuthorIds = publicPosts.map((p) => p.authorId);
    const blockMap = await batchGetBlockedByStatus(ctx, viewerId, publicAuthorIds);

    for (const post of publicPosts) {
      visibilityMap.set(post._id, !(blockMap.get(post.authorId) ?? false));
    }
  } else {
    for (const post of publicPosts) {
      visibilityMap.set(post._id, true);
    }
  }

  // Non-public posts require login
  if (!viewerId) {
    for (const post of [...followerPosts, ...subscriberPosts]) {
      visibilityMap.set(post._id, false);
    }
    return visibilityMap;
  }

  // Follower posts
  if (followerPosts.length > 0) {
    const followerAuthorIds = followerPosts.map((p) => p.authorId);
    const [followMap, blockMap] = await Promise.all([
      batchGetFollowStatus(ctx, viewerId, followerAuthorIds),
      batchGetBlockedByStatus(ctx, viewerId, followerAuthorIds),
    ]);

    for (const post of followerPosts) {
      const isBlocked = blockMap.get(post.authorId) ?? false;
      const isFollowing = followMap.get(post.authorId) ?? false;
      const isOwner = post.authorId === viewerId;
      visibilityMap.set(post._id, !isBlocked && (isOwner || isFollowing));
    }
  }

  // Subscriber posts
  if (subscriberPosts.length > 0) {
    const subAuthorIds = subscriberPosts.map((p) => p.authorId);
    const [subMap, blockMap] = await Promise.all([
      batchGetSubscriptionStatus(ctx, viewerId, subAuthorIds),
      batchGetBlockedByStatus(ctx, viewerId, subAuthorIds),
    ]);

    for (const post of subscriberPosts) {
      const isBlocked = blockMap.get(post.authorId) ?? false;
      const isSubscribed = subMap.get(post.authorId)?.isSubscribed ?? false;
      const isOwner = post.authorId === viewerId;
      visibilityMap.set(post._id, !isBlocked && (isOwner || isSubscribed));
    }
  }

  return visibilityMap;
}
