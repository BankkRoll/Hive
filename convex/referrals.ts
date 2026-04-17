/**
 * @fileoverview Referrals Module
 *
 * User referral system with reward tracking.
 *
 * Features:
 *   - Unique referral code generation
 *   - Referral qualification tracking
 *   - Coin rewards for successful referrals
 *   - Referral statistics
 *
 * Flow:
 *   1. User signs up with referral code
 *   2. Referral status: "pending"
 *   3. User spends threshold amount
 *   4. Referral status: "qualified" -> "rewarded"
 *   5. Referrer receives coin bonus
 *
 * Limits:
 *   - Reward: 500 coins
 *   - Qualification threshold: $5.00 (500 cents)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const REFERRAL_REWARD_COINS = 500;
const REFERRAL_QUALIFICATION_THRESHOLD = 500;
const REFERRAL_CODE_LENGTH = 8;

// ===== QUERIES =====

/** Get my referral code and stats */
export const getMyReferralInfo = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    // Generate referral code if doesn't exist
    let referralCode = user.referralCode;

    // Get referral stats
    const referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", userId))
      .take(1000);

    const stats = {
      totalReferrals: referrals.length,
      pendingReferrals: referrals.filter((r) => r.status === "pending").length,
      qualifiedReferrals: referrals.filter((r) => r.status === "qualified").length,
      rewardedReferrals: referrals.filter((r) => r.status === "rewarded").length,
      totalEarnings: user.referralEarnings ?? 0,
    };

    return {
      referralCode,
      referralLink: referralCode
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/signup?ref=${referralCode}`
        : null,
      stats,
    };
  },
});

/** Get my referrals list */
export const getMyReferrals = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("qualified"), v.literal("rewarded"))
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    let referrals = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", userId))
      .order("desc")
      .take(limit * 2);

    if (args.status) {
      referrals = referrals.filter((r) => r.status === args.status);
    }

    const items = referrals.slice(0, limit);

    // Enrich with referred user data
    return Promise.all(
      items.map(async (referral) => {
        const referredUser = await ctx.db.get(referral.referredId);

        return {
          ...referral,
          referredUser: referredUser
            ? {
                _id: referredUser._id,
                username: referredUser.username,
                displayName: referredUser.displayName,
                avatarR2Key: referredUser.avatarR2Key,
              }
            : null,
        };
      })
    );
  },
});

/** Check if user was referred */
export const getMyReferrer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.referredBy) {
      return null;
    }

    const referrer = await ctx.db.get(user.referredBy);
    if (!referrer) {
      return null;
    }

    return {
      _id: referrer._id,
      username: referrer.username,
      displayName: referrer.displayName,
      avatarR2Key: referrer.avatarR2Key,
    };
  },
});

/** Validate referral code */
export const validateCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();

    const user = await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
      .first();

    if (!user) {
      return { valid: false, reason: "Invalid referral code" };
    }

    if (user.status !== "active") {
      return { valid: false, reason: "This referral code is no longer valid" };
    }

    return {
      valid: true,
      referrer: {
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatarR2Key: user.avatarR2Key,
      },
    };
  },
});

// ===== MUTATIONS =====

/** Generate or regenerate referral code */
export const generateReferralCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = generateCode();
      const existing = await ctx.db
        .query("users")
        .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
        .first();

      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique code. Please try again.");
    }

    await ctx.db.patch(userId, {
      referralCode: code,
    });

    return { code };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Apply referral code during signup */
export const applyReferralCode = internalMutation({
  args: {
    userId: v.id("users"),
    referralCode: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.referralCode.trim().toUpperCase();

    // Find referrer
    const referrer = await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", code))
      .first();

    if (!referrer) {
      return { success: false, reason: "Invalid referral code" };
    }

    if (referrer._id === args.userId) {
      return { success: false, reason: "Cannot refer yourself" };
    }

    if (referrer.status !== "active") {
      return { success: false, reason: "Referrer account is not active" };
    }

    // Update user with referrer
    await ctx.db.patch(args.userId, {
      referredBy: referrer._id,
    });

    // Create referral record
    await ctx.db.insert("referrals", {
      referrerId: referrer._id,
      referredId: args.userId,
      status: "pending",
      createdAt: Date.now(),
    });

    // Increment referrer's count
    await ctx.db.patch(referrer._id, {
      referralCount: (referrer.referralCount ?? 0) + 1,
    });

    // Notify referrer
    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: referrer._id,
      type: "referral_signup",
      actorId: args.userId,
    });

    return { success: true };
  },
});

/** Check if referral qualifies (called after purchase) */
export const checkQualification = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Find pending referral for this user
    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredId", args.userId))
      .first();

    if (!referral || referral.status !== "pending") {
      return { qualified: false };
    }

    // Check total spending
    const transactions = await ctx.db
      .query("coinTransactions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("type"), "purchase"))
      .take(100);

    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);

    if (totalSpent >= REFERRAL_QUALIFICATION_THRESHOLD) {
      // Mark as qualified
      await ctx.db.patch(referral._id, {
        status: "qualified",
        qualifiedAt: Date.now(),
      });

      // Schedule reward payout
      await ctx.scheduler.runAfter(0, internal.referrals.payReward, {
        referralId: referral._id,
      });

      return { qualified: true };
    }

    return { qualified: false, amountNeeded: REFERRAL_QUALIFICATION_THRESHOLD - totalSpent };
  },
});

/** Pay referral reward */
export const payReward = internalMutation({
  args: { referralId: v.id("referrals") },
  handler: async (ctx, args) => {
    const referral = await ctx.db.get(args.referralId);
    if (!referral || referral.status !== "qualified") {
      return { success: false };
    }

    const referrer = await ctx.db.get(referral.referrerId);
    if (!referrer) {
      return { success: false };
    }

    // Add coins to referrer
    await ctx.db.patch(referral.referrerId, {
      coinsBalance: (referrer.coinsBalance ?? 0) + REFERRAL_REWARD_COINS,
      referralEarnings: (referrer.referralEarnings ?? 0) + REFERRAL_REWARD_COINS,
    });

    // Create transaction record
    await ctx.db.insert("coinTransactions", {
      userId: referral.referrerId,
      type: "referral_bonus",
      amount: REFERRAL_REWARD_COINS,
      relatedUserId: referral.referredId,
      referralId: args.referralId,
      description: "Referral bonus",
      createdAt: Date.now(),
    });

    // Update referral status
    await ctx.db.patch(args.referralId, {
      status: "rewarded",
      rewardAmount: REFERRAL_REWARD_COINS,
      rewardPaidAt: Date.now(),
    });

    // Notify referrer
    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: referral.referrerId,
      type: "referral_reward",
      actorId: referral.referredId,
      amount: REFERRAL_REWARD_COINS,
    });

    return { success: true };
  },
});

// ===== INTERNAL QUERIES =====

/** Get user by referral code */
export const getUserByReferralCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_referralCode", (q) => q.eq("referralCode", args.code.toUpperCase()))
      .first();
  },
});

// ===== HELPERS =====

/** Generate a random referral code */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluded confusing chars
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
