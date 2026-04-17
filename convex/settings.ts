/**
 * @fileoverview User Settings Module
 *
 * Manages user preferences for notifications, privacy, display options,
 * and creator-specific settings. Provides sensible defaults for new users.
 *
 * Features:
 *   - Notification preferences (email, push, followers, tips, comments, etc.)
 *   - Privacy controls (online status, search engine indexing)
 *   - Display preferences (autoplay, content warnings)
 *   - Creator settings (subscriber count visibility, earnings, watermarks)
 *   - Streaming settings (live status, follower notifications)
 *
 * Security:
 *   - All mutations require authentication
 *   - Users can only access/modify their own settings
 *   - Internal query available for server-side privacy checks
 *
 * Limits:
 *   - One settings document per user
 *   - Theme preference handled client-side via next-themes
 */

import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ===== CONSTANTS =====

const DEFAULT_SETTINGS = {
  emailNotifications: true,
  pushNotifications: true,
  notifyOnNewFollower: true,
  notifyOnNewSubscriber: true,
  notifyOnTip: true,
  notifyOnComment: true,
  notifyOnLike: false,
  notifyOnDM: true,
  notifyOnMention: true,

  showOnlineStatus: true,
  showLastActive: true,
  allowSearchEngineIndexing: false,

  autoplayVideos: true,
  contentWarnings: true,

  hideSubscriberCount: false,
  hideEarnings: false,
  watermarkMedia: false,

  showLiveStatus: true,
  notifyFollowersOnLive: true,
};

// ===== QUERIES =====

/** Retrieves settings for the authenticated user, merged with defaults */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return DEFAULT_SETTINGS;
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!settings) {
      return DEFAULT_SETTINGS;
    }

    return {
      emailNotifications: settings.emailNotifications ?? DEFAULT_SETTINGS.emailNotifications,
      pushNotifications: settings.pushNotifications ?? DEFAULT_SETTINGS.pushNotifications,
      notifyOnNewFollower: settings.notifyOnNewFollower ?? DEFAULT_SETTINGS.notifyOnNewFollower,
      notifyOnNewSubscriber:
        settings.notifyOnNewSubscriber ?? DEFAULT_SETTINGS.notifyOnNewSubscriber,
      notifyOnTip: settings.notifyOnTip ?? DEFAULT_SETTINGS.notifyOnTip,
      notifyOnComment: settings.notifyOnComment ?? DEFAULT_SETTINGS.notifyOnComment,
      notifyOnLike: settings.notifyOnLike ?? DEFAULT_SETTINGS.notifyOnLike,
      notifyOnDM: settings.notifyOnDM ?? DEFAULT_SETTINGS.notifyOnDM,
      notifyOnMention: settings.notifyOnMention ?? DEFAULT_SETTINGS.notifyOnMention,
      showOnlineStatus: settings.showOnlineStatus ?? DEFAULT_SETTINGS.showOnlineStatus,
      showLastActive: settings.showLastActive ?? DEFAULT_SETTINGS.showLastActive,
      allowSearchEngineIndexing:
        settings.allowSearchEngineIndexing ?? DEFAULT_SETTINGS.allowSearchEngineIndexing,
      autoplayVideos: settings.autoplayVideos ?? DEFAULT_SETTINGS.autoplayVideos,
      contentWarnings: settings.contentWarnings ?? DEFAULT_SETTINGS.contentWarnings,
      hideSubscriberCount: settings.hideSubscriberCount ?? DEFAULT_SETTINGS.hideSubscriberCount,
      hideEarnings: settings.hideEarnings ?? DEFAULT_SETTINGS.hideEarnings,
      watermarkMedia: settings.watermarkMedia ?? DEFAULT_SETTINGS.watermarkMedia,
      showLiveStatus: settings.showLiveStatus ?? DEFAULT_SETTINGS.showLiveStatus,
      notifyFollowersOnLive:
        settings.notifyFollowersOnLive ?? DEFAULT_SETTINGS.notifyFollowersOnLive,
    };
  },
});

// ===== MUTATIONS =====

/** Updates one or more settings for the authenticated user */
export const update = mutation({
  args: {
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    notifyOnNewFollower: v.optional(v.boolean()),
    notifyOnNewSubscriber: v.optional(v.boolean()),
    notifyOnTip: v.optional(v.boolean()),
    notifyOnComment: v.optional(v.boolean()),
    notifyOnLike: v.optional(v.boolean()),
    notifyOnDM: v.optional(v.boolean()),
    notifyOnMention: v.optional(v.boolean()),
    showOnlineStatus: v.optional(v.boolean()),
    showLastActive: v.optional(v.boolean()),
    allowSearchEngineIndexing: v.optional(v.boolean()),
    autoplayVideos: v.optional(v.boolean()),
    contentWarnings: v.optional(v.boolean()),
    hideSubscriberCount: v.optional(v.boolean()),
    hideEarnings: v.optional(v.boolean()),
    watermarkMedia: v.optional(v.boolean()),
    showLiveStatus: v.optional(v.boolean()),
    notifyFollowersOnLive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const updates: Record<string, boolean | string | number> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    if (existingSettings) {
      await ctx.db.patch(existingSettings._id, {
        ...updates,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        ...updates,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// ===== INTERNAL QUERIES =====

/** Retrieves privacy-related settings by user ID for server-side checks */
export const getByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!settings) {
      return DEFAULT_SETTINGS;
    }

    return {
      showOnlineStatus: settings.showOnlineStatus ?? DEFAULT_SETTINGS.showOnlineStatus,
      showLastActive: settings.showLastActive ?? DEFAULT_SETTINGS.showLastActive,
      allowSearchEngineIndexing:
        settings.allowSearchEngineIndexing ?? DEFAULT_SETTINGS.allowSearchEngineIndexing,
    };
  },
});
