/**
 * @fileoverview Security Module
 *
 * Provides comprehensive security features for user account protection,
 * login tracking, session management, and suspicious activity detection.
 *
 * Features:
 *   - Login history tracking with device/IP information
 *   - Suspicious login pattern detection
 *   - Automatic user suspension/unsuspension scheduling
 *   - IP-based rate limiting and blocking
 *   - Session invalidation on password changes
 *   - Security statistics for admin dashboard
 *
 * Security:
 *   - Admin-only access for sensitive queries (getLoginHistoryAdmin, getSecurityStats)
 *   - IP blocking after 10+ failed attempts per hour
 *   - Suspicious activity flagged after 5+ failed attempts or multiple IPs
 *   - All sessions invalidated on password change/reset
 *
 * Limits:
 *   - Login history retained for 90 days (auto-archived)
 *   - Batch processing limited to 100 records per operation
 *   - Rate limiting: 10 failed login attempts per IP per hour
 */

import { internalMutation, internalQuery, query } from "./_generated/server";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";

// ===== INTERNAL MUTATIONS =====

/** Records a login attempt with device and location metadata */
export const recordLogin = internalMutation({
  args: {
    userId: v.id("users"),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    deviceType: v.optional(
      v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet"), v.literal("unknown"))
    ),
    location: v.optional(v.string()),
    success: v.boolean(),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("loginHistory", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/** Archives login history older than 90 days in batches */
export const archiveLoginHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const oldEntries = await ctx.db
      .query("loginHistory")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", ninetyDaysAgo))
      .take(100);

    for (const entry of oldEntries) {
      await ctx.db.delete(entry._id);
    }

    if (oldEntries.length === 100) {
      await ctx.scheduler.runAfter(1000, internal.security.archiveLoginHistory, {});
    }

    return { deleted: oldEntries.length };
  },
});

/** Automatically unsuspends a user when their suspension period expires */
export const autoUnsuspendUser = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      return { success: false, reason: "User not found" };
    }

    if (user.status !== "suspended") {
      return { success: false, reason: "User not suspended" };
    }

    if (user.suspendedUntil && user.suspendedUntil > Date.now()) {
      return { success: false, reason: "Suspension not yet expired" };
    }

    await ctx.db.patch(args.userId, {
      status: "active",
      suspendedUntil: undefined,
      suspendReason: undefined,
      unsuspendFunctionId: undefined,
    });

    return { success: true };
  },
});

/** Daily cron fallback to catch any missed suspension expirations */
export const checkSuspensions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const suspendedUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "suspended"))
      .take(100);

    let unsuspendedCount = 0;

    for (const user of suspendedUsers) {
      if (user.suspendedUntil && user.suspendedUntil <= now) {
        await ctx.scheduler.runAfter(0, internal.security.autoUnsuspendUser, {
          userId: user._id,
        });
        unsuspendedCount++;
      }
    }

    return { unsuspendedCount };
  },
});

/**
 * Invalidates all sessions for a user on password change/reset.
 * Deletes auth sessions and refresh tokens, forcing re-authentication.
 */
export const invalidateUserSessions = internalMutation({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { success: false, reason: "user_not_found" };
    }

    await ctx.db.patch(args.userId, {
      passwordChangedAt: Date.now(),
    });

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .take(100);

    let deletedSessions = 0;
    for (const session of sessions) {
      await ctx.db.delete(session._id);
      deletedSessions++;
    }

    const refreshTokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId").take(500);

    let deletedTokens = 0;
    for (const token of refreshTokens) {
      const sessionExists = await ctx.db.get(token.sessionId);
      if (!sessionExists) {
        await ctx.db.delete(token._id);
        deletedTokens++;
      }
    }

    await ctx.db.insert("loginHistory", {
      userId: args.userId,
      success: true,
      createdAt: Date.now(),
      failureReason: `sessions_invalidated:${args.reason ?? "password_change"}`,
    });

    return {
      success: true,
      deletedSessions,
      deletedTokens,
    };
  },
});

// ===== INTERNAL QUERIES =====

/** Analyzes recent login patterns to detect suspicious activity */
export const checkSuspiciousLogins = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const recentLogins = await ctx.db
      .query("loginHistory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId).gt("createdAt", oneHourAgo))
      .take(100);

    const failedAttempts = recentLogins.filter((l) => !l.success);

    const uniqueIPs = new Set(recentLogins.filter((l) => l.ipAddress).map((l) => l.ipAddress));

    return {
      totalAttempts: recentLogins.length,
      failedAttempts: failedAttempts.length,
      uniqueIPs: uniqueIPs.size,
      suspicious: failedAttempts.length > 5 || (uniqueIPs.size > 3 && recentLogins.length > 5),
    };
  },
});

/** Checks if an IP address should be blocked due to excessive failed attempts */
export const isIPBlocked = internalQuery({
  args: {
    ipAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const failedLogins = await ctx.db
      .query("loginHistory")
      .withIndex("by_ip_success", (q) =>
        q.eq("ipAddress", args.ipAddress).eq("success", false).gt("createdAt", oneHourAgo)
      )
      .take(11);

    return failedLogins.length > 10;
  },
});

// ===== QUERIES =====

/** Retrieves login history for the authenticated user */
export const getLoginHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 20;

    const history = await ctx.db
      .query("loginHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    return history;
  },
});

/** Retrieves login history for any user (admin only) */
export const getLoginHistoryAdmin = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db.get(currentUserId);
    if (
      !currentUser ||
      (currentUser.role !== "admin" &&
        currentUser.role !== "super_admin" &&
        currentUser.role !== "platform_mod")
    ) {
      throw new Error("Not authorized");
    }

    const limit = args.limit ?? 50;

    const history = await ctx.db
      .query("loginHistory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    return history;
  },
});

/** Returns count of unique active sessions in the last 24 hours */
export const getActiveSessionsCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return 0;
    }

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const recentLogins = await ctx.db
      .query("loginHistory")
      .withIndex("by_user", (q) => q.eq("userId", userId).gt("createdAt", oneDayAgo))
      .take(100);

    const successfulLogins = recentLogins.filter((l) => l.success);

    const uniqueDevices = new Set(
      successfulLogins.map((l) => `${l.ipAddress || "unknown"}-${l.userAgent || "unknown"}`)
    );

    return uniqueDevices.size;
  },
});

/** Returns platform-wide security statistics (admin only) */
export const getSecurityStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (
      !user ||
      (user.role !== "admin" && user.role !== "super_admin" && user.role !== "platform_mod")
    ) {
      return null;
    }

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const successfulLogins = await ctx.db
      .query("loginHistory")
      .withIndex("by_success_createdAt", (q) => q.eq("success", true).gt("createdAt", oneDayAgo))
      .take(500);

    const failedLogins = await ctx.db
      .query("loginHistory")
      .withIndex("by_success_createdAt", (q) => q.eq("success", false).gt("createdAt", oneDayAgo))
      .take(500);

    const totalLogins = successfulLogins.length + failedLogins.length;

    const suspendedUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "suspended"))
      .take(500);

    const bannedUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "banned"))
      .take(500);

    return {
      loginsLast24h: totalLogins,
      failedLoginsLast24h: failedLogins.length,
      failureRate: totalLogins > 0 ? (failedLogins.length / totalLogins) * 100 : 0,
      suspendedUsers: suspendedUsers.length,
      bannedUsers: bannedUsers.length,
    };
  },
});
