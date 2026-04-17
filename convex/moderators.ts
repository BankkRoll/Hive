/**
 * @fileoverview Creator Moderators Module
 *
 * Manages moderator roles for creator content.
 *
 * Features:
 *   - Assign/remove moderators
 *   - Granular permission system
 *   - Self-resignation for moderators
 *   - Creator ownership of moderation
 *
 * Permissions:
 *   - delete_comments: Remove comments on creator's posts
 *   - ban_users: Ban users from creator's content
 *   - pin_comments: Pin comments on posts
 *   - manage_chat: Moderate live chat/streams
 *
 * Security:
 *   - Only creators can assign moderators
 *   - Creator always has full permissions
 *   - Cannot add self as moderator
 */

import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const PERMISSIONS = ["delete_comments", "ban_users", "pin_comments", "manage_chat"] as const;

type ModPermission = (typeof PERMISSIONS)[number];

// ===== QUERIES =====

/** Get moderators for a creator */
export const getModerators = query({
  args: {
    creatorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    // Only creator can see their mods
    if (userId !== args.creatorId) {
      return [];
    }

    const mods = await ctx.db
      .query("creatorModerators")
      .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId))
      .take(100);

    // Enrich with user data
    const enriched = await Promise.all(
      mods.map(async (mod) => {
        const user = await ctx.db.get(mod.moderatorId);
        if (!user || user.status !== "active") return null;

        return {
          _id: mod._id,
          moderator: {
            _id: user._id,
            username: user.username,
            displayName: user.displayName,
            avatarR2Key: user.avatarR2Key,
          },
          permissions: mod.permissions ?? PERMISSIONS,
          assignedAt: mod.assignedAt,
        };
      })
    );

    return enriched.filter((m) => m !== null);
  },
});

/** Check if user is a moderator for a creator */
export const isModerator = query({
  args: {
    creatorId: v.id("users"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const checkUserId = args.userId ?? (await getAuthUserId(ctx));
    if (!checkUserId) {
      return { isMod: false, permissions: [] };
    }

    // Creator is always a mod of their own content
    if (checkUserId === args.creatorId) {
      return { isMod: true, permissions: PERMISSIONS };
    }

    const mod = await ctx.db
      .query("creatorModerators")
      .withIndex("by_pair", (q) => q.eq("creatorId", args.creatorId).eq("moderatorId", checkUserId))
      .unique();

    if (!mod) {
      return { isMod: false, permissions: [] };
    }

    return {
      isMod: true,
      permissions: mod.permissions ?? PERMISSIONS,
    };
  },
});

/** Get creators where user is a moderator */
export const getMyModeratorships = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const modships = await ctx.db
      .query("creatorModerators")
      .withIndex("by_moderator", (q) => q.eq("moderatorId", userId))
      .take(100);

    // Enrich with creator data
    const enriched = await Promise.all(
      modships.map(async (mod) => {
        const creator = await ctx.db.get(mod.creatorId);
        if (!creator || creator.status !== "active") return null;

        return {
          _id: mod._id,
          creator: {
            _id: creator._id,
            username: creator.username,
            displayName: creator.displayName,
            avatarR2Key: creator.avatarR2Key,
            isVerified: creator.isVerified,
          },
          permissions: mod.permissions ?? PERMISSIONS,
          assignedAt: mod.assignedAt,
        };
      })
    );

    return enriched.filter((m) => m !== null);
  },
});

/** Check mod permission for a specific action */
export const checkModPermission = internalQuery({
  args: {
    creatorId: v.id("users"),
    moderatorId: v.id("users"),
    permission: v.union(
      v.literal("delete_comments"),
      v.literal("ban_users"),
      v.literal("pin_comments"),
      v.literal("manage_chat")
    ),
  },
  handler: async (ctx, args) => {
    // Creator always has all permissions
    if (args.moderatorId === args.creatorId) {
      return true;
    }

    const mod = await ctx.db
      .query("creatorModerators")
      .withIndex("by_pair", (q) =>
        q.eq("creatorId", args.creatorId).eq("moderatorId", args.moderatorId)
      )
      .unique();

    if (!mod) {
      return false;
    }

    const permissions = mod.permissions ?? PERMISSIONS;
    return permissions.includes(args.permission);
  },
});

// ===== MUTATIONS =====

/** Add a moderator */
export const addModerator = mutation({
  args: {
    moderatorId: v.id("users"),
    permissions: v.optional(
      v.array(
        v.union(
          v.literal("delete_comments"),
          v.literal("ban_users"),
          v.literal("pin_comments"),
          v.literal("manage_chat")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to add moderators");
    }

    // Check if moderator exists
    const moderator = await ctx.db.get(args.moderatorId);
    if (!moderator || moderator.status !== "active") {
      throw new Error("User not found");
    }

    // Can't add yourself as mod
    if (args.moderatorId === userId) {
      throw new Error("Cannot add yourself as a moderator");
    }

    // Check if already a mod
    const existing = await ctx.db
      .query("creatorModerators")
      .withIndex("by_pair", (q) => q.eq("creatorId", userId).eq("moderatorId", args.moderatorId))
      .unique();

    if (existing) {
      throw new Error("User is already a moderator");
    }

    // Add moderator
    const modId = await ctx.db.insert("creatorModerators", {
      creatorId: userId,
      moderatorId: args.moderatorId,
      permissions: args.permissions ?? [...PERMISSIONS],
      assignedAt: Date.now(),
    });

    // Notify the moderator
    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: args.moderatorId,
      type: "mod_added",
      actorId: userId,
    });

    return { modId };
  },
});

/** Remove a moderator */
export const removeModerator = mutation({
  args: { moderatorId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const mod = await ctx.db
      .query("creatorModerators")
      .withIndex("by_pair", (q) => q.eq("creatorId", userId).eq("moderatorId", args.moderatorId))
      .unique();

    if (!mod) {
      throw new Error("Moderator not found");
    }

    await ctx.db.delete(mod._id);

    return { success: true };
  },
});

/** Update moderator permissions */
export const updatePermissions = mutation({
  args: {
    moderatorId: v.id("users"),
    permissions: v.array(
      v.union(
        v.literal("delete_comments"),
        v.literal("ban_users"),
        v.literal("pin_comments"),
        v.literal("manage_chat")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const mod = await ctx.db
      .query("creatorModerators")
      .withIndex("by_pair", (q) => q.eq("creatorId", userId).eq("moderatorId", args.moderatorId))
      .unique();

    if (!mod) {
      throw new Error("Moderator not found");
    }

    await ctx.db.patch(mod._id, {
      permissions: args.permissions,
    });

    return { success: true };
  },
});

/** Resign as moderator (self-removal) */
export const resign = mutation({
  args: { creatorId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const mod = await ctx.db
      .query("creatorModerators")
      .withIndex("by_pair", (q) => q.eq("creatorId", args.creatorId).eq("moderatorId", userId))
      .unique();

    if (!mod) {
      throw new Error("You are not a moderator for this creator");
    }

    await ctx.db.delete(mod._id);

    return { success: true };
  },
});
