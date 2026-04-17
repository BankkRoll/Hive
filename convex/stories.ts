/**
 * @fileoverview Stories (Ephemeral Content)
 *
 * Manages time-limited stories that automatically expire after 24 hours.
 * Stories support images and videos with tiered visibility controls.
 *
 * Features:
 *   - 24-hour automatic expiration with scheduled cleanup
 *   - Visibility tiers: public, followers, subscribers, VIP
 *   - View tracking with emoji reactions
 *   - Feed aggregation grouped by user
 *   - Creator analytics (view counts, reaction counts)
 *
 * Security:
 *   - Visibility enforcement via canViewStory helper
 *   - Media ownership verification on creation
 *   - Story ownership required for deletion and viewer access
 *
 * Limits:
 *   - 50 stories per user per day
 *   - Feed: 100 followed users, 10 stories per user
 *   - Viewer list: 50 viewers per request
 *   - Story history: 100 stories per user
 *   - View records: 10,000 per story (cleanup batch)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, type QueryCtx } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";

const STORY_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_STORIES_PER_DAY = 50;

// ===== QUERIES =====

/** Returns stories from followed users grouped by author */
export const getFeed = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;
    const now = Date.now();

    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", userId))
      .take(500);

    const followingIds = follows.map((f) => f.followingId);
    followingIds.push(userId);

    const allStories: Array<Doc<"stories"> & { user: unknown }> = [];

    for (const followingId of followingIds.slice(0, 100)) {
      const stories = await ctx.db
        .query("stories")
        .withIndex("by_user_active", (q) => q.eq("userId", followingId).gt("expiresAt", now))
        .order("desc")
        .take(10);

      const user = await ctx.db.get(followingId);
      if (!user || user.status !== "active") continue;

      for (const story of stories) {
        if (!(await canViewStory(ctx, story, userId))) continue;

        allStories.push({
          ...story,
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
          },
        });
      }
    }

    allStories.sort((a, b) => b.createdAt - a.createdAt);

    const userStoriesMap = new Map<string, typeof allStories>();
    for (const story of allStories) {
      const existing = userStoriesMap.get(story.userId) ?? [];
      existing.push(story);
      userStoriesMap.set(story.userId, existing);
    }

    const result = [];
    for (const [, stories] of userStoriesMap) {
      if (stories.length === 0) continue;

      const storiesWithUrls = await Promise.all(
        stories.map(async (story) => {
          const media = await ctx.db.get(story.mediaId);
          let mediaUrl = null;
          if (media?.r2Key) {
            mediaUrl = null;
          } else if (media?.storageId) {
            mediaUrl = await ctx.storage.getUrl(media.storageId);
          }

          const viewed = await ctx.db
            .query("storyViews")
            .withIndex("by_story_viewer", (q) => q.eq("storyId", story._id).eq("viewerId", userId))
            .unique();

          return {
            ...story,
            mediaUrl,
            isViewed: viewed !== null,
          };
        })
      );

      result.push({
        user: stories[0].user,
        stories: storiesWithUrls,
        hasUnviewed: storiesWithUrls.some((s) => !s.isViewed),
      });
    }

    result.sort((a, b) => {
      if (a.hasUnviewed !== b.hasUnviewed) {
        return a.hasUnviewed ? -1 : 1;
      }
      return b.stories[0].createdAt - a.stories[0].createdAt;
    });

    return result.slice(0, limit);
  },
});

/** Returns active stories for a specific user */
export const getUserStories = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const now = Date.now();

    const stories = await ctx.db
      .query("stories")
      .withIndex("by_user_active", (q) => q.eq("userId", args.userId).gt("expiresAt", now))
      .order("desc")
      .take(50);

    const visibleStories = [];
    for (const story of stories) {
      if (await canViewStory(ctx, story, viewerId)) {
        const media = await ctx.db.get(story.mediaId);
        let mediaUrl = null;
        if (media?.storageId) {
          mediaUrl = await ctx.storage.getUrl(media.storageId);
        }

        const viewed = viewerId
          ? await ctx.db
              .query("storyViews")
              .withIndex("by_story_viewer", (q) =>
                q.eq("storyId", story._id).eq("viewerId", viewerId)
              )
              .unique()
          : null;

        visibleStories.push({
          ...story,
          mediaUrl,
          isViewed: viewed !== null,
        });
      }
    }

    return visibleStories;
  },
});

/** Returns the current user's stories with view statistics */
export const getMyStories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const now = Date.now();

    const stories = await ctx.db
      .query("stories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);

    return Promise.all(
      stories.map(async (story) => {
        const media = await ctx.db.get(story.mediaId);
        let mediaUrl = null;
        if (media?.storageId) {
          mediaUrl = await ctx.storage.getUrl(media.storageId);
        }

        const views = await ctx.db
          .query("storyViews")
          .withIndex("by_story", (q) => q.eq("storyId", story._id))
          .take(1000);

        return {
          ...story,
          mediaUrl,
          isExpired: story.expiresAt < now,
          viewCount: views.length,
          reactionCount: views.filter((v) => v.reaction).length,
        };
      })
    );
  },
});

/** Returns list of viewers for a story (owner only) */
export const getViewers = query({
  args: {
    storyId: v.id("stories"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const story = await ctx.db.get(args.storyId);
    if (!story || story.userId !== userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    const views = await ctx.db
      .query("storyViews")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .order("desc")
      .take(limit);

    return Promise.all(
      views.map(async (view) => {
        const viewer = await ctx.db.get(view.viewerId);
        if (!viewer) return null;

        return {
          viewer: {
            _id: viewer._id,
            username: viewer.username,
            displayName: viewer.displayName,
            avatarR2Key: viewer.avatarR2Key,
            dicebearSeed: viewer.dicebearSeed,
            dicebearBgColor: viewer.dicebearBgColor,
            dicebearEyes: viewer.dicebearEyes,
            dicebearMouth: viewer.dicebearMouth,
          },
          reaction: view.reaction,
          viewedAt: view.viewedAt,
        };
      })
    ).then((results) => results.filter((r) => r !== null));
  },
});

// ===== MUTATIONS =====

/** Creates a new story with automatic 24-hour expiration */
export const create = mutation({
  args: {
    mediaId: v.id("media"),
    caption: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    visibility: v.optional(
      v.union(
        v.literal("public"),
        v.literal("followers"),
        v.literal("subscribers"),
        v.literal("vip")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media || media.userId !== userId) {
      throw new Error("Media not found");
    }

    if (media.type !== "image" && media.type !== "video") {
      throw new Error("Stories only support images and videos");
    }

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentStories = await ctx.db
      .query("stories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gt(q.field("createdAt"), dayAgo))
      .take(MAX_STORIES_PER_DAY);

    if (recentStories.length >= MAX_STORIES_PER_DAY) {
      throw new Error(`Maximum ${MAX_STORIES_PER_DAY} stories per day`);
    }

    const now = Date.now();

    const expiresAt = now + STORY_DURATION_MS;

    const storyId = await ctx.db.insert("stories", {
      userId,
      mediaId: args.mediaId,
      mediaType: media.type as "image" | "video",
      caption: args.caption?.trim().slice(0, 500),
      linkUrl: args.linkUrl?.trim(),
      visibility: args.visibility ?? "followers",
      viewsCount: 0,
      reactionsCount: 0,
      expiresAt,
      createdAt: now,
    });

    const expirationFunctionId = await ctx.scheduler.runAt(
      expiresAt,
      internal.stories.expireStory,
      { storyId }
    );

    await ctx.db.patch(storyId, { expirationFunctionId });

    return { storyId };
  },
});

/** Records a view and optional reaction on a story */
export const view = mutation({
  args: {
    storyId: v.id("stories"),
    reaction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const story = await ctx.db.get(args.storyId);
    if (!story) {
      throw new Error("Story not found");
    }

    if (story.expiresAt < Date.now()) {
      throw new Error("Story has expired");
    }

    if (!(await canViewStory(ctx, story, userId))) {
      throw new Error("Cannot view this story");
    }

    const existing = await ctx.db
      .query("storyViews")
      .withIndex("by_story_viewer", (q) => q.eq("storyId", args.storyId).eq("viewerId", userId))
      .unique();

    if (existing) {
      if (args.reaction !== undefined) {
        await ctx.db.patch(existing._id, {
          reaction: args.reaction,
        });

        if (!existing.reaction && args.reaction) {
          await ctx.db.patch(args.storyId, {
            reactionsCount: (story.reactionsCount ?? 0) + 1,
          });
        } else if (existing.reaction && !args.reaction) {
          await ctx.db.patch(args.storyId, {
            reactionsCount: Math.max(0, (story.reactionsCount ?? 0) - 1),
          });
        }
      }
      return { viewId: existing._id };
    }

    const viewId = await ctx.db.insert("storyViews", {
      storyId: args.storyId,
      viewerId: userId,
      reaction: args.reaction,
      viewedAt: Date.now(),
    });

    await ctx.db.patch(args.storyId, {
      viewsCount: (story.viewsCount ?? 0) + 1,
      reactionsCount: args.reaction ? (story.reactionsCount ?? 0) + 1 : story.reactionsCount,
    });

    return { viewId };
  },
});

/** Deletes a story and all associated views */
export const remove = mutation({
  args: { storyId: v.id("stories") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const story = await ctx.db.get(args.storyId);
    if (!story || story.userId !== userId) {
      throw new Error("Story not found");
    }

    if (story.expirationFunctionId) {
      await ctx.scheduler.cancel(story.expirationFunctionId);
    }

    const views = await ctx.db
      .query("storyViews")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .take(10000);

    for (const view of views) {
      await ctx.db.delete(view._id);
    }

    await ctx.db.delete(args.storyId);

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Expires a single story (scheduled at creation time) */
export const expireStory = internalMutation({
  args: {
    storyId: v.id("stories"),
  },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);

    if (!story) {
      return { success: false, reason: "Story not found" };
    }

    if (story.expiresAt > Date.now()) {
      return { success: false, reason: "Story not yet expired" };
    }

    const views = await ctx.db
      .query("storyViews")
      .withIndex("by_story", (q) => q.eq("storyId", args.storyId))
      .take(10000);

    for (const view of views) {
      await ctx.db.delete(view._id);
    }

    await ctx.db.delete(args.storyId);

    return { success: true };
  },
});

/** Fallback cleanup for stories missed by scheduled expiration */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expiredStories = await ctx.db
      .query("stories")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(500);

    let deleted = 0;

    for (const story of expiredStories) {
      await ctx.scheduler.runAfter(0, internal.stories.expireStory, {
        storyId: story._id,
      });
      deleted++;
    }

    if (expiredStories.length === 500) {
      await ctx.scheduler.runAfter(1000, internal.stories.cleanupExpired, {});
    }

    return { deleted };
  },
});

// ===== HELPER FUNCTIONS =====

/** Checks if a viewer has permission to see a story based on visibility settings */
async function canViewStory(
  ctx: QueryCtx,
  story: Doc<"stories">,
  viewerId: Id<"users"> | null
): Promise<boolean> {
  if (viewerId && story.userId === viewerId) {
    return true;
  }

  if (story.visibility === "public") {
    return true;
  }

  if (!viewerId) {
    return false;
  }

  if (story.visibility === "followers") {
    const follow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", viewerId).eq("followingId", story.userId))
      .unique();
    return follow !== null;
  }

  if (story.visibility === "subscribers") {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", viewerId).eq("creatorId", story.userId))
      .first();
    return subscription?.status === "active";
  }

  if (story.visibility === "vip") {
    const vip = await ctx.db
      .query("vipMembers")
      .withIndex("by_pair", (q) => q.eq("creatorId", story.userId).eq("memberId", viewerId))
      .unique();
    return vip !== null;
  }

  return false;
}
