/**
 * @fileoverview User Verification System
 *
 * Handles verification badge requests and approval workflow. Users can submit
 * verification requests with social proof, which admins review and approve/reject.
 *
 * Features:
 *   - Verification request submission with social links
 *   - Request status tracking (pending, approved, rejected)
 *   - Admin review workflow with approval/rejection
 *   - Automatic notification on status change
 *   - Verification statistics for admins
 *
 * Security:
 *   - Users can only view/cancel their own requests
 *   - Admin functions restricted to admin, super_admin, platform_mod roles
 *   - Duplicate pending requests prevented
 *   - Already verified users cannot resubmit
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// ===== QUERIES =====

/** Retrieves the current user's most recent verification request */
export const getMyRequest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const request = await ctx.db
      .query("verificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    return request;
  },
});

// ===== MUTATIONS =====

/** Submits a new verification request with social proof */
export const submit = mutation({
  args: {
    displayName: v.optional(v.string()),
    category: v.optional(v.string()),
    socialLinks: v.optional(v.array(v.string())),
    followerCount: v.optional(v.number()),
    additionalNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check if user already has a pending request
    const existingRequest = await ctx.db
      .query("verificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (existingRequest) {
      throw new Error("You already have a pending verification request");
    }

    // Check if user is already verified
    const user = await ctx.db.get(userId);
    if (user?.isVerified) {
      throw new Error("You are already verified");
    }

    // Require at least one social link for verification
    if (!args.socialLinks || args.socialLinks.length === 0) {
      throw new Error("Please provide at least one social media link for verification");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("verificationRequests", {
      userId,
      status: "pending",
      displayName: args.displayName,
      category: args.category,
      socialLinks: args.socialLinks,
      followerCount: args.followerCount,
      additionalNotes: args.additionalNotes,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, requestId };
  },
});

/** Cancels the current user's pending verification request */
export const cancel = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const request = await ctx.db
      .query("verificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (!request) {
      throw new Error("No pending request found");
    }

    await ctx.db.delete(request._id);
    return { success: true };
  },
});

// ===== ADMIN QUERIES =====

/** Lists pending verification requests with user data (admin only) */
export const listPending = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.id("verificationRequests")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { requests: [], hasMore: false };

    const user = await ctx.db.get(userId);
    if (!user || !["admin", "super_admin", "platform_mod"].includes(user.role || "")) {
      return { requests: [], hasMore: false };
    }

    const limit = args.limit ?? 20;
    const requests = await ctx.db
      .query("verificationRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc") // Oldest first
      .take(limit + 1);

    const hasMore = requests.length > limit;
    const items = requests.slice(0, limit);

    // Enrich with user data
    const enriched = await Promise.all(
      items.map(async (request) => {
        const requestUser = await ctx.db.get(request.userId);
        return {
          ...request,
          user: requestUser
            ? {
                _id: requestUser._id,
                username: requestUser.username,
                displayName: requestUser.displayName,
                avatarR2Key: requestUser.avatarR2Key,
                email: requestUser.email,
              }
            : null,
        };
      })
    );

    return {
      requests: enriched,
      hasMore,
    };
  },
});

/** Retrieves a verification request by ID with user details (admin only) */
export const getById = query({
  args: { requestId: v.id("verificationRequests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user || !["admin", "super_admin", "platform_mod"].includes(user.role || "")) {
      return null;
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) return null;

    const requestUser = await ctx.db.get(request.userId);

    return {
      ...request,
      user: requestUser
        ? {
            _id: requestUser._id,
            username: requestUser.username,
            displayName: requestUser.displayName,
            avatarR2Key: requestUser.avatarR2Key,
            email: requestUser.email,
            bio: requestUser.bio,
            createdAt: requestUser._creationTime,
          }
        : null,
    };
  },
});

// ===== ADMIN MUTATIONS =====

/** Approves a verification request and grants verified badge (admin only) */
export const approve = mutation({
  args: { requestId: v.id("verificationRequests") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user || !["admin", "super_admin", "platform_mod"].includes(user.role || "")) {
      throw new Error("Not authorized");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") throw new Error("Request is not pending");

    const now = Date.now();

    // Update request
    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewedBy: userId,
      reviewedAt: now,
      updatedAt: now,
    });

    // Verify the user
    await ctx.db.patch(request.userId, {
      isVerified: true,
      verifiedAt: now,
    });

    // Send notification
    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: request.userId,
      type: "system",
      message:
        "Congratulations! Your verification request has been approved. You now have a verified badge.",
    });

    return { success: true };
  },
});

/** Rejects a verification request with a reason (admin only) */
export const reject = mutation({
  args: {
    requestId: v.id("verificationRequests"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user || !["admin", "super_admin", "platform_mod"].includes(user.role || "")) {
      throw new Error("Not authorized");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") throw new Error("Request is not pending");

    const now = Date.now();

    // Update request
    await ctx.db.patch(args.requestId, {
      status: "rejected",
      reviewedBy: userId,
      reviewedAt: now,
      rejectionReason: args.reason,
      updatedAt: now,
    });

    // Send notification
    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: request.userId,
      type: "system",
      message: `Your verification request was not approved. Reason: ${args.reason}`,
    });

    return { success: true };
  },
});

/** Retrieves verification request statistics (admin/super_admin only) */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user || !["admin", "super_admin"].includes(user.role || "")) {
      return null;
    }

    const pending = await ctx.db
      .query("verificationRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(1000);

    const approved = await ctx.db
      .query("verificationRequests")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(1000);

    const rejected = await ctx.db
      .query("verificationRequests")
      .withIndex("by_status", (q) => q.eq("status", "rejected"))
      .take(1000);

    return {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      total: pending.length + approved.length + rejected.length,
    };
  },
});
