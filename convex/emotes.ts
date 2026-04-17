/**
 * @fileoverview Custom Emotes Module
 *
 * Creator-specific custom emotes with tier-based access control.
 *
 * Features:
 *   - Create/update/delete custom emotes (creator only)
 *   - Tier-based access: free, subscriber, VIP
 *   - Emote code validation (alphanumeric + underscore)
 *   - Usage tracking
 *   - Max 50 emotes per creator
 *
 * Access Levels:
 *   - Free: Available to everyone
 *   - Subscriber: Requires active subscription
 *   - VIP: Requires VIP membership
 *   - Creator always has full access to their own emotes
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";

const MAX_EMOTES_PER_CREATOR = 50;
const EMOTE_CODE_REGEX = /^[a-zA-Z0-9_]+$/;

// ===== QUERIES =====

/** Get emotes for a creator */
export const getEmotes = query({
  args: {
    creatorId: v.id("users"),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const isCreator = userId === args.creatorId;

    let emotes;
    if (args.includeInactive && isCreator) {
      emotes = await ctx.db
        .query("emotes")
        .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId))
        .take(MAX_EMOTES_PER_CREATOR);
    } else {
      emotes = await ctx.db
        .query("emotes")
        .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId).eq("isActive", true))
        .take(MAX_EMOTES_PER_CREATOR);
    }

    const withUrls = await Promise.all(
      emotes.map(async (emote) => {
        const url = await ctx.storage.getUrl(emote.imageId);
        return { ...emote, imageUrl: url };
      })
    );

    return withUrls;
  },
});

/** Get emotes available to user based on their access level */
export const getAvailableEmotes = query({
  args: { creatorId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const emotes = await ctx.db
      .query("emotes")
      .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId).eq("isActive", true))
      .take(MAX_EMOTES_PER_CREATOR);

    if (!userId) {
      const freeEmotes = emotes.filter((e) => e.tier === "free");
      return Promise.all(
        freeEmotes.map(async (emote) => ({
          ...emote,
          imageUrl: await ctx.storage.getUrl(emote.imageId),
        }))
      );
    }

    const isCreator = userId === args.creatorId;

    const isVIP = await ctx.db
      .query("vipMembers")
      .withIndex("by_pair", (q) => q.eq("creatorId", args.creatorId).eq("memberId", userId))
      .unique();

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", userId).eq("creatorId", args.creatorId))
      .first();

    const isSubscriber = subscription?.status === "active";

    const accessibleEmotes = emotes.filter((emote) => {
      if (isCreator || isVIP) return true;
      if (emote.tier === "vip") return false;
      if (emote.tier === "subscriber") return isSubscriber;
      return true;
    });

    return Promise.all(
      accessibleEmotes.map(async (emote) => ({
        ...emote,
        imageUrl: await ctx.storage.getUrl(emote.imageId),
      }))
    );
  },
});

/** Get emote by code */
export const getByCode = query({
  args: {
    creatorId: v.id("users"),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const emote = await ctx.db
      .query("emotes")
      .withIndex("by_code", (q) => q.eq("creatorId", args.creatorId).eq("code", args.code))
      .first();

    if (!emote || !emote.isActive) return null;

    const url = await ctx.storage.getUrl(emote.imageId);
    return { ...emote, imageUrl: url };
  },
});

/** Get emote count for a creator */
export const getEmoteCount = query({
  args: { creatorId: v.id("users") },
  handler: async (ctx, args) => {
    const emotes = await ctx.db
      .query("emotes")
      .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId))
      .take(MAX_EMOTES_PER_CREATOR);

    return {
      total: emotes.length,
      active: emotes.filter((e) => e.isActive).length,
      max: MAX_EMOTES_PER_CREATOR,
    };
  },
});

// ===== MUTATIONS =====

/** Create a new emote */
export const create = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    imageId: v.id("_storage"),
    tier: v.optional(v.union(v.literal("free"), v.literal("subscriber"), v.literal("vip"))),
    isAnimated: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to create emotes");
    }

    const code = args.code.trim().toLowerCase();
    if (!EMOTE_CODE_REGEX.test(code)) {
      throw new Error("Emote code can only contain letters, numbers, and underscores");
    }

    if (code.length < 2 || code.length > 20) {
      throw new Error("Emote code must be 2-20 characters");
    }

    const existing = await ctx.db
      .query("emotes")
      .withIndex("by_code", (q) => q.eq("creatorId", userId).eq("code", code))
      .first();

    if (existing) throw new Error("An emote with this code already exists");

    const currentEmotes = await ctx.db
      .query("emotes")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(MAX_EMOTES_PER_CREATOR);

    if (currentEmotes.length >= MAX_EMOTES_PER_CREATOR) {
      throw new Error(`Maximum ${MAX_EMOTES_PER_CREATOR} emotes allowed`);
    }

    const emoteId = await ctx.db.insert("emotes", {
      creatorId: userId,
      name: args.name.trim(),
      code,
      imageId: args.imageId,
      tier: args.tier ?? "subscriber",
      isAnimated: args.isAnimated ?? false,
      isActive: true,
      usageCount: 0,
      createdAt: Date.now(),
    });

    return { emoteId };
  },
});

/** Update an emote */
export const update = mutation({
  args: {
    emoteId: v.id("emotes"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    tier: v.optional(v.union(v.literal("free"), v.literal("subscriber"), v.literal("vip"))),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const emote = await ctx.db.get(args.emoteId);
    if (!emote || emote.creatorId !== userId) {
      throw new Error("Emote not found");
    }

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) {
      updates.name = args.name.trim();
    }

    if (args.code !== undefined) {
      const code = args.code.trim().toLowerCase();
      if (!EMOTE_CODE_REGEX.test(code)) {
        throw new Error("Emote code can only contain letters, numbers, and underscores");
      }
      if (code.length < 2 || code.length > 20) {
        throw new Error("Emote code must be 2-20 characters");
      }

      const existing = await ctx.db
        .query("emotes")
        .withIndex("by_code", (q) => q.eq("creatorId", userId).eq("code", code))
        .first();

      if (existing && existing._id !== args.emoteId) {
        throw new Error("An emote with this code already exists");
      }

      updates.code = code;
    }

    if (args.imageId !== undefined) updates.imageId = args.imageId;
    if (args.tier !== undefined) updates.tier = args.tier;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.emoteId, updates);

    return { success: true };
  },
});

/** Delete an emote */
export const remove = mutation({
  args: { emoteId: v.id("emotes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const emote = await ctx.db.get(args.emoteId);
    if (!emote || emote.creatorId !== userId) {
      throw new Error("Emote not found");
    }

    await ctx.storage.delete(emote.imageId);
    await ctx.db.delete(args.emoteId);

    return { success: true };
  },
});

/** Generate upload URL for emote image */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to upload emotes");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

// ===== INTERNAL =====

/** Increment emote usage count */
export const incrementUsage = internalMutation({
  args: { emoteId: v.id("emotes") },
  handler: async (ctx, args) => {
    const emote = await ctx.db.get(args.emoteId);
    if (!emote) return;

    await ctx.db.patch(args.emoteId, {
      usageCount: (emote.usageCount ?? 0) + 1,
    });
  },
});
