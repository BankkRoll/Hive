/**
 * @fileoverview Comments Module
 *
 * Handles post comments with nested replies support.
 *
 * Features:
 *   - Create/update/delete comments
 *   - Nested replies
 *   - Like status per comment
 *   - Rate limiting
 *   - Notifications to post author and reply recipients
 *
 * Security:
 *   - Blocked users cannot comment on posts
 *   - Only author or post owner can delete comments
 *   - Max 2000 characters per comment
 */

import { v } from "convex/values";
import { query, mutation, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const COMMENT_MAX_LENGTH = 2000;
const DEFAULT_LIMIT = 20;

// ===== HELPERS =====

/** Enrich comment with author data and interaction state */
async function enrichComment(
  ctx: QueryCtx,
  comment: Doc<"comments">,
  viewerId: Id<"users"> | null
) {
  const author = await ctx.db.get(comment.authorId);
  if (!author) return null;

  let isLiked = false;
  if (viewerId) {
    const like = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", viewerId).eq("targetType", "comment").eq("targetId", comment._id)
      )
      .unique();
    isLiked = like !== null;
  }

  const replies = await ctx.db
    .query("comments")
    .withIndex("by_parent", (q) => q.eq("parentId", comment._id))
    .take(1);

  return {
    ...comment,
    author: {
      _id: author._id,
      username: author.username,
      displayName: author.displayName,
      avatarR2Key: author.avatarR2Key,
      dicebearSeed: author.dicebearSeed,
      dicebearBgColor: author.dicebearBgColor,
      dicebearEyes: author.dicebearEyes,
      dicebearMouth: author.dicebearMouth,
      isVerified: author.isVerified,
    },
    isLiked,
    hasReplies: replies.length > 0,
  };
}

// ===== MUTATIONS =====

/** Create a comment */
export const create = mutation({
  args: {
    postId: v.id("posts"),
    content: v.string(),
    parentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "comment",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    const content = args.content.trim();
    if (!content) throw new Error("Comment cannot be empty");
    if (content.length > COMMENT_MAX_LENGTH) {
      throw new Error(`Comment must be at most ${COMMENT_MAX_LENGTH} characters`);
    }

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");

    // Check if blocked
    const blocked = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", post.authorId).eq("blockedId", userId))
      .unique();
    if (blocked) throw new Error("Cannot comment on this post");

    // Verify parent comment
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.postId !== args.postId) {
        throw new Error("Parent comment not found");
      }
    }

    const commentId = await ctx.db.insert("comments", {
      postId: args.postId,
      authorId: userId,
      content,
      parentId: args.parentId,
      likesCount: 0,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.postId, {
      commentsCount: (post.commentsCount ?? 0) + 1,
    });

    // Notify post author
    if (post.authorId !== userId) {
      await ctx.scheduler.runAfter(0, internal.notifications.create, {
        userId: post.authorId,
        type: "comment",
        actorId: userId,
        postId: args.postId,
        commentId,
      });
    }

    // Notify parent comment author
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (parent && parent.authorId !== userId && parent.authorId !== post.authorId) {
        await ctx.scheduler.runAfter(0, internal.notifications.create, {
          userId: parent.authorId,
          type: "comment",
          actorId: userId,
          postId: args.postId,
          commentId,
        });
      }
    }

    return commentId;
  },
});

/** Update a comment */
export const update = mutation({
  args: {
    commentId: v.id("comments"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (comment.authorId !== userId) throw new Error("Not authorized to edit this comment");

    const content = args.content.trim();
    if (!content) throw new Error("Comment cannot be empty");
    if (content.length > COMMENT_MAX_LENGTH) {
      throw new Error(`Comment must be at most ${COMMENT_MAX_LENGTH} characters`);
    }

    await ctx.db.patch(args.commentId, { content });
    return await ctx.db.get(args.commentId);
  },
});

/** Delete a comment and its replies */
export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    const post = await ctx.db.get(comment.postId);
    if (comment.authorId !== userId && post?.authorId !== userId) {
      throw new Error("Not authorized to delete this comment");
    }

    // Delete likes on comment
    const likes = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) => q.eq("targetType", "comment").eq("targetId", args.commentId))
      .take(500);
    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    // Delete replies and their likes
    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", args.commentId))
      .take(500);
    for (const reply of replies) {
      const replyLikes = await ctx.db
        .query("likes")
        .withIndex("by_target", (q) => q.eq("targetType", "comment").eq("targetId", reply._id))
        .take(500);
      for (const like of replyLikes) {
        await ctx.db.delete(like._id);
      }
      await ctx.db.delete(reply._id);
    }

    await ctx.db.delete(args.commentId);

    if (post) {
      const deletedCount = 1 + replies.length;
      await ctx.db.patch(post._id, {
        commentsCount: Math.max(0, (post.commentsCount ?? 0) - deletedCount),
      });
    }

    return { success: true };
  },
});

// ===== QUERIES =====

/** Get comments for a post */
export const getByPost = query({
  args: {
    postId: v.id("posts"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const limit = args.limit ?? DEFAULT_LIMIT;

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("desc")
      .take(limit * 2);

    const topLevelComments = comments.filter((c) => !c.parentId).slice(0, limit + 1);

    const hasMore = topLevelComments.length > limit;
    const items = topLevelComments.slice(0, limit);

    const enrichedComments = await Promise.all(
      items.map(async (comment) => await enrichComment(ctx, comment, viewerId))
    );

    return {
      comments: enrichedComments.filter((c) => c !== null),
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Get replies to a comment */
export const getReplies = query({
  args: {
    commentId: v.id("comments"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const limit = args.limit ?? DEFAULT_LIMIT;

    const replies = await ctx.db
      .query("comments")
      .withIndex("by_parent", (q) => q.eq("parentId", args.commentId))
      .order("asc")
      .take(limit);

    const enrichedReplies = await Promise.all(
      replies.map(async (reply) => await enrichComment(ctx, reply, viewerId))
    );

    return enrichedReplies.filter((r) => r !== null);
  },
});

/** Get a single comment */
export const getById = query({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const comment = await ctx.db.get(args.commentId);

    if (!comment) return null;

    return await enrichComment(ctx, comment, viewerId);
  },
});

/** Get comment count for a post */
export const getCount = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    return post?.commentsCount ?? 0;
  },
});

/** Get recent comments by a user */
export const getByUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const limit = args.limit ?? DEFAULT_LIMIT;

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_author", (q) => q.eq("authorId", args.userId))
      .order("desc")
      .take(limit);

    const enrichedComments = await Promise.all(
      comments.map(async (comment) => {
        const enriched = await enrichComment(ctx, comment, viewerId);
        if (!enriched) return null;

        const post = await ctx.db.get(comment.postId);
        return {
          ...enriched,
          post: post ? { _id: post._id, content: post.content.slice(0, 100) } : null,
        };
      })
    );

    return enrichedComments.filter((c) => c !== null);
  },
});
