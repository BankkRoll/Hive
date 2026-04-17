/**
 * @fileoverview Gift Subscriptions Module
 *
 * Allows users to gift subscriptions to other users.
 *
 * Features:
 *   - Purchase gift subscriptions (1, 3, 6, or 12 months)
 *   - Send to specific user or email
 *   - Redemption via unique codes (12-char alphanumeric)
 *   - 90-day expiration for unredeemed gifts
 *   - Gift message support
 *
 * Security:
 *   - Cannot gift to yourself
 *   - Code uses non-ambiguous characters
 *   - Expired gifts marked automatically
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// ===== HELPERS =====

/** Generate a unique 12-character redemption code */
function generateRedemptionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ===== QUERIES =====

/** Get gifts sent by current user */
export const getMyGiftsSent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const gifts = await ctx.db
      .query("giftSubscriptions")
      .withIndex("by_gifter", (q) => q.eq("gifterId", userId))
      .order("desc")
      .take(50);

    const enriched = await Promise.all(
      gifts.map(async (gift) => {
        const creator = await ctx.db.get(gift.creatorId);
        const recipient = gift.recipientId ? await ctx.db.get(gift.recipientId) : null;
        const tier = gift.tierId ? await ctx.db.get(gift.tierId) : null;

        return {
          ...gift,
          creator: creator
            ? {
                _id: creator._id,
                username: creator.username,
                displayName: creator.displayName,
                avatarR2Key: creator.avatarR2Key,
              }
            : null,
          recipient: recipient
            ? {
                _id: recipient._id,
                username: recipient.username,
                displayName: recipient.displayName,
                avatarR2Key: recipient.avatarR2Key,
              }
            : null,
          tier: tier ? { _id: tier._id, name: tier.name } : null,
        };
      })
    );

    return enriched;
  },
});

/** Get gifts received by current user (pending redemption) */
export const getMyGiftsReceived = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const gifts = await ctx.db
      .query("giftSubscriptions")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId).eq("status", "paid"))
      .take(50);

    const enriched = await Promise.all(
      gifts.map(async (gift) => {
        const gifter = await ctx.db.get(gift.gifterId);
        const creator = await ctx.db.get(gift.creatorId);
        const tier = gift.tierId ? await ctx.db.get(gift.tierId) : null;

        return {
          ...gift,
          gifter: gifter
            ? {
                _id: gifter._id,
                username: gifter.username,
                displayName: gifter.displayName,
                avatarR2Key: gifter.avatarR2Key,
              }
            : null,
          creator: creator
            ? {
                _id: creator._id,
                username: creator.username,
                displayName: creator.displayName,
                avatarR2Key: creator.avatarR2Key,
              }
            : null,
          tier: tier ? { _id: tier._id, name: tier.name } : null,
        };
      })
    );

    return enriched;
  },
});

/** Check gift validity by redemption code */
export const checkCode = query({
  args: { redemptionCode: v.string() },
  handler: async (ctx, args) => {
    const normalizedCode = args.redemptionCode.replace(/-/g, "").toUpperCase();
    const formattedCode = normalizedCode.match(/.{1,4}/g)?.join("-") || normalizedCode;

    const gift = await ctx.db
      .query("giftSubscriptions")
      .withIndex("by_redemption_code", (q) => q.eq("redemptionCode", formattedCode))
      .unique();

    if (!gift || gift.status !== "paid") {
      return { valid: false };
    }

    if (Date.now() > gift.expiresAt) {
      return { valid: false, reason: "expired" };
    }

    const creator = await ctx.db.get(gift.creatorId);
    const gifter = await ctx.db.get(gift.gifterId);

    return {
      valid: true,
      durationMonths: gift.durationMonths,
      giftMessage: gift.giftMessage,
      creator: creator
        ? {
            _id: creator._id,
            username: creator.username,
            displayName: creator.displayName,
            avatarR2Key: creator.avatarR2Key,
          }
        : null,
      gifter: gifter ? { displayName: gifter.displayName, username: gifter.username } : null,
    };
  },
});

// ===== MUTATIONS =====

/** Create a gift subscription (pending payment) */
export const create = mutation({
  args: {
    creatorId: v.id("users"),
    tierId: v.id("subscriptionTiers"),
    durationMonths: v.number(),
    recipientId: v.optional(v.id("users")),
    recipientEmail: v.optional(v.string()),
    giftMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (![1, 3, 6, 12].includes(args.durationMonths)) {
      throw new Error("Invalid duration. Must be 1, 3, 6, or 12 months.");
    }

    if (!args.recipientId && !args.recipientEmail) {
      throw new Error("Must provide either recipient user or email");
    }

    if (args.recipientId === userId) {
      throw new Error("You cannot gift a subscription to yourself");
    }

    const creator = await ctx.db.get(args.creatorId);
    if (!creator || creator.role !== "creator") {
      throw new Error("Invalid creator");
    }

    const tier = await ctx.db.get(args.tierId);
    if (!tier || tier.creatorId !== args.creatorId) {
      throw new Error("Invalid subscription tier");
    }

    const totalAmount = tier.priceMonthly * args.durationMonths;
    const redemptionCode = generateRedemptionCode();
    const expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;

    const giftId = await ctx.db.insert("giftSubscriptions", {
      gifterId: userId,
      recipientId: args.recipientId,
      recipientEmail: args.recipientEmail?.toLowerCase(),
      creatorId: args.creatorId,
      tierId: args.tierId,
      durationMonths: args.durationMonths,
      amountPaid: totalAmount,
      status: "pending_payment",
      redemptionCode,
      giftMessage: args.giftMessage,
      expiresAt,
      createdAt: Date.now(),
    });

    return { success: true, giftId, amount: totalAmount, redemptionCode };
  },
});

/** Redeem a gift subscription */
export const redeem = mutation({
  args: { redemptionCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const normalizedCode = args.redemptionCode.replace(/-/g, "").toUpperCase();
    const formattedCode = normalizedCode.match(/.{1,4}/g)?.join("-") || normalizedCode;

    const gift = await ctx.db
      .query("giftSubscriptions")
      .withIndex("by_redemption_code", (q) => q.eq("redemptionCode", formattedCode))
      .unique();

    if (!gift) throw new Error("Invalid redemption code");

    if (gift.status !== "paid") {
      if (gift.status === "redeemed") throw new Error("This gift has already been redeemed");
      if (gift.status === "expired") throw new Error("This gift has expired");
      throw new Error("This gift is not available for redemption");
    }

    if (Date.now() > gift.expiresAt) {
      await ctx.db.patch(gift._id, { status: "expired" });
      throw new Error("This gift has expired");
    }

    const existingSubscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", userId).eq("creatorId", gift.creatorId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existingSubscription) {
      throw new Error("You already have an active subscription to this creator");
    }

    const now = Date.now();
    const endDate = now + gift.durationMonths * 30 * 24 * 60 * 60 * 1000;

    const subscriptionId = await ctx.db.insert("subscriptions", {
      fanId: userId,
      creatorId: gift.creatorId,
      tierId: gift.tierId,
      status: "active",
      priceAtSubscription: gift.amountPaid / gift.durationMonths,
      currentPeriodStart: now,
      currentPeriodEnd: endDate,
      isGift: true,
      giftedBy: gift.gifterId,
      cancelAtPeriodEnd: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(gift._id, {
      status: "redeemed",
      redeemedAt: now,
      redeemedBy: userId,
      subscriptionId,
    });

    const redeemer = await ctx.db.get(userId);
    const creator = await ctx.db.get(gift.creatorId);

    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: gift.gifterId,
      type: "system",
      actorId: userId,
      message: `${redeemer?.displayName || redeemer?.username} redeemed your gift subscription to ${creator?.displayName || creator?.username}!`,
    });

    return { success: true, subscriptionId, creatorId: gift.creatorId };
  },
});

// ===== INTERNAL =====

/** Mark gift as paid after Stripe payment */
export const markPaid = internalMutation({
  args: {
    giftId: v.id("giftSubscriptions"),
    stripePaymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    const gift = await ctx.db.get(args.giftId);
    if (!gift) throw new Error("Gift not found");
    if (gift.status !== "pending_payment") throw new Error("Gift is not pending payment");

    await ctx.db.patch(args.giftId, {
      status: "paid",
      stripePaymentIntentId: args.stripePaymentIntentId,
    });

    if (gift.recipientId) {
      const gifter = await ctx.db.get(gift.gifterId);
      const creator = await ctx.db.get(gift.creatorId);

      await ctx.scheduler.runAfter(0, internal.notifications.create, {
        userId: gift.recipientId,
        type: "system",
        actorId: gift.gifterId,
        message: `${gifter?.displayName || gifter?.username || "Someone"} gifted you a ${gift.durationMonths}-month subscription to ${creator?.displayName || creator?.username}!`,
      });
    }

    return { success: true };
  },
});

/** Cleanup expired unredeemed gifts */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredGifts = await ctx.db
      .query("giftSubscriptions")
      .withIndex("by_status", (q) => q.eq("status", "paid"))
      .take(500);

    let cleaned = 0;
    for (const gift of expiredGifts) {
      if (now > gift.expiresAt) {
        await ctx.db.patch(gift._id, { status: "expired" });
        cleaned++;
      }
    }

    return { cleaned };
  },
});
