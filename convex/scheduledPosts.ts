/**
 * @fileoverview Scheduled Posts Module
 *
 * Schedule posts for future publication.
 *
 * Features:
 *   - Create, edit, cancel scheduled posts
 *   - Automatic publishing via scheduler
 *   - Poll support
 *   - Locked content support
 *   - Retry failed posts
 *
 * Status Flow:
 *   scheduled -> publishing -> published/failed
 *   scheduled -> canceled (manual)
 *
 * Limits:
 *   - Min schedule time: 5 minutes in future
 *   - Max content: 5000 chars
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const POST_MAX_LENGTH = 5000;

const visibilityValidator = v.union(
  v.literal("public"),
  v.literal("followers"),
  v.literal("subscribers"),
  v.literal("vip")
);

// ===== QUERIES =====

/** Get all scheduled posts for current user */
export const getMyScheduledPosts = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    const scheduledPosts = await ctx.db
      .query("scheduledPosts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .order("asc")
      .take(limit);

    return scheduledPosts.filter((sp) => sp.status === "scheduled" || sp.status === "publishing");
  },
});

/** Get a single scheduled post */
export const getById = query({
  args: { scheduledPostId: v.id("scheduledPosts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const scheduledPost = await ctx.db.get(args.scheduledPostId);
    if (!scheduledPost || scheduledPost.authorId !== userId) {
      return null;
    }

    return scheduledPost;
  },
});

// ===== MUTATIONS =====

/** Create a scheduled post */
export const create = mutation({
  args: {
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),
    visibility: visibilityValidator,
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
    pollQuestion: v.optional(v.string()),
    pollOptions: v.optional(v.array(v.string())),
    scheduledFor: v.number(), // Unix timestamp
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Validate content
    const content = args.content.trim();
    if (!content) {
      throw new Error("Post content cannot be empty");
    }
    if (content.length > POST_MAX_LENGTH) {
      throw new Error(`Post content must be at most ${POST_MAX_LENGTH} characters`);
    }

    // Validate scheduled time (must be in the future)
    const minScheduleTime = Date.now() + 5 * 60 * 1000; // At least 5 minutes in future
    if (args.scheduledFor < minScheduleTime) {
      throw new Error("Scheduled time must be at least 5 minutes in the future");
    }

    // Validate locked content
    if (args.isLocked && (!args.unlockPrice || args.unlockPrice < 100)) {
      throw new Error("Locked content must have a price of at least $1.00 (100 cents)");
    }

    // Validate poll options if provided
    if (args.pollQuestion) {
      if (!args.pollOptions || args.pollOptions.length < 2) {
        throw new Error("Poll must have at least 2 options");
      }
      if (args.pollOptions.length > 4) {
        throw new Error("Poll can have at most 4 options");
      }
    }

    // Validate media IDs belong to user
    if (args.mediaIds && args.mediaIds.length > 0) {
      for (const mediaId of args.mediaIds) {
        const media = await ctx.db.get(mediaId);
        if (!media || media.userId !== userId) {
          throw new Error("Invalid media ID");
        }
      }
    }

    const scheduledPostId = await ctx.db.insert("scheduledPosts", {
      authorId: userId,
      content,
      mediaIds: args.mediaIds,
      visibility: args.visibility,
      isLocked: args.isLocked ?? false,
      unlockPrice: args.isLocked ? args.unlockPrice : undefined,
      pollQuestion: args.pollQuestion,
      pollOptions: args.pollOptions,
      scheduledFor: args.scheduledFor,
      status: "scheduled",
      createdAt: Date.now(),
    });

    // Schedule the publish function to run at the exact scheduled time
    const scheduledFunctionId = await ctx.scheduler.runAt(
      args.scheduledFor,
      internal.scheduledPosts.publishScheduledPost,
      { scheduledPostId }
    );

    // Store the scheduled function ID for cancellation
    await ctx.db.patch(scheduledPostId, { scheduledFunctionId });

    return scheduledPostId;
  },
});

/** Update a scheduled post */
export const update = mutation({
  args: {
    scheduledPostId: v.id("scheduledPosts"),
    content: v.optional(v.string()),
    mediaIds: v.optional(v.array(v.id("media"))),
    visibility: v.optional(visibilityValidator),
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
    pollQuestion: v.optional(v.string()),
    pollOptions: v.optional(v.array(v.string())),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const scheduledPost = await ctx.db.get(args.scheduledPostId);
    if (!scheduledPost || scheduledPost.authorId !== userId) {
      throw new Error("Scheduled post not found");
    }

    if (scheduledPost.status !== "scheduled") {
      throw new Error("Cannot edit a post that is being published or already published");
    }

    const updates: Partial<Doc<"scheduledPosts">> = {};

    if (args.content !== undefined) {
      const content = args.content.trim();
      if (!content) {
        throw new Error("Post content cannot be empty");
      }
      if (content.length > POST_MAX_LENGTH) {
        throw new Error(`Post content must be at most ${POST_MAX_LENGTH} characters`);
      }
      updates.content = content;
    }

    if (args.mediaIds !== undefined) {
      for (const mediaId of args.mediaIds) {
        const media = await ctx.db.get(mediaId);
        if (!media || media.userId !== userId) {
          throw new Error("Invalid media ID");
        }
      }
      updates.mediaIds = args.mediaIds;
    }

    if (args.visibility !== undefined) {
      updates.visibility = args.visibility;
    }

    if (args.isLocked !== undefined) {
      updates.isLocked = args.isLocked;
      if (args.isLocked && (!args.unlockPrice || args.unlockPrice < 100)) {
        throw new Error("Locked content must have a price of at least $1.00");
      }
      updates.unlockPrice = args.isLocked ? args.unlockPrice : undefined;
    }

    if (args.pollQuestion !== undefined) {
      updates.pollQuestion = args.pollQuestion;
    }

    if (args.pollOptions !== undefined) {
      if (args.pollQuestion && args.pollOptions.length < 2) {
        throw new Error("Poll must have at least 2 options");
      }
      updates.pollOptions = args.pollOptions;
    }

    if (args.scheduledFor !== undefined) {
      const minScheduleTime = Date.now() + 5 * 60 * 1000;
      if (args.scheduledFor < minScheduleTime) {
        throw new Error("Scheduled time must be at least 5 minutes in the future");
      }
      updates.scheduledFor = args.scheduledFor;

      // Cancel the old scheduled function and create a new one
      if (scheduledPost.scheduledFunctionId) {
        await ctx.scheduler.cancel(scheduledPost.scheduledFunctionId);
      }

      const newScheduledFunctionId = await ctx.scheduler.runAt(
        args.scheduledFor,
        internal.scheduledPosts.publishScheduledPost,
        { scheduledPostId: args.scheduledPostId }
      );
      updates.scheduledFunctionId = newScheduledFunctionId;
    }

    await ctx.db.patch(args.scheduledPostId, updates);
    return await ctx.db.get(args.scheduledPostId);
  },
});

/** Cancel a scheduled post */
export const cancel = mutation({
  args: { scheduledPostId: v.id("scheduledPosts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const scheduledPost = await ctx.db.get(args.scheduledPostId);
    if (!scheduledPost || scheduledPost.authorId !== userId) {
      throw new Error("Scheduled post not found");
    }

    if (scheduledPost.status !== "scheduled") {
      throw new Error("Cannot cancel a post that is being published or already published");
    }

    // Cancel the scheduled function
    if (scheduledPost.scheduledFunctionId) {
      await ctx.scheduler.cancel(scheduledPost.scheduledFunctionId);
    }

    await ctx.db.patch(args.scheduledPostId, {
      status: "canceled",
      scheduledFunctionId: undefined,
    });

    return { success: true };
  },
});

/** Delete a scheduled post */
export const remove = mutation({
  args: { scheduledPostId: v.id("scheduledPosts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const scheduledPost = await ctx.db.get(args.scheduledPostId);
    if (!scheduledPost || scheduledPost.authorId !== userId) {
      throw new Error("Scheduled post not found");
    }

    if (scheduledPost.status === "publishing") {
      throw new Error("Cannot delete a post that is being published");
    }

    // Cancel the scheduled function if pending
    if (scheduledPost.scheduledFunctionId) {
      await ctx.scheduler.cancel(scheduledPost.scheduledFunctionId);
    }

    await ctx.db.delete(args.scheduledPostId);
    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Publish a scheduled post (called by scheduler) */
export const publishScheduledPost = internalMutation({
  args: {
    scheduledPostId: v.id("scheduledPosts"),
  },
  handler: async (ctx, args) => {
    const scheduledPost = await ctx.db.get(args.scheduledPostId);

    // Guard: Only process if still scheduled
    if (!scheduledPost || scheduledPost.status !== "scheduled") {
      return { success: false, reason: "Post not in scheduled state" };
    }

    // Mark as publishing
    await ctx.db.patch(scheduledPost._id, {
      status: "publishing",
      scheduledFunctionId: undefined, // Clear the function ID
    });

    try {
      // Check if author still exists and is active
      const author = await ctx.db.get(scheduledPost.authorId);
      if (!author || author.status !== "active") {
        throw new Error("Author no longer active");
      }

      // Create the actual post
      const postId = await ctx.db.insert("posts", {
        authorId: scheduledPost.authorId,
        content: scheduledPost.content,
        mediaIds: scheduledPost.mediaIds,
        visibility: scheduledPost.visibility,
        isLocked: scheduledPost.isLocked ?? false,
        unlockPrice: scheduledPost.isLocked ? scheduledPost.unlockPrice : undefined,
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        tipsTotal: 0,
        createdAt: Date.now(),
      });

      // Create poll if provided
      if (scheduledPost.pollQuestion && scheduledPost.pollOptions) {
        const pollOptions = scheduledPost.pollOptions.map((text, index) => ({
          id: `option_${index}`,
          text,
          votesCount: 0,
        }));

        await ctx.db.insert("polls", {
          postId,
          authorId: scheduledPost.authorId,
          question: scheduledPost.pollQuestion,
          options: pollOptions,
          allowMultiple: false,
          totalVotes: 0,
          isEnded: false,
          createdAt: Date.now(),
        });
      }

      // Update user's post count
      await ctx.scheduler.runAfter(0, internal.users.updateStats, {
        userId: scheduledPost.authorId,
        field: "postsCount",
        delta: 1,
      });

      // Mark as published
      await ctx.db.patch(scheduledPost._id, {
        status: "published",
        publishedPostId: postId,
      });

      return { success: true, postId };
    } catch (error) {
      // Mark as failed
      await ctx.db.patch(scheduledPost._id, {
        status: "failed",
        failureReason: error instanceof Error ? error.message : "Unknown error",
      });
      return { success: false, reason: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/** Process any missed scheduled posts (cron fallback) */
export const processScheduled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find scheduled posts that are past due and don't have a scheduled function
    // (or the scheduled function failed)
    const duePosts = await ctx.db
      .query("scheduledPosts")
      .withIndex("by_status_schedule", (q) => q.eq("status", "scheduled"))
      .filter((q) => q.lte(q.field("scheduledFor"), now))
      .take(50);

    let processed = 0;

    for (const scheduledPost of duePosts) {
      // Publish immediately using the same handler
      await ctx.scheduler.runAfter(0, internal.scheduledPosts.publishScheduledPost, {
        scheduledPostId: scheduledPost._id,
      });
      processed++;
    }

    return { processed };
  },
});

/** Retry a failed scheduled post */
export const retryFailed = mutation({
  args: { scheduledPostId: v.id("scheduledPosts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const scheduledPost = await ctx.db.get(args.scheduledPostId);
    if (!scheduledPost || scheduledPost.authorId !== userId) {
      throw new Error("Scheduled post not found");
    }

    if (scheduledPost.status !== "failed") {
      throw new Error("Only failed posts can be retried");
    }

    // Reschedule for 1 minute from now
    const newScheduledFor = Date.now() + 60 * 1000;

    // Schedule the publish function
    const scheduledFunctionId = await ctx.scheduler.runAt(
      newScheduledFor,
      internal.scheduledPosts.publishScheduledPost,
      { scheduledPostId: args.scheduledPostId }
    );

    await ctx.db.patch(args.scheduledPostId, {
      status: "scheduled",
      scheduledFor: newScheduledFor,
      scheduledFunctionId,
      failureReason: undefined,
    });

    return { success: true };
  },
});

/** Cleanup old scheduled posts (cron - weekly) */
export const cleanupOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Delete old published, canceled, or failed scheduled posts
    const oldPosts = await ctx.db
      .query("scheduledPosts")
      .filter((q) =>
        q.and(
          q.lt(q.field("createdAt"), thirtyDaysAgo),
          q.or(
            q.eq(q.field("status"), "published"),
            q.eq(q.field("status"), "canceled"),
            q.eq(q.field("status"), "failed")
          )
        )
      )
      .take(500);

    let deleted = 0;
    for (const post of oldPosts) {
      await ctx.db.delete(post._id);
      deleted++;
    }

    return { deleted };
  },
});
