/**
 * @fileoverview User Blocking Module
 *
 * Manages user blocking functionality to prevent unwanted interactions.
 *
 * Features:
 *   - Block/unblock users
 *   - Check bidirectional block status
 *   - Auto-remove mutual follows on block
 *   - Get blocked users list
 *
 * Security:
 *   - Users cannot block themselves
 *   - Generic error messages prevent user enumeration
 *   - Blocking removes follows in both directions
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

// ===== MUTATIONS =====

/** Block a user */
export const block = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const blockerId = await getAuthUserId(ctx);
    if (!blockerId) throw new Error("Not authenticated");
    if (blockerId === args.userId) throw new Error("Cannot block yourself");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("Cannot block this user");

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", blockerId).eq("blockedId", args.userId))
      .unique();

    if (existing) throw new Error("User already blocked");

    await ctx.db.insert("blocks", {
      blockerId,
      blockedId: args.userId,
      createdAt: Date.now(),
    });

    // Remove follow relationships in both directions
    const followsToDelete = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", blockerId).eq("followingId", args.userId))
      .unique();

    if (followsToDelete) {
      await ctx.db.delete(followsToDelete._id);
    }

    const reverseFollow = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", args.userId).eq("followingId", blockerId))
      .unique();

    if (reverseFollow) {
      await ctx.db.delete(reverseFollow._id);
    }

    return { success: true };
  },
});

/** Unblock a user */
export const unblock = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const blockerId = await getAuthUserId(ctx);
    if (!blockerId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", blockerId).eq("blockedId", args.userId))
      .unique();

    if (!existing) throw new Error("User not blocked");

    await ctx.db.delete(existing._id);

    return { success: true };
  },
});

// ===== QUERIES =====

/** Check if a user is blocked (both directions) */
export const isBlocked = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) return { blockedByMe: false, blockedMe: false };

    const blockedByMe = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", currentUserId).eq("blockedId", args.userId))
      .unique();

    const blockedMe = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", args.userId).eq("blockedId", currentUserId))
      .unique();

    return {
      blockedByMe: blockedByMe !== null,
      blockedMe: blockedMe !== null,
    };
  },
});

/** Get list of blocked users */
export const getBlocked = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = args.limit ?? 50;

    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
      .order("desc")
      .take(limit);

    const blockedUsers = await Promise.all(
      blocks.map(async (block) => {
        const user = await ctx.db.get(block.blockedId);
        if (!user) return null;

        return {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatarR2Key: user.avatarR2Key,
          blockedAt: block.createdAt,
        };
      })
    );

    return blockedUsers.filter((u) => u !== null);
  },
});

/** Check if any interaction is blocked between users */
export const isInteractionBlocked = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) return false;

    const block1 = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", currentUserId).eq("blockedId", args.userId))
      .unique();

    if (block1) return true;

    const block2 = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", args.userId).eq("blockedId", currentUserId))
      .unique();

    return block2 !== null;
  },
});
