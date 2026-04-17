/**
 * @fileoverview Follow System Module
 *
 * Manages user follow relationships with rate limiting and notifications.
 *
 * Features:
 *   - Follow/unfollow users
 *   - Check follow status
 *   - Get followers/following lists with pagination
 *   - Find mutual followers
 *   - Remove followers (creator feature)
 *
 * Security:
 *   - Rate limited to prevent spam
 *   - Cannot follow yourself
 *   - Cannot follow blocked users
 *   - Generic error messages prevent user enumeration
 *   - Blocked users cannot follow
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";

const DEFAULT_LIMIT = 20;

// ===== MUTATIONS =====

/** Follow a user */
export const follow = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const followerId = await getAuthUserId(ctx);
    if (!followerId) throw new Error("Not authenticated");

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId: followerId,
      action: "follow",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    if (followerId === args.userId) throw new Error("Cannot follow yourself");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.status !== "active") {
      throw new Error("Cannot follow this user");
    }

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", followerId).eq("followingId", args.userId))
      .unique();

    if (existing) throw new Error("Already following this user");

    const blocked = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", args.userId).eq("blockedId", followerId))
      .unique();

    if (blocked) throw new Error("Cannot follow this user");

    await ctx.db.insert("follows", {
      followerId,
      followingId: args.userId,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId: followerId,
      field: "followingCount",
      delta: 1,
    });

    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId: args.userId,
      field: "followersCount",
      delta: 1,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: args.userId,
      type: "follow",
      actorId: followerId,
    });

    return { success: true };
  },
});

/** Unfollow a user */
export const unfollow = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const followerId = await getAuthUserId(ctx);
    if (!followerId) throw new Error("Not authenticated");

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId: followerId,
      action: "follow",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", followerId).eq("followingId", args.userId))
      .unique();

    if (!existing) throw new Error("Not following this user");

    await ctx.db.delete(existing._id);

    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId: followerId,
      field: "followingCount",
      delta: -1,
    });

    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId: args.userId,
      field: "followersCount",
      delta: -1,
    });

    await ctx.scheduler.runAfter(0, internal.feedItems.removeAuthorFromUserFeed, {
      userId: followerId,
      authorId: args.userId,
    });

    return { success: true };
  },
});

/** Remove a follower (creator feature) */
export const removeFollower = mutation({
  args: { followerId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "follow",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", args.followerId).eq("followingId", userId))
      .unique();

    if (!follow) throw new Error("User is not following you");

    await ctx.db.delete(follow._id);

    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId: args.followerId,
      field: "followingCount",
      delta: -1,
    });

    await ctx.scheduler.runAfter(0, internal.users.updateStats, {
      userId,
      field: "followersCount",
      delta: -1,
    });

    return { success: true };
  },
});

// ===== QUERIES =====

/** Check if following a user */
export const isFollowing = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const followerId = await getAuthUserId(ctx);
    if (!followerId) return false;

    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", followerId).eq("followingId", args.userId))
      .unique();

    return follow !== null;
  },
});

/** Get followers of a user */
export const getFollowers = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    const limit = args.limit ?? DEFAULT_LIMIT;

    const follows = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", args.userId))
      .order("desc")
      .take(limit + 1);

    const hasMore = follows.length > limit;
    const items = follows.slice(0, limit);

    const followers = await Promise.all(
      items.map(async (follow) => {
        const user = await ctx.db.get(follow.followerId);
        if (!user || user.status !== "active") return null;

        let isFollowing = false;
        if (currentUserId) {
          const myFollow = await ctx.db
            .query("follows")
            .withIndex("by_pair", (q) =>
              q.eq("followerId", currentUserId).eq("followingId", user._id)
            )
            .unique();
          isFollowing = myFollow !== null;
        }

        return {
          user: {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarR2Key: user.avatarR2Key,
            dicebearSeed: user.dicebearSeed,
            dicebearBgColor: user.dicebearBgColor,
            dicebearEyes: user.dicebearEyes,
            dicebearMouth: user.dicebearMouth,
            isVerified: user.isVerified,
            bio: user.bio,
          },
          followedAt: follow.createdAt,
          isFollowing,
        };
      })
    );

    return {
      followers: followers.filter((f) => f !== null),
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Get users that a user is following */
export const getFollowing = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    const limit = args.limit ?? DEFAULT_LIMIT;

    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
      .order("desc")
      .take(limit + 1);

    const hasMore = follows.length > limit;
    const items = follows.slice(0, limit);

    const following = await Promise.all(
      items.map(async (follow) => {
        const user = await ctx.db.get(follow.followingId);
        if (!user || user.status !== "active") return null;

        let isFollowing = false;
        if (currentUserId) {
          const myFollow = await ctx.db
            .query("follows")
            .withIndex("by_pair", (q) =>
              q.eq("followerId", currentUserId).eq("followingId", user._id)
            )
            .unique();
          isFollowing = myFollow !== null;
        }

        return {
          user: {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarR2Key: user.avatarR2Key,
            dicebearSeed: user.dicebearSeed,
            dicebearBgColor: user.dicebearBgColor,
            dicebearEyes: user.dicebearEyes,
            dicebearMouth: user.dicebearMouth,
            isVerified: user.isVerified,
            bio: user.bio,
          },
          followedAt: follow.createdAt,
          isFollowing,
        };
      })
    );

    return {
      following: following.filter((f) => f !== null),
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Get mutual followers */
export const getMutualFollowers = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) return [];

    const limit = args.limit ?? 10;

    const myFollowing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", currentUserId))
      .take(500);

    const theirFollowing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
      .take(500);

    const myFollowingIds = new Set(myFollowing.map((f) => f.followingId));
    const mutualIds = theirFollowing
      .filter((f) => myFollowingIds.has(f.followingId))
      .map((f) => f.followingId)
      .slice(0, limit);

    const mutuals = await Promise.all(
      mutualIds.map(async (id) => {
        const user = await ctx.db.get(id);
        if (!user || user.status !== "active") return null;
        return {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatarR2Key: user.avatarR2Key,
          dicebearSeed: user.dicebearSeed,
          dicebearBgColor: user.dicebearBgColor,
          dicebearEyes: user.dicebearEyes,
          dicebearMouth: user.dicebearMouth,
        };
      })
    );

    return mutuals.filter((m) => m !== null);
  },
});
