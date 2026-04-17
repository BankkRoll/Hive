/**
 * @fileoverview Two-Factor Authentication Data Layer
 *
 * Manages 2FA state and data operations for TOTP-based authentication.
 *
 * Features:
 *   - 2FA status queries for current user
 *   - Pending setup management with expiration
 *   - Backup codes storage with usage tracking
 *   - Recovery email configuration
 *   - Automatic cleanup of expired setups
 *
 * Security:
 *   - TOTP secrets stored securely and never exposed to client
 *   - Backup codes stored as SHA-256 hashes
 *   - Setup tokens expire after 10 minutes
 *   - Last verification timestamp tracked for audit
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ===== QUERIES =====

/** Check if 2FA is enabled for current user and return status details */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { enabled: false, hasSetup: false };

    const twoFactor = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!twoFactor) {
      return { enabled: false, hasSetup: false };
    }

    return {
      enabled: twoFactor.isEnabled,
      hasSetup: true,
      enabledAt: twoFactor.enabledAt,
      lastVerifiedAt: twoFactor.lastVerifiedAt,
      hasRecoveryEmail: !!twoFactor.recoveryEmail,
      backupCodesRemaining: twoFactor.backupCodes.filter((c) => !c.usedAt).length,
    };
  },
});

/** Check if there's a pending 2FA setup for the current user */
export const getPendingSetup = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const setup = await ctx.db
      .query("twoFactorSetup")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!setup || Date.now() > setup.expiresAt) {
      return null;
    }

    return {
      hasSetup: true,
      expiresAt: setup.expiresAt,
    };
  },
});

// ===== INTERNAL QUERIES =====

/** Get setup secret for verification (internal use only) */
export const getSetupSecret = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const setup = await ctx.db
      .query("twoFactorSetup")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!setup || Date.now() > setup.expiresAt) {
      return null;
    }

    return {
      totpSecret: setup.totpSecret,
      expiresAt: setup.expiresAt,
    };
  },
});

/** Check if a user has 2FA enabled (for admin action verification) */
export const hasTwoFactorEnabled = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const twoFactor = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    return twoFactor?.isEnabled ?? false;
  },
});

// ===== MUTATIONS =====

/** Update recovery email for 2FA account recovery */
export const updateRecoveryEmail = mutation({
  args: {
    recoveryEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const twoFactor = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!twoFactor) {
      throw new Error("2FA is not enabled");
    }

    await ctx.db.patch(twoFactor._id, {
      recoveryEmail: args.recoveryEmail.toLowerCase(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Store TOTP secret temporarily during setup (expires in 10 minutes) */
export const storeSetupSecret = internalMutation({
  args: {
    userId: v.id("users"),
    totpSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("twoFactorSetup")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const setupId = await ctx.db.insert("twoFactorSetup", {
      userId: args.userId,
      totpSecret: args.totpSecret,
      expiresAt: Date.now() + 10 * 60 * 1000,
      createdAt: Date.now(),
    });

    return { setupId };
  },
});

/** Enable 2FA after successful verification */
export const enable = internalMutation({
  args: {
    userId: v.id("users"),
    totpSecret: v.string(),
    backupCodeHashes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const now = Date.now();

    await ctx.db.insert("twoFactorAuth", {
      userId: args.userId,
      totpSecret: args.totpSecret,
      isEnabled: true,
      backupCodes: args.backupCodeHashes.map((hash) => ({
        codeHash: hash,
      })),
      enabledAt: now,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const setup = await ctx.db
      .query("twoFactorSetup")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (setup) {
      await ctx.db.delete(setup._id);
    }

    return { success: true };
  },
});

/** Disable 2FA for a user (called after verification) */
export const disableInternal = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const twoFactor = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!twoFactor) {
      throw new Error("2FA is not enabled");
    }

    await ctx.db.patch(twoFactor._id, {
      isEnabled: false,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Get 2FA data for verification (internal use only) */
export const getTwoFactorData = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const twoFactor = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!twoFactor || !twoFactor.isEnabled) {
      return null;
    }

    return {
      totpSecret: twoFactor.totpSecret,
      backupCodes: twoFactor.backupCodes,
    };
  },
});

/** Mark a backup code as used after successful verification */
export const markBackupCodeUsed = internalMutation({
  args: {
    userId: v.id("users"),
    codeIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const twoFactor = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (!twoFactor) {
      throw new Error("2FA not found");
    }

    const updatedCodes = [...twoFactor.backupCodes];
    updatedCodes[args.codeIndex] = {
      ...updatedCodes[args.codeIndex],
      usedAt: Date.now(),
    };

    await ctx.db.patch(twoFactor._id, {
      backupCodes: updatedCodes,
      lastVerifiedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Update last verified timestamp after successful verification */
export const updateLastVerified = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const twoFactor = await ctx.db
      .query("twoFactorAuth")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (twoFactor) {
      await ctx.db.patch(twoFactor._id, {
        lastVerifiedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/** Cleanup expired setup records (called by cron) */
export const cleanupExpiredSetups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("twoFactorSetup")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(500);

    for (const setup of expired) {
      await ctx.db.delete(setup._id);
    }

    return { cleaned: expired.length };
  },
});
