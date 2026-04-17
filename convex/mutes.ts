/**
 * @fileoverview User Mutes Module
 *
 * Allows users to mute other users without blocking them.
 *
 * Features:
 *   - Mute/unmute users
 *   - Granular mute settings
 *   - Feed filtering support
 *   - Notification filtering
 *
 * Mute Options:
 *   - muteNotifications: Hide notifications from this user
 *   - muteStories: Hide stories from this user
 *
 * Note: Unlike blocking, muting doesn't prevent interaction.
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

// ===== MUTATIONS =====

/** Mute a user */
export const mute = mutation({
  args: {
    userId: v.id("users"),
    muteNotifications: v.optional(v.boolean()),
    muteStories: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new Error("Not authenticated");
    }

    if (currentUserId === args.userId) {
      throw new Error("Cannot mute yourself");
    }

    // Check if target exists
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Check if already muted
    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_pair", (q) => q.eq("userId", currentUserId).eq("mutedUserId", args.userId))
      .unique();

    if (existing) {
      // Update mute settings
      await ctx.db.patch(existing._id, {
        muteNotifications: args.muteNotifications ?? existing.muteNotifications,
        muteStories: args.muteStories ?? existing.muteStories,
      });
      return { success: true, updated: true };
    }

    // Create mute
    await ctx.db.insert("mutes", {
      userId: currentUserId,
      mutedUserId: args.userId,
      muteNotifications: args.muteNotifications ?? true,
      muteStories: args.muteStories ?? true,
      createdAt: Date.now(),
    });

    return { success: true, updated: false };
  },
});

/** Unmute a user */
export const unmute = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_pair", (q) => q.eq("userId", currentUserId).eq("mutedUserId", args.userId))
      .unique();

    if (!existing) {
      throw new Error("User not muted");
    }

    await ctx.db.delete(existing._id);

    return { success: true };
  },
});

/** Update mute settings */
export const updateMuteSettings = mutation({
  args: {
    userId: v.id("users"),
    muteNotifications: v.optional(v.boolean()),
    muteStories: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_pair", (q) => q.eq("userId", currentUserId).eq("mutedUserId", args.userId))
      .unique();

    if (!existing) {
      throw new Error("User not muted");
    }

    await ctx.db.patch(existing._id, {
      muteNotifications: args.muteNotifications ?? existing.muteNotifications,
      muteStories: args.muteStories ?? existing.muteStories,
    });

    return { success: true };
  },
});

// ===== QUERIES =====

/** Check if a user is muted */
export const isMuted = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      return { muted: false, settings: null };
    }

    const mute = await ctx.db
      .query("mutes")
      .withIndex("by_pair", (q) => q.eq("userId", currentUserId).eq("mutedUserId", args.userId))
      .unique();

    if (!mute) {
      return { muted: false, settings: null };
    }

    return {
      muted: true,
      settings: {
        muteNotifications: mute.muteNotifications ?? true,
        muteStories: mute.muteStories ?? true,
      },
    };
  },
});

/** Get list of muted users */
export const getMuted = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    const mutes = await ctx.db
      .query("mutes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    const mutedUsers = await Promise.all(
      mutes.map(async (mute) => {
        const user = await ctx.db.get(mute.mutedUserId);
        if (!user) return null;

        return {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatarR2Key: user.avatarR2Key,
          mutedAt: mute.createdAt,
          muteNotifications: mute.muteNotifications ?? true,
          muteStories: mute.muteStories ?? true,
        };
      })
    );

    return mutedUsers.filter((u) => u !== null);
  },
});

/** Get muted user IDs (for feed filtering) */
export const getMutedIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const mutes = await ctx.db
      .query("mutes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    return mutes.map((m) => m.mutedUserId);
  },
});

/** Check if user should see notifications from another user */
export const shouldShowNotification = query({
  args: { fromUserId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return true;
    }

    const mute = await ctx.db
      .query("mutes")
      .withIndex("by_pair", (q) => q.eq("userId", userId).eq("mutedUserId", args.fromUserId))
      .unique();

    if (!mute) {
      return true;
    }

    return !(mute.muteNotifications ?? true);
  },
});
