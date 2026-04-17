/**
 * @fileoverview VIP Members Management
 *
 * Manages VIP member relationships between creators and their special members.
 * VIP status grants members special recognition and visibility within a creator's community.
 *
 * Features:
 *   - VIP assignment with optional private notes
 *   - Bulk VIP import for creators
 *   - VIP membership queries (by creator or member)
 *   - Automatic VIP removal on user block
 *
 * Security:
 *   - Only creators can manage their VIP list
 *   - Private notes are only visible to the creator
 *   - Users cannot add themselves as VIP
 *
 * Limits:
 *   - Maximum 100 VIPs per creator
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MAX_VIPS_PER_CREATOR = 100;

// ===== QUERIES =====

/** Retrieves VIP members for a creator with enriched user data */
export const getVIPs = query({
  args: {
    creatorId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const limit = args.limit ?? 100;

    const isCreator = userId === args.creatorId;

    const vips = await ctx.db
      .query("vipMembers")
      .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId))
      .order("desc")
      .take(limit);

    const enriched = await Promise.all(
      vips.map(async (vip) => {
        const member = await ctx.db.get(vip.memberId);
        if (!member || member.status !== "active") return null;

        return {
          _id: vip._id,
          member: {
            _id: member._id,
            username: member.username,
            displayName: member.displayName,
            avatarR2Key: member.avatarR2Key,
            isVerified: member.isVerified,
          },
          note: isCreator ? vip.note : undefined,
          assignedAt: vip.assignedAt,
        };
      })
    );

    return enriched.filter((v) => v !== null);
  },
});

/** Checks if a user has VIP status for a specific creator */
export const isVIP = query({
  args: {
    creatorId: v.id("users"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const checkUserId = args.userId ?? (await getAuthUserId(ctx));
    if (!checkUserId) {
      return false;
    }

    const vip = await ctx.db
      .query("vipMembers")
      .withIndex("by_pair", (q) => q.eq("creatorId", args.creatorId).eq("memberId", checkUserId))
      .unique();

    return vip !== null;
  },
});

/** Returns the total VIP count for a creator */
export const getVIPCount = query({
  args: { creatorId: v.id("users") },
  handler: async (ctx, args) => {
    const vips = await ctx.db
      .query("vipMembers")
      .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId))
      .take(MAX_VIPS_PER_CREATOR);

    return vips.length;
  },
});

/** Gets all creators where the current user holds VIP status */
export const getMyVIPMemberships = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const memberships = await ctx.db
      .query("vipMembers")
      .withIndex("by_member", (q) => q.eq("memberId", userId))
      .take(100);

    const enriched = await Promise.all(
      memberships.map(async (vip) => {
        const creator = await ctx.db.get(vip.creatorId);
        if (!creator || creator.status !== "active") return null;

        return {
          _id: vip._id,
          creator: {
            _id: creator._id,
            username: creator.username,
            displayName: creator.displayName,
            avatarR2Key: creator.avatarR2Key,
            isVerified: creator.isVerified,
          },
          assignedAt: vip.assignedAt,
        };
      })
    );

    return enriched.filter((v) => v !== null);
  },
});

// ===== MUTATIONS =====

/** Adds a member to the creator's VIP list */
export const addVIP = mutation({
  args: {
    memberId: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to add VIPs");
    }

    const member = await ctx.db.get(args.memberId);
    if (!member || member.status !== "active") {
      throw new Error("User not found");
    }

    if (args.memberId === userId) {
      throw new Error("Cannot add yourself as a VIP");
    }

    const existing = await ctx.db
      .query("vipMembers")
      .withIndex("by_pair", (q) => q.eq("creatorId", userId).eq("memberId", args.memberId))
      .unique();

    if (existing) {
      throw new Error("User is already a VIP");
    }

    const currentVIPs = await ctx.db
      .query("vipMembers")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(MAX_VIPS_PER_CREATOR);

    if (currentVIPs.length >= MAX_VIPS_PER_CREATOR) {
      throw new Error(`Maximum ${MAX_VIPS_PER_CREATOR} VIPs allowed`);
    }

    const vipId = await ctx.db.insert("vipMembers", {
      creatorId: userId,
      memberId: args.memberId,
      note: args.note?.trim(),
      assignedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: args.memberId,
      type: "vip_added",
      actorId: userId,
    });

    return { vipId };
  },
});

/** Removes a member from the creator's VIP list */
export const removeVIP = mutation({
  args: { memberId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const vip = await ctx.db
      .query("vipMembers")
      .withIndex("by_pair", (q) => q.eq("creatorId", userId).eq("memberId", args.memberId))
      .unique();

    if (!vip) {
      throw new Error("VIP not found");
    }

    await ctx.db.delete(vip._id);

    return { success: true };
  },
});

/** Updates the private note for a VIP member */
export const updateVIPNote = mutation({
  args: {
    memberId: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const vip = await ctx.db
      .query("vipMembers")
      .withIndex("by_pair", (q) => q.eq("creatorId", userId).eq("memberId", args.memberId))
      .unique();

    if (!vip) {
      throw new Error("VIP not found");
    }

    await ctx.db.patch(vip._id, {
      note: args.note?.trim(),
    });

    return { success: true };
  },
});

/** Imports multiple VIPs at once, skipping duplicates and invalid users */
export const bulkAddVIPs = mutation({
  args: {
    memberIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to add VIPs");
    }

    const currentVIPs = await ctx.db
      .query("vipMembers")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(MAX_VIPS_PER_CREATOR);

    const availableSlots = MAX_VIPS_PER_CREATOR - currentVIPs.length;
    if (args.memberIds.length > availableSlots) {
      throw new Error(`Only ${availableSlots} VIP slots available`);
    }

    let added = 0;
    const now = Date.now();

    for (const memberId of args.memberIds) {
      const existing = await ctx.db
        .query("vipMembers")
        .withIndex("by_pair", (q) => q.eq("creatorId", userId).eq("memberId", memberId))
        .unique();

      if (existing) continue;

      const member = await ctx.db.get(memberId);
      if (!member || member.status !== "active" || memberId === userId) {
        continue;
      }

      await ctx.db.insert("vipMembers", {
        creatorId: userId,
        memberId,
        assignedAt: now,
      });

      await ctx.scheduler.runAfter(0, internal.notifications.create, {
        userId: memberId,
        type: "vip_added",
        actorId: userId,
      });

      added++;
    }

    return { added };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Removes VIP status when a user is blocked by the creator */
export const removeVIPOnBlock = internalMutation({
  args: {
    creatorId: v.id("users"),
    memberId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const vip = await ctx.db
      .query("vipMembers")
      .withIndex("by_pair", (q) => q.eq("creatorId", args.creatorId).eq("memberId", args.memberId))
      .unique();

    if (vip) {
      await ctx.db.delete(vip._id);
    }
  },
});
