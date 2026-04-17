/**
 * @fileoverview Presence Module
 *
 * Real-time user presence and online status tracking.
 *
 * Features:
 *   - Room-based presence via @convex-dev/presence
 *   - Heartbeat-based online detection
 *   - Privacy-aware presence queries
 *   - Last active timestamps
 *
 * Privacy:
 *   - Users can hide online status
 *   - Users can hide last active time
 *   - Respects userSettings preferences
 */

import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { getAuthUserId } from "@convex-dev/auth/server";

export const presence = new Presence(components.presence);

const DEFAULT_PRIVACY = {
  showOnlineStatus: true,
  showLastActive: true,
};

// ===== PRESENCE API =====

/** Heartbeat - called by client every few seconds */
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    // Verify auth - userId should match authenticated user
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId || authUserId !== userId) {
      throw new Error("Unauthorized");
    }
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

/** List all users in a room */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    // Avoid adding per-user reads so all subscriptions can share same cache
    return await presence.list(ctx, roomToken);
  },
});

/** Disconnect - called when user leaves */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // Can't check auth here because it's called over http from sendBeacon
    return await presence.disconnect(ctx, sessionToken);
  },
});

// ===== PRIVACY-AWARE QUERIES =====

/** Get presence for a single user with privacy check */
export const getPresenceWithPrivacy = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get target user's privacy settings
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    const showOnlineStatus = settings?.showOnlineStatus ?? DEFAULT_PRIVACY.showOnlineStatus;
    const showLastActive = settings?.showLastActive ?? DEFAULT_PRIVACY.showLastActive;

    // If user hides both, return nothing
    if (!showOnlineStatus && !showLastActive) {
      return null;
    }

    // Get presence from userPresence table (our custom table for persistence)
    const presenceRecord = await ctx.db
      .query("userPresence")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!presenceRecord) {
      return null;
    }

    return {
      lastActiveAt: showLastActive ? presenceRecord.lastActiveAt : undefined,
      lastHeartbeatAt: showOnlineStatus ? presenceRecord.lastHeartbeatAt : undefined,
      // Client determines "online" status: (Date.now() - lastHeartbeatAt) < 10000
    };
  },
});

/** Batch get presence for multiple users */
export const getPresenceForUsersWithPrivacy = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    if (args.userIds.length === 0) {
      return {};
    }

    const result: Record<
      string,
      {
        lastActiveAt?: number;
        lastHeartbeatAt?: number;
      }
    > = {};

    for (const userId of args.userIds) {
      // Get privacy settings
      const settings = await ctx.db
        .query("userSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();

      const showOnlineStatus = settings?.showOnlineStatus ?? DEFAULT_PRIVACY.showOnlineStatus;
      const showLastActive = settings?.showLastActive ?? DEFAULT_PRIVACY.showLastActive;

      // Skip if user hides everything
      if (!showOnlineStatus && !showLastActive) {
        continue;
      }

      // Get presence
      const presenceRecord = await ctx.db
        .query("userPresence")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();

      if (presenceRecord) {
        result[userId] = {
          lastActiveAt: showLastActive ? presenceRecord.lastActiveAt : undefined,
          lastHeartbeatAt: showOnlineStatus ? presenceRecord.lastHeartbeatAt : undefined,
        };
      }
    }

    return result;
  },
});

// ===== MUTATIONS =====

/** Update user presence table when user is active */
export const updateUserPresence = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { success: false };
    }

    const now = Date.now();

    // Check if presence record exists
    const existing = await ctx.db
      .query("userPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastActiveAt: now,
        lastHeartbeatAt: now,
      });
    } else {
      await ctx.db.insert("userPresence", {
        userId,
        lastActiveAt: now,
        lastHeartbeatAt: now,
      });
    }

    return { success: true };
  },
});
