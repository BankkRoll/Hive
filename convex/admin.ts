/**
 * @fileoverview Admin Module - Platform Administration & Moderation
 *
 * Handles all administrative operations: RBAC, user management, content moderation,
 * rate limiting, and platform statistics.
 *
 * Role Hierarchy (lowest to highest):
 *   user (0) < creator (1) < platform_mod (2) < admin (3) < super_admin (4)
 *
 * Security:
 *   - All mutations require appropriate role levels
 *   - Admins cannot modify users with equal or higher roles
 *   - Sensitive actions (ban, role change) support optional 2FA
 *   - All admin actions logged to adminActions table for audit trail
 *   - IP addresses hashed before storage for privacy
 */

import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  action,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";
import type { Doc } from "./_generated/dataModel";

// ===== TYPES & CONSTANTS =====

type UserRole = "user" | "creator" | "platform_mod" | "admin" | "super_admin";

const roleHierarchy: Record<UserRole, number> = {
  user: 0,
  creator: 1,
  platform_mod: 2,
  admin: 3,
  super_admin: 4,
};

const adminActionValidator = v.union(
  v.literal("user_suspended"),
  v.literal("user_banned"),
  v.literal("user_unbanned"),
  v.literal("user_verified"),
  v.literal("post_removed"),
  v.literal("comment_removed"),
  v.literal("report_resolved"),
  v.literal("payout_approved"),
  v.literal("payout_rejected"),
  v.literal("role_changed"),
  v.literal("connect_deauthorized")
);

const RATE_LIMITS = {
  message: { requests: 10, windowMs: 60000 },
  post: { requests: 5, windowMs: 60000 },
  comment: { requests: 20, windowMs: 60000 },
  tip: { requests: 10, windowMs: 60000 },
  upload: { requests: 10, windowMs: 300000 },
  payout: { requests: 3, windowMs: 3600000 },
  account_delete: { requests: 1, windowMs: 86400000 },
  like: { requests: 60, windowMs: 60000 },
  follow: { requests: 30, windowMs: 60000 },
  search: { requests: 30, windowMs: 60000 },
};

const IP_RATE_LIMITS = {
  profile_meta: { requests: 60, windowMs: 60000 },
};

// ===== RBAC HELPERS =====

/** Get numeric level for a role */
export function getRoleLevel(role: string | undefined): number {
  return roleHierarchy[role as UserRole] ?? 0;
}

/** Check if user role meets minimum requirement */
export function hasMinRole(userRole: string | undefined, minRole: UserRole): boolean {
  return getRoleLevel(userRole) >= roleHierarchy[minRole];
}

/** Get authenticated user, throw if not found or inactive */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  if (user.status !== "active") throw new Error(`Account is ${user.status}`);

  return user;
}

/** Require user has at least the specified role */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  minRole: UserRole
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!hasMinRole(user.role, minRole)) {
    throw new Error(`Role '${minRole}' or higher required`);
  }
  return user;
}

/** Require admin role */
export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  return await requireRole(ctx, "admin");
}

/** Require super_admin role */
export async function requireSuperAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  return await requireRole(ctx, "super_admin");
}

/** Require platform_mod role or higher */
export async function requireMod(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  return await requireRole(ctx, "platform_mod");
}

// ===== ADMIN ACTION LOGGING =====

/** Log admin action to audit table */
export const logAction = internalMutation({
  args: {
    adminId: v.id("users"),
    targetUserId: v.optional(v.id("users")),
    targetPostId: v.optional(v.id("posts")),
    targetCommentId: v.optional(v.id("comments")),
    action: adminActionValidator,
    reason: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("adminActions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ===== USER MANAGEMENT =====

/** Suspend user for specified duration (default 7 days) */
export const suspendUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
    durationDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireMod(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    if (getRoleLevel(targetUser.role) >= getRoleLevel(admin.role)) {
      throw new Error("Cannot suspend user with equal or higher role");
    }

    const durationMs = args.durationDays
      ? args.durationDays * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    const suspendedUntil = Date.now() + durationMs;

    if (targetUser.unsuspendFunctionId) {
      await ctx.scheduler.cancel(targetUser.unsuspendFunctionId);
    }

    const unsuspendFunctionId = await ctx.scheduler.runAt(
      suspendedUntil,
      internal.security.autoUnsuspendUser,
      { userId: args.userId }
    );

    await ctx.db.patch(args.userId, {
      status: "suspended",
      suspendedUntil,
      suspendReason: args.reason,
      unsuspendFunctionId,
    });

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: admin._id,
      targetUserId: args.userId,
      action: "user_suspended",
      reason: args.reason,
      metadata: JSON.stringify({ durationDays: args.durationDays }),
    });

    return { success: true };
  },
});

/** Permanently ban user (admin only) */
export const banUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    if (getRoleLevel(targetUser.role) >= getRoleLevel(admin.role)) {
      throw new Error("Cannot ban user with equal or higher role");
    }

    await ctx.db.patch(args.userId, {
      status: "banned",
      suspendReason: args.reason,
    });

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: admin._id,
      targetUserId: args.userId,
      action: "user_banned",
      reason: args.reason,
    });

    return { success: true };
  },
});

/** Unban or unsuspend user */
export const unbanUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    if (targetUser.status !== "banned" && targetUser.status !== "suspended") {
      throw new Error("User is not banned or suspended");
    }

    if (targetUser.unsuspendFunctionId) {
      await ctx.scheduler.cancel(targetUser.unsuspendFunctionId);
    }

    await ctx.db.patch(args.userId, {
      status: "active",
      suspendedUntil: undefined,
      suspendReason: undefined,
      unsuspendFunctionId: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: admin._id,
      targetUserId: args.userId,
      action: "user_unbanned",
      reason: args.reason,
    });

    return { success: true };
  },
});

/** Verify user account */
export const verifyUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");
    if (targetUser.isVerified) throw new Error("User is already verified");

    await ctx.db.patch(args.userId, {
      isVerified: true,
      verifiedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: admin._id,
      targetUserId: args.userId,
      action: "user_verified",
    });

    return { success: true };
  },
});

/** Change user role (only super_admin can assign admin) */
export const changeUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.union(
      v.literal("user"),
      v.literal("creator"),
      v.literal("platform_mod"),
      v.literal("admin")
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    if (args.newRole === "admin" && admin.role !== "super_admin") {
      throw new Error("Only super admin can assign admin role");
    }

    if (getRoleLevel(targetUser.role) >= getRoleLevel(admin.role)) {
      throw new Error("Cannot change role of user with equal or higher role");
    }

    const previousRole = targetUser.role;
    await ctx.db.patch(args.userId, { role: args.newRole });

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: admin._id,
      targetUserId: args.userId,
      action: "role_changed",
      reason: args.reason,
      metadata: JSON.stringify({ previousRole, newRole: args.newRole }),
    });

    return { success: true };
  },
});

// ===== 2FA-SECURED ADMIN ACTIONS =====

/** Internal: Ban user after 2FA verification */
export const banUserInternal = internalMutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || !hasMinRole(admin.role, "admin")) {
      throw new Error("Admin access required");
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    if (getRoleLevel(targetUser.role) >= getRoleLevel(admin.role)) {
      throw new Error("Cannot ban user with equal or higher role");
    }

    await ctx.db.patch(args.userId, {
      status: "banned",
      suspendReason: args.reason,
    });

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: args.adminId,
      targetUserId: args.userId,
      action: "user_banned",
      reason: args.reason,
    });

    return { success: true };
  },
});

/** Internal: Change user role after 2FA verification */
export const changeUserRoleInternal = internalMutation({
  args: {
    adminId: v.id("users"),
    userId: v.id("users"),
    newRole: v.union(
      v.literal("user"),
      v.literal("creator"),
      v.literal("platform_mod"),
      v.literal("admin")
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || !hasMinRole(admin.role, "admin")) {
      throw new Error("Admin access required");
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    if (args.newRole === "admin" && admin.role !== "super_admin") {
      throw new Error("Only super admin can assign admin role");
    }

    if (getRoleLevel(targetUser.role) >= getRoleLevel(admin.role)) {
      throw new Error("Cannot change role of user with equal or higher role");
    }

    const previousRole = targetUser.role;
    await ctx.db.patch(args.userId, { role: args.newRole });

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: args.adminId,
      targetUserId: args.userId,
      action: "role_changed",
      reason: args.reason,
      metadata: JSON.stringify({ previousRole, newRole: args.newRole }),
    });

    return { success: true };
  },
});

/** Ban user with optional 2FA verification */
export const banUserSecure = action({
  args: {
    userId: v.id("users"),
    reason: v.string(),
    twoFactorCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const adminUser = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!adminUser) throw new Error("Admin user not found");

    const has2FA = await ctx.runQuery(internal.twoFactor.hasTwoFactorEnabled, {
      userId: adminUser._id,
    });

    if (has2FA) {
      if (!args.twoFactorCode) {
        throw new Error("2FA_REQUIRED: This action requires 2FA verification");
      }

      const verification = await ctx.runAction(internal.twoFactorActions.verifyCodeInternal, {
        userId: adminUser._id,
        code: args.twoFactorCode,
      });

      if (!verification.success) {
        throw new Error("2FA_INVALID: " + (verification.error ?? "Invalid verification code"));
      }
    }

    return await ctx.runMutation(internal.admin.banUserInternal, {
      adminId: adminUser._id,
      userId: args.userId,
      reason: args.reason,
    });
  },
});

/** Change user role with optional 2FA verification */
export const changeUserRoleSecure = action({
  args: {
    userId: v.id("users"),
    newRole: v.union(
      v.literal("user"),
      v.literal("creator"),
      v.literal("platform_mod"),
      v.literal("admin")
    ),
    reason: v.optional(v.string()),
    twoFactorCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const adminUser = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!adminUser) throw new Error("Admin user not found");

    const has2FA = await ctx.runQuery(internal.twoFactor.hasTwoFactorEnabled, {
      userId: adminUser._id,
    });

    if (has2FA) {
      if (!args.twoFactorCode) {
        throw new Error("2FA_REQUIRED: This action requires 2FA verification");
      }

      const verification = await ctx.runAction(internal.twoFactorActions.verifyCodeInternal, {
        userId: adminUser._id,
        code: args.twoFactorCode,
      });

      if (!verification.success) {
        throw new Error("2FA_INVALID: " + (verification.error ?? "Invalid verification code"));
      }
    }

    return await ctx.runMutation(internal.admin.changeUserRoleInternal, {
      adminId: adminUser._id,
      userId: args.userId,
      newRole: args.newRole,
      reason: args.reason,
    });
  },
});

// ===== CONTENT MODERATION =====

/** Remove post (mod or higher) */
export const removePost = mutation({
  args: {
    postId: v.id("posts"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireMod(ctx);

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");

    await ctx.db.delete(args.postId);

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: admin._id,
      targetUserId: post.authorId,
      targetPostId: args.postId,
      action: "post_removed",
      reason: args.reason,
    });

    return { success: true };
  },
});

/** Remove comment (mod or higher) */
export const removeComment = mutation({
  args: {
    commentId: v.id("comments"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireMod(ctx);

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    await ctx.db.delete(args.commentId);

    const post = await ctx.db.get(comment.postId);
    if (post) {
      await ctx.db.patch(comment.postId, {
        commentsCount: Math.max(0, (post.commentsCount ?? 0) - 1),
      });
    }

    await ctx.scheduler.runAfter(0, internal.admin.logAction, {
      adminId: admin._id,
      targetUserId: comment.authorId,
      targetCommentId: args.commentId,
      action: "comment_removed",
      reason: args.reason,
    });

    return { success: true };
  },
});

// ===== ADMIN DASHBOARD QUERIES =====

/** Get admin action audit logs */
export const getActionLogs = query({
  args: {
    limit: v.optional(v.number()),
    action: v.optional(adminActionValidator),
    adminId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireMod(ctx);

    const limit = args.limit ?? 50;

    let logs;
    if (args.action) {
      logs = await ctx.db
        .query("adminActions")
        .withIndex("by_action", (q) => q.eq("action", args.action!))
        .order("desc")
        .take(limit);
    } else if (args.adminId) {
      logs = await ctx.db
        .query("adminActions")
        .withIndex("by_admin", (q) => q.eq("adminId", args.adminId!))
        .order("desc")
        .take(limit);
    } else {
      logs = await ctx.db.query("adminActions").order("desc").take(limit);
    }

    const enriched = await Promise.all(
      logs.map(async (log) => {
        const admin = await ctx.db.get(log.adminId);
        let targetUser = null;
        if (log.targetUserId) {
          targetUser = await ctx.db.get(log.targetUserId);
        }

        return {
          ...log,
          admin: admin
            ? { _id: admin._id, username: admin.username, displayName: admin.displayName }
            : null,
          targetUser: targetUser
            ? {
                _id: targetUser._id,
                username: targetUser.username,
                displayName: targetUser.displayName,
              }
            : null,
        };
      })
    );

    return enriched;
  },
});

/** Get pre-computed platform statistics */
export const getPlatformStats = query({
  args: {},
  handler: async (ctx) => {
    await requireMod(ctx);

    const stats = await ctx.db
      .query("platformStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    if (!stats) {
      return {
        users: { total: 0, active: 0, suspended: 0, banned: 0, pendingReview: 0 },
        creators: 0,
        mods: 0,
        admins: 0,
        totalPosts: 0,
        activeSubscriptions: 0,
        pendingReports: 0,
        computedAt: 0,
      };
    }

    return {
      users: {
        total: stats.totalUsers,
        active: stats.activeUsers,
        suspended: stats.suspendedUsers,
        banned: stats.bannedUsers,
        pendingReview: stats.pendingReviewUsers,
      },
      creators: stats.totalCreators,
      mods: stats.totalMods,
      admins: stats.totalAdmins,
      totalPosts: stats.totalPosts,
      activeSubscriptions: stats.activeSubscriptions,
      pendingReports: stats.pendingReports,
      computedAt: stats.computedAt,
    };
  },
});

/** Compute and store platform stats (called by cron) */
export const computePlatformStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const BATCH_SIZE = 500;

    let activeUsers = 0;
    let suspendedUsers = 0;
    let bannedUsers = 0;
    let pendingReviewUsers = 0;

    let hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(BATCH_SIZE);
      activeUsers += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "suspended"))
        .take(BATCH_SIZE);
      suspendedUsers += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "banned"))
        .take(BATCH_SIZE);
      bannedUsers += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "pending_review"))
        .take(BATCH_SIZE);
      pendingReviewUsers += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    let totalCreators = 0;
    let totalMods = 0;
    let totalAdmins = 0;

    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "creator"))
        .take(BATCH_SIZE);
      totalCreators += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "platform_mod"))
        .take(BATCH_SIZE);
      totalMods += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .take(BATCH_SIZE);
      totalAdmins += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    let totalPosts = 0;
    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db.query("posts").withIndex("by_createdAt").take(BATCH_SIZE);
      totalPosts += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    let pendingReports = 0;
    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("reports")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .take(BATCH_SIZE);
      pendingReports += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    let activeSubscriptions = 0;
    hasMore = true;
    while (hasMore) {
      const batch = await ctx.db
        .query("subscriptions")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(BATCH_SIZE);
      activeSubscriptions += batch.length;
      hasMore = batch.length === BATCH_SIZE;
    }

    const totalUsers = activeUsers + suspendedUsers + bannedUsers + pendingReviewUsers;

    const existing = await ctx.db
      .query("platformStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();

    const statsData = {
      key: "global" as const,
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      pendingReviewUsers,
      totalCreators,
      totalMods,
      totalAdmins,
      totalPosts,
      pendingReports,
      activeSubscriptions,
      computedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, statsData);
    } else {
      await ctx.db.insert("platformStats", statsData);
    }

    return { success: true, stats: statsData };
  },
});

/** Get users list for admin with optional filters */
export const getUsers = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("banned"),
        v.literal("pending_review")
      )
    ),
    role: v.optional(
      v.union(
        v.literal("user"),
        v.literal("creator"),
        v.literal("platform_mod"),
        v.literal("admin"),
        v.literal("super_admin")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await requireMod(ctx);
    const callerRole = caller.role ?? "user";
    const canSeeEmail = callerRole === "admin" || callerRole === "super_admin";
    const limit = args.limit ?? 50;

    let users;
    if (args.status) {
      users = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .take(limit);
    } else if (args.role) {
      users = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", args.role!))
        .take(limit);
    } else {
      users = await ctx.db.query("users").take(limit);
    }

    return users.map((u) => ({
      _id: u._id,
      username: u.username,
      displayName: u.displayName,
      email: canSeeEmail ? u.email : undefined,
      role: u.role,
      status: u.status,
      isVerified: u.isVerified,
      followersCount: u.followersCount,
      postsCount: u.postsCount,
      createdAt: u._creationTime,
    }));
  },
});

// ===== RATE LIMITING =====

/** Check and record user rate limit */
export const checkRateLimitInternal = internalMutation({
  args: {
    userId: v.id("users"),
    action: v.union(
      v.literal("message"),
      v.literal("post"),
      v.literal("comment"),
      v.literal("tip"),
      v.literal("upload"),
      v.literal("payout"),
      v.literal("account_delete"),
      v.literal("like"),
      v.literal("follow"),
      v.literal("search")
    ),
  },
  handler: async (ctx, args) => {
    const limit = RATE_LIMITS[args.action];
    const now = Date.now();
    const windowStart = now - limit.windowMs;

    const requests = await ctx.db
      .query("rateLimits")
      .withIndex("by_user_and_action", (q) =>
        q.eq("userId", args.userId).eq("action", args.action).gt("timestamp", windowStart)
      )
      .take(limit.requests + 1);

    if (requests.length >= limit.requests) {
      const oldestRequest = requests[0];
      const retryAfter = oldestRequest.timestamp + limit.windowMs - now;
      return { allowed: false, retryAfter };
    }

    await ctx.db.insert("rateLimits", {
      userId: args.userId,
      action: args.action,
      timestamp: now,
    });

    return { allowed: true };
  },
});

/** Clean up expired rate limit entries */
export const cleanupRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 3600000;

    const oldEntries = await ctx.db
      .query("rateLimits")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", oneHourAgo))
      .take(100);

    for (const entry of oldEntries) {
      await ctx.db.delete(entry._id);
    }

    const oldIpEntries = await ctx.db
      .query("ipRateLimits")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", oneHourAgo))
      .take(100);

    for (const entry of oldIpEntries) {
      await ctx.db.delete(entry._id);
    }

    return { deleted: oldEntries.length + oldIpEntries.length };
  },
});

/** Check IP-based rate limit (for anonymous endpoints) */
export const checkIpRateLimitInternal = internalMutation({
  args: {
    ipAddress: v.string(),
    action: v.literal("profile_meta"),
  },
  handler: async (ctx, args) => {
    const limit = IP_RATE_LIMITS[args.action];
    const now = Date.now();
    const windowStart = now - limit.windowMs;

    const ipHash = args.ipAddress
      .split("")
      .reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
      .toString(16);

    const requests = await ctx.db
      .query("ipRateLimits")
      .withIndex("by_ip_and_action", (q) =>
        q.eq("ipHash", ipHash).eq("action", args.action).gt("timestamp", windowStart)
      )
      .take(limit.requests + 1);

    if (requests.length >= limit.requests) {
      const oldestRequest = requests[0];
      const retryAfter = oldestRequest.timestamp + limit.windowMs - now;
      return { allowed: false, retryAfter };
    }

    await ctx.db.insert("ipRateLimits", {
      ipHash,
      action: args.action,
      timestamp: now,
    });

    return { allowed: true };
  },
});
