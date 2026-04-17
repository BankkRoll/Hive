/**
 * @fileoverview Streaming Integration Module
 *
 * Manages live streaming platform integrations for Twitch and Kick.
 * Handles account linking, live status tracking, and follower notifications.
 *
 * Features:
 *   - Link/unlink Twitch and Kick accounts with automatic webhook subscription
 *   - Query live status for individual users or followed creators
 *   - Real-time stream status updates via webhook handlers
 *   - Automatic follower notifications when creators go live
 *   - Webhook event deduplication to prevent duplicate processing
 *
 * Security:
 *   - All mutations require authentication via getAuthUserId
 *   - Internal mutations are used for webhook processing (not publicly accessible)
 *   - Webhook events are deduplicated using streamingWebhookEvents table
 *
 * Limits:
 *   - Follows query: 500 max
 *   - Live streams query: 100 max
 *   - Follower notifications: 100 max per go-live event
 *   - User search for platform ID: 1000 max
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// ===== QUERIES =====

/** Get live streaming status for a specific user */
export const getLiveStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const livestreams = await ctx.db
      .query("livestreams")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(10);

    const liveStream = livestreams.find((s) => s.isLive);
    if (!liveStream) {
      return null;
    }

    return {
      platform: liveStream.platform,
      title: liveStream.title,
      thumbnailUrl: liveStream.thumbnailUrl,
      viewerCount: liveStream.viewerCount,
      startedAt: liveStream.startedAt,
    };
  },
});

/** Get all currently live creators that the authenticated user follows */
export const getLiveFollowedCreators = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", userId))
      .take(500);

    const followingIds = follows.map((f) => f.followingId);

    const liveStreams = await ctx.db
      .query("livestreams")
      .withIndex("by_isLive", (q) => q.eq("isLive", true))
      .take(100);

    const followedLiveStreams = liveStreams.filter((s) => followingIds.includes(s.userId));

    const results = await Promise.all(
      followedLiveStreams.map(async (stream) => {
        const user = await ctx.db.get(stream.userId);
        if (!user) return null;

        return {
          userId: stream.userId,
          username: user.username,
          displayName: user.displayName,
          avatarR2Key: user.avatarR2Key,
          isVerified: user.isVerified,
          platform: stream.platform,
          title: stream.title,
          thumbnailUrl: stream.thumbnailUrl,
          viewerCount: stream.viewerCount,
          startedAt: stream.startedAt,
        };
      })
    );

    return results.filter(Boolean);
  },
});

/** Get Twitch and Kick accounts linked to the current user */
export const getLinkedAccounts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { twitch: null, kick: null };
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return { twitch: null, kick: null };
    }

    return {
      twitch: user.twitchUsername
        ? { username: user.twitchUsername, userId: user.twitchUserId }
        : null,
      kick: user.kickUsername ? { username: user.kickUsername, userId: user.kickUserId } : null,
    };
  },
});

// ===== MUTATIONS =====

/** Link a Twitch account and auto-subscribe to EventSub webhooks */
export const linkTwitchAccount = mutation({
  args: {
    twitchUserId: v.string(),
    twitchUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(userId, {
      twitchUserId: args.twitchUserId,
      twitchUsername: args.twitchUsername,
      updatedAt: Date.now(),
    });

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (siteUrl) {
      await ctx.scheduler.runAfter(0, internal.streamingActions.subscribeTwitchEventSub, {
        twitchUserId: args.twitchUserId,
        callbackUrl: `${siteUrl}/webhooks/twitch`,
      });
    }

    return { success: true };
  },
});

/** Link a Kick account and auto-subscribe to webhooks */
export const linkKickAccount = mutation({
  args: {
    kickUserId: v.string(),
    kickUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(userId, {
      kickUserId: args.kickUserId,
      kickUsername: args.kickUsername,
      updatedAt: Date.now(),
    });

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (siteUrl) {
      await ctx.scheduler.runAfter(0, internal.streamingActions.subscribeKickWebhook, {
        kickUserId: args.kickUserId,
        callbackUrl: `${siteUrl}/webhooks/kick`,
      });
    }

    return { success: true };
  },
});

/** Unlink Twitch account and unsubscribe from EventSub webhooks */
export const unlinkTwitchAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    const twitchUserId = user?.twitchUserId;

    await ctx.db.patch(userId, {
      twitchUserId: undefined,
      twitchUsername: undefined,
      updatedAt: Date.now(),
    });

    if (twitchUserId) {
      await ctx.scheduler.runAfter(0, internal.streamingActions.unsubscribeTwitchEventSub, {
        twitchUserId,
      });
    }

    const livestreams = await ctx.db
      .query("livestreams")
      .withIndex("by_user_platform", (q) => q.eq("userId", userId).eq("platform", "twitch"))
      .take(10);

    for (const stream of livestreams) {
      await ctx.db.delete(stream._id);
    }

    return { success: true };
  },
});

/** Unlink Kick account and unsubscribe from webhooks */
export const unlinkKickAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    const kickUserId = user?.kickUserId;

    await ctx.db.patch(userId, {
      kickUserId: undefined,
      kickUsername: undefined,
      updatedAt: Date.now(),
    });

    if (kickUserId) {
      await ctx.scheduler.runAfter(0, internal.streamingActions.unsubscribeKickWebhook, {
        kickUserId,
      });
    }

    const livestreams = await ctx.db
      .query("livestreams")
      .withIndex("by_user_platform", (q) => q.eq("userId", userId).eq("platform", "kick"))
      .take(10);

    for (const stream of livestreams) {
      await ctx.db.delete(stream._id);
    }

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Update stream status from webhook events and notify followers when going live */
export const updateStreamStatus = internalMutation({
  args: {
    platform: v.union(v.literal("twitch"), v.literal("kick")),
    platformUserId: v.string(),
    isLive: v.boolean(),
    title: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    viewerCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").take(1000);
    const user = users.find((u) =>
      args.platform === "twitch"
        ? u.twitchUserId === args.platformUserId
        : u.kickUserId === args.platformUserId
    );

    if (!user) {
      console.log(`No user found for ${args.platform} ID: ${args.platformUserId}`);
      return { success: false, reason: "user_not_found" };
    }

    const existingStream = await ctx.db
      .query("livestreams")
      .withIndex("by_user_platform", (q) => q.eq("userId", user._id).eq("platform", args.platform))
      .unique();

    const now = Date.now();

    if (existingStream) {
      await ctx.db.patch(existingStream._id, {
        isLive: args.isLive,
        title: args.title,
        thumbnailUrl: args.thumbnailUrl,
        viewerCount: args.viewerCount,
        startedAt: args.isLive && !existingStream.isLive ? now : existingStream.startedAt,
        endedAt: !args.isLive && existingStream.isLive ? now : existingStream.endedAt,
        lastUpdatedAt: now,
      });
    } else {
      await ctx.db.insert("livestreams", {
        userId: user._id,
        platform: args.platform,
        isLive: args.isLive,
        title: args.title,
        thumbnailUrl: args.thumbnailUrl,
        viewerCount: args.viewerCount,
        startedAt: args.isLive ? now : undefined,
        lastUpdatedAt: now,
      });
    }

    if (args.isLive) {
      const followers = await ctx.db
        .query("follows")
        .withIndex("by_following", (q) => q.eq("followingId", user._id))
        .take(1000);

      const notificationPromises = followers.slice(0, 100).map((follow) =>
        ctx.db.insert("notifications", {
          userId: follow.followerId,
          type: "system",
          actorId: user._id,
          message: `${user.displayName || user.username} is now live on ${args.platform}!`,
          read: false,
          createdAt: now,
        })
      );

      await Promise.all(notificationPromises);
    }

    return { success: true, userId: user._id };
  },
});

/** Check if a webhook event has already been processed for deduplication */
export const checkWebhookEventProcessed = internalMutation({
  args: {
    eventId: v.string(),
    platform: v.union(v.literal("twitch"), v.literal("kick")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("streamingWebhookEvents")
      .withIndex("by_platform_event", (q) =>
        q.eq("platform", args.platform).eq("eventId", args.eventId)
      )
      .unique();

    return { processed: !!existing };
  },
});

/** Mark a webhook event as processed to prevent duplicate handling */
export const markWebhookEventProcessed = internalMutation({
  args: {
    eventId: v.string(),
    platform: v.union(v.literal("twitch"), v.literal("kick")),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("streamingWebhookEvents", {
      eventId: args.eventId,
      platform: args.platform,
      eventType: args.eventType,
      processedAt: Date.now(),
    });

    return { success: true };
  },
});
