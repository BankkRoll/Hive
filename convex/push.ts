/**
 * @fileoverview Push Notifications Module
 *
 * Manages push notification token registration and lifecycle.
 *
 * Features:
 *   - Token registration (web, iOS, Android)
 *   - Token deactivation on logout
 *   - Device ID tracking
 *   - Automatic cleanup of old tokens (30 days)
 *
 * Note: Actual push sending is handled by pushActions.ts
 */

import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ===== MUTATIONS =====

/** Register a push notification token */
export const registerToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("web"), v.literal("ios"), v.literal("android")),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Check if this token already exists
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (existing) {
      // Update existing token
      await ctx.db.patch(existing._id, {
        userId,
        isActive: true,
        lastUsedAt: Date.now(),
      });
      return { success: true, tokenId: existing._id };
    }

    // Create new token
    const tokenId = await ctx.db.insert("pushTokens", {
      userId,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId,
      isActive: true,
      lastUsedAt: Date.now(),
      createdAt: Date.now(),
    });

    return { success: true, tokenId };
  },
});

/** Unregister a push token */
export const unregisterToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (existing && existing.userId === userId) {
      await ctx.db.patch(existing._id, { isActive: false });
    }

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Get tokens for a user */
export const getTokensForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId).eq("isActive", true))
      .take(10);

    return tokens.map((t) => ({
      id: t._id,
      token: t.token,
      platform: t.platform,
    }));
  },
});

/** Mark token as inactive */
export const deactivateToken = internalMutation({
  args: { tokenId: v.id("pushTokens") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tokenId, { isActive: false });
  },
});

/** Update token last used time */
export const updateTokenLastUsed = internalMutation({
  args: { tokenId: v.id("pushTokens") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tokenId, { lastUsedAt: Date.now() });
  },
});

/** Cleanup old inactive tokens (called by cron) */
export const cleanupInactiveTokens = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const oldTokens = await ctx.db.query("pushTokens").take(1000);

    let deleted = 0;
    for (const token of oldTokens) {
      // Delete inactive tokens older than 30 days
      if (!token.isActive && token.lastUsedAt < thirtyDaysAgo) {
        await ctx.db.delete(token._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
