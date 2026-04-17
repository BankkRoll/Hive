/**
 * @fileoverview Promo Codes Module
 *
 * Creator promotional codes for subscriptions.
 *
 * Features:
 *   - Percentage, fixed amount, or trial discounts
 *   - Per-user and global usage limits
 *   - Tier-specific codes
 *   - Minimum purchase requirements
 *   - Expiration dates
 *   - Usage tracking and stats
 *
 * Limits:
 *   - Max 50 codes per creator
 *   - Code length: 3-20 characters
 *   - Trial period: 1-30 days
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MAX_PROMO_CODES_PER_CREATOR = 50;
const PROMO_CODE_REGEX = /^[A-Z0-9_-]+$/;

// ===== QUERIES =====

/** Get promo codes for a creator */
export const getMyCodes = query({
  args: {
    includeExpired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const codes = await ctx.db
      .query("promoCodes")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(MAX_PROMO_CODES_PER_CREATOR);

    const now = Date.now();

    // Filter expired if needed
    const filtered = args.includeExpired
      ? codes
      : codes.filter((c) => !c.expiresAt || c.expiresAt > now);

    return filtered.map((code) => ({
      ...code,
      isExpired: code.expiresAt ? code.expiresAt < now : false,
      isExhausted: code.usageLimit ? code.usageCount >= code.usageLimit : false,
    }));
  },
});

/** Validate a promo code for checkout */
export const validate = query({
  args: {
    code: v.string(),
    tierId: v.id("subscriptionTiers"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { valid: false, reason: "Not authenticated" };
    }

    const codeUpper = args.code.trim().toUpperCase();

    // Find the promo code
    const promoCode = await ctx.db
      .query("promoCodes")
      .withIndex("by_code", (q) => q.eq("code", codeUpper))
      .first();

    if (!promoCode) {
      return { valid: false, reason: "Invalid promo code" };
    }

    if (!promoCode.isActive) {
      return { valid: false, reason: "This promo code is no longer active" };
    }

    // Check expiration
    if (promoCode.expiresAt && promoCode.expiresAt < Date.now()) {
      return { valid: false, reason: "This promo code has expired" };
    }

    // Check usage limit
    if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
      return { valid: false, reason: "This promo code has reached its usage limit" };
    }

    // Check tier restriction
    if (promoCode.tierId && promoCode.tierId !== args.tierId) {
      return { valid: false, reason: "This promo code is not valid for this tier" };
    }

    // Get the tier to check min purchase
    const tier = await ctx.db.get(args.tierId);
    if (!tier || tier.creatorId !== promoCode.creatorId) {
      return { valid: false, reason: "Invalid subscription tier" };
    }

    // Check min purchase
    if (promoCode.minPurchase && tier.priceMonthly < promoCode.minPurchase) {
      return {
        valid: false,
        reason: `Minimum purchase of $${(promoCode.minPurchase / 100).toFixed(2)} required`,
      };
    }

    // Check per-user limit
    const perUserLimit = promoCode.perUserLimit ?? 1;
    const userUsages = await ctx.db
      .query("promoCodeUsages")
      .withIndex("by_user_promo", (q) => q.eq("userId", userId).eq("promoCodeId", promoCode._id))
      .take(perUserLimit);

    if (userUsages.length >= perUserLimit) {
      return { valid: false, reason: "You have already used this promo code" };
    }

    // Calculate discount
    let discountAmount = 0;
    let discountDescription = "";

    if (promoCode.discountType === "percent") {
      discountAmount = Math.floor(tier.priceMonthly * (promoCode.discountValue / 100));
      discountDescription = `${promoCode.discountValue}% off`;
    } else if (promoCode.discountType === "fixed") {
      discountAmount = Math.min(promoCode.discountValue, tier.priceMonthly);
      discountDescription = `$${(discountAmount / 100).toFixed(2)} off`;
    } else if (promoCode.discountType === "trial") {
      discountAmount = 0; // Trial doesn't reduce first payment
      discountDescription = `${promoCode.discountValue} day free trial`;
    }

    return {
      valid: true,
      promoCodeId: promoCode._id,
      discountType: promoCode.discountType,
      discountValue: promoCode.discountValue,
      discountAmount,
      discountDescription,
      originalPrice: tier.priceMonthly,
      finalPrice: tier.priceMonthly - discountAmount,
    };
  },
});

/** Get usage stats for a promo code */
export const getUsageStats = query({
  args: { promoCodeId: v.id("promoCodes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const promoCode = await ctx.db.get(args.promoCodeId);
    if (!promoCode || promoCode.creatorId !== userId) {
      return null;
    }

    const usages = await ctx.db
      .query("promoCodeUsages")
      .withIndex("by_promo", (q) => q.eq("promoCodeId", args.promoCodeId))
      .take(1000);

    const totalDiscountGiven = usages.reduce((sum, u) => sum + u.discountApplied, 0);

    return {
      totalUsages: usages.length,
      totalDiscountGiven,
      recentUsages: usages.slice(0, 10).map((u) => ({
        userId: u.userId,
        discountApplied: u.discountApplied,
        usedAt: u.usedAt,
      })),
    };
  },
});

// ===== MUTATIONS =====

/** Create a promo code */
export const create = mutation({
  args: {
    code: v.string(),
    discountType: v.union(v.literal("percent"), v.literal("fixed"), v.literal("trial")),
    discountValue: v.number(),
    tierId: v.optional(v.id("subscriptionTiers")),
    usageLimit: v.optional(v.number()),
    perUserLimit: v.optional(v.number()),
    minPurchase: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to create promo codes");
    }

    // Validate code format
    const code = args.code.trim().toUpperCase();
    if (!PROMO_CODE_REGEX.test(code)) {
      throw new Error("Promo code can only contain letters, numbers, hyphens, and underscores");
    }

    if (code.length < 3 || code.length > 20) {
      throw new Error("Promo code must be 3-20 characters");
    }

    // Check for duplicate code (globally unique)
    const existing = await ctx.db
      .query("promoCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (existing) {
      throw new Error("This promo code already exists");
    }

    // Validate discount value
    if (args.discountType === "percent") {
      if (args.discountValue < 1 || args.discountValue > 100) {
        throw new Error("Percentage discount must be between 1 and 100");
      }
    } else if (args.discountType === "fixed") {
      if (args.discountValue < 100) {
        throw new Error("Fixed discount must be at least $1.00");
      }
    } else if (args.discountType === "trial") {
      if (args.discountValue < 1 || args.discountValue > 30) {
        throw new Error("Trial period must be between 1 and 30 days");
      }
    }

    // Validate tier if specified
    if (args.tierId) {
      const tier = await ctx.db.get(args.tierId);
      if (!tier || tier.creatorId !== userId) {
        throw new Error("Invalid subscription tier");
      }
    }

    // Check promo code limit
    const currentCodes = await ctx.db
      .query("promoCodes")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .take(MAX_PROMO_CODES_PER_CREATOR);

    if (currentCodes.length >= MAX_PROMO_CODES_PER_CREATOR) {
      throw new Error(`Maximum ${MAX_PROMO_CODES_PER_CREATOR} promo codes allowed`);
    }

    // Create promo code
    const promoCodeId = await ctx.db.insert("promoCodes", {
      creatorId: userId,
      code,
      discountType: args.discountType,
      discountValue: args.discountValue,
      tierId: args.tierId,
      usageLimit: args.usageLimit,
      usageCount: 0,
      perUserLimit: args.perUserLimit ?? 1,
      minPurchase: args.minPurchase,
      expiresAt: args.expiresAt,
      isActive: true,
      createdAt: Date.now(),
    });

    return { promoCodeId, code };
  },
});

/** Update a promo code */
export const update = mutation({
  args: {
    promoCodeId: v.id("promoCodes"),
    usageLimit: v.optional(v.number()),
    perUserLimit: v.optional(v.number()),
    minPurchase: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const promoCode = await ctx.db.get(args.promoCodeId);
    if (!promoCode || promoCode.creatorId !== userId) {
      throw new Error("Promo code not found");
    }

    const updates: Record<string, unknown> = {};

    if (args.usageLimit !== undefined) {
      updates.usageLimit = args.usageLimit;
    }
    if (args.perUserLimit !== undefined) {
      updates.perUserLimit = args.perUserLimit;
    }
    if (args.minPurchase !== undefined) {
      updates.minPurchase = args.minPurchase;
    }
    if (args.expiresAt !== undefined) {
      updates.expiresAt = args.expiresAt;
    }
    if (args.isActive !== undefined) {
      updates.isActive = args.isActive;
    }

    await ctx.db.patch(args.promoCodeId, updates);

    return { success: true };
  },
});

/** Delete a promo code */
export const remove = mutation({
  args: { promoCodeId: v.id("promoCodes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const promoCode = await ctx.db.get(args.promoCodeId);
    if (!promoCode || promoCode.creatorId !== userId) {
      throw new Error("Promo code not found");
    }

    await ctx.db.delete(args.promoCodeId);

    return { success: true };
  },
});

// ===== INTERNAL FUNCTIONS =====

/** Record promo code usage */
export const recordUsage = internalMutation({
  args: {
    promoCodeId: v.id("promoCodes"),
    userId: v.id("users"),
    subscriptionId: v.optional(v.id("subscriptions")),
    discountApplied: v.number(),
  },
  handler: async (ctx, args) => {
    const promoCode = await ctx.db.get(args.promoCodeId);
    if (!promoCode) return;

    // Record usage
    await ctx.db.insert("promoCodeUsages", {
      promoCodeId: args.promoCodeId,
      userId: args.userId,
      subscriptionId: args.subscriptionId,
      discountApplied: args.discountApplied,
      usedAt: Date.now(),
    });

    // Increment usage count
    await ctx.db.patch(args.promoCodeId, {
      usageCount: promoCode.usageCount + 1,
    });

    // Deactivate if limit reached
    if (promoCode.usageLimit && promoCode.usageCount + 1 >= promoCode.usageLimit) {
      await ctx.db.patch(args.promoCodeId, {
        isActive: false,
      });
    }
  },
});

/** Get promo code by code (internal) */
export const getByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("promoCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();
  },
});
