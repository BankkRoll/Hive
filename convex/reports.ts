/**
 * @fileoverview Reports Module
 *
 * Content reporting and moderation workflow.
 *
 * Features:
 *   - Report users, posts, comments, or messages
 *   - Reason categorization (spam, harassment, etc.)
 *   - Admin review and action workflow
 *   - Duplicate report prevention
 *   - Report statistics
 *
 * Report Flow:
 *   pending -> reviewing -> resolved/dismissed
 *
 * Actions:
 *   - remove_content
 *   - warn_user
 *   - suspend_user (7 days)
 *   - ban_user
 *   - dismiss
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { requireMod, requireAdmin } from "./admin";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const targetTypeValidator = v.union(
  v.literal("user"),
  v.literal("post"),
  v.literal("comment"),
  v.literal("message")
);

const reasonValidator = v.union(
  v.literal("spam"),
  v.literal("harassment"),
  v.literal("hate_speech"),
  v.literal("violence"),
  v.literal("nudity"),
  v.literal("copyright"),
  v.literal("impersonation"),
  v.literal("other")
);

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("dismissed")
);

// ===== HELPERS =====

/** Validate report target exists */
async function validateReportTarget(
  ctx: { db: { get: Function } },
  targetType: string,
  targetId: string,
  reporterId: Id<"users">
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Convex IDs have a specific format - this will throw if invalid
    if (targetType === "user") {
      const user = await ctx.db.get(targetId as Id<"users">);
      if (!user) {
        return { valid: false, error: "Content not found" };
      }
      if (user._id === reporterId) {
        return { valid: false, error: "Cannot report yourself" };
      }
    } else if (targetType === "post") {
      const post = await ctx.db.get(targetId as Id<"posts">);
      if (!post) {
        return { valid: false, error: "Content not found" };
      }
    } else if (targetType === "comment") {
      const comment = await ctx.db.get(targetId as Id<"comments">);
      if (!comment) {
        return { valid: false, error: "Content not found" };
      }
    } else if (targetType === "message") {
      const message = await ctx.db.get(targetId as Id<"messages">);
      if (!message) {
        return { valid: false, error: "Content not found" };
      }
    } else {
      return { valid: false, error: "Invalid target type" };
    }
    return { valid: true };
  } catch {
    // Invalid ID format or database error
    return { valid: false, error: "Content not found" };
  }
}

// ===== MUTATIONS =====

/** Submit a report */
export const submit = mutation({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
    reason: reasonValidator,
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // SECURITY: Validate target exists with proper error handling
    const validation = await validateReportTarget(ctx, args.targetType, args.targetId, userId);
    if (!validation.valid) {
      throw new Error(validation.error ?? "Content not found");
    }

    // Check for duplicate recent report
    const recentReports = await ctx.db
      .query("reports")
      .withIndex("by_reporter", (q) => q.eq("reporterId", userId))
      .order("desc")
      .take(100);

    const duplicate = recentReports.find(
      (r) =>
        r.targetType === args.targetType && r.targetId === args.targetId && r.status === "pending"
    );

    if (duplicate) {
      throw new Error("You have already reported this content");
    }

    // Create report
    const reportId = await ctx.db.insert("reports", {
      reporterId: userId,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason,
      description: args.description?.trim(),
      status: "pending",
      createdAt: Date.now(),
    });

    return { reportId };
  },
});

// ===== QUERIES =====

/** Get my reports */
export const getMyReports = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 20;

    const reports = await ctx.db
      .query("reports")
      .withIndex("by_reporter", (q) => q.eq("reporterId", userId))
      .order("desc")
      .take(limit);

    return reports;
  },
});

/** Admin: Get pending reports */
export const getPendingReports = query({
  args: {
    limit: v.optional(v.number()),
    targetType: v.optional(targetTypeValidator),
  },
  handler: async (ctx, args) => {
    // Use centralized role checking
    await requireMod(ctx);

    const limit = args.limit ?? 50;

    let reports = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(limit * 2);

    if (args.targetType) {
      reports = reports.filter((r) => r.targetType === args.targetType);
    }

    const items = reports.slice(0, limit);

    // Enrich with reporter and target info
    const enriched = await Promise.all(
      items.map(async (report) => {
        const reporter = await ctx.db.get(report.reporterId);

        let targetInfo: { type: string; preview?: string } | null = null;
        if (report.targetType === "user") {
          const user = await ctx.db.get(report.targetId as Id<"users">);
          targetInfo = user ? { type: "user", preview: `@${user.username}` } : null;
        } else if (report.targetType === "post") {
          const post = await ctx.db.get(report.targetId as Id<"posts">);
          targetInfo = post ? { type: "post", preview: post.content.slice(0, 100) } : null;
        } else if (report.targetType === "comment") {
          const comment = await ctx.db.get(report.targetId as Id<"comments">);
          targetInfo = comment ? { type: "comment", preview: comment.content.slice(0, 100) } : null;
        } else if (report.targetType === "message") {
          const message = await ctx.db.get(report.targetId as Id<"messages">);
          targetInfo = message ? { type: "message", preview: message.content.slice(0, 100) } : null;
        }

        return {
          ...report,
          reporter: reporter
            ? {
                _id: reporter._id,
                username: reporter.username,
                displayName: reporter.displayName,
              }
            : null,
          targetInfo,
        };
      })
    );

    return enriched;
  },
});

/** Admin: Update report status */
export const updateStatus = mutation({
  args: {
    reportId: v.id("reports"),
    status: statusValidator,
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Use centralized role checking
    const user = await requireMod(ctx);
    const userId = user._id;

    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new Error("Report not found");
    }

    await ctx.db.patch(args.reportId, {
      status: args.status,
      resolution: args.resolution,
      resolvedById: userId,
      resolvedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Admin: Take action on reported content */
export const takeAction = mutation({
  args: {
    reportId: v.id("reports"),
    action: v.union(
      v.literal("remove_content"),
      v.literal("warn_user"),
      v.literal("suspend_user"),
      v.literal("ban_user"),
      v.literal("dismiss")
    ),
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Use centralized role checking - requires admin for sensitive actions
    const user = await requireAdmin(ctx);
    const userId = user._id;

    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new Error("Report not found");
    }

    // Take action based on type
    if (args.action === "remove_content") {
      if (report.targetType === "post") {
        const post = await ctx.db.get(report.targetId as Id<"posts">);
        if (post) {
          await ctx.db.delete(post._id);
        }
      } else if (report.targetType === "comment") {
        const comment = await ctx.db.get(report.targetId as Id<"comments">);
        if (comment) {
          await ctx.db.delete(comment._id);
        }
      } else if (report.targetType === "message") {
        const message = await ctx.db.get(report.targetId as Id<"messages">);
        if (message) {
          await ctx.db.delete(message._id);
        }
      }
    } else if (args.action === "suspend_user" || args.action === "ban_user") {
      let targetUserId: Id<"users"> | null = null;

      if (report.targetType === "user") {
        targetUserId = report.targetId as Id<"users">;
      } else if (report.targetType === "post") {
        const post = await ctx.db.get(report.targetId as Id<"posts">);
        targetUserId = post?.authorId ?? null;
      } else if (report.targetType === "comment") {
        const comment = await ctx.db.get(report.targetId as Id<"comments">);
        targetUserId = comment?.authorId ?? null;
      } else if (report.targetType === "message") {
        const message = await ctx.db.get(report.targetId as Id<"messages">);
        targetUserId = message?.senderId ?? null;
      }

      if (targetUserId) {
        const targetUser = await ctx.db.get(targetUserId);
        if (!targetUser) {
          throw new Error("Target user not found");
        }

        const newStatus = args.action === "ban_user" ? "banned" : "suspended";
        const suspendedUntil =
          args.action === "suspend_user"
            ? Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
            : undefined;

        // Cancel any existing unsuspend function
        if (targetUser.unsuspendFunctionId) {
          await ctx.scheduler.cancel(targetUser.unsuspendFunctionId);
        }

        let unsuspendFunctionId: Id<"_scheduled_functions"> | undefined = undefined;

        // Schedule automatic unsuspend for suspensions
        if (args.action === "suspend_user" && suspendedUntil) {
          unsuspendFunctionId = await ctx.scheduler.runAt(
            suspendedUntil,
            internal.security.autoUnsuspendUser,
            { userId: targetUserId }
          );
        }

        await ctx.db.patch(targetUserId, {
          status: newStatus,
          suspendedUntil,
          suspendReason: args.resolution,
          unsuspendFunctionId,
        });
      }
    }

    // Update report
    await ctx.db.patch(args.reportId, {
      status: "resolved",
      resolution: args.resolution ?? `Action taken: ${args.action}`,
      resolvedById: userId,
      resolvedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Get report statistics (admin) */
export const getStats = query({
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

    // Get counts by status
    const pending = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(1000);

    const reviewing = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "reviewing"))
      .take(1000);

    const resolved = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "resolved"))
      .take(1000);

    const dismissed = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "dismissed"))
      .take(1000);

    return {
      pending: pending.length,
      reviewing: reviewing.length,
      resolved: resolved.length,
      dismissed: dismissed.length,
      total: pending.length + reviewing.length + resolved.length + dismissed.length,
    };
  },
});
