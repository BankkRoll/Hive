/**
 * @fileoverview Likes Module
 *
 * Handles likes for posts and comments.
 *
 * Features:
 *   - Like/unlike posts and comments
 *   - Toggle like state
 *   - Check like status
 *   - Get list of users who liked
 *   - Get posts liked by current user
 *
 * Security:
 *   - Rate limited to prevent spam
 *   - Notifications only sent when liking others' content
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const targetTypeValidator = v.union(v.literal("post"), v.literal("comment"));

// ===== MUTATIONS =====

/** Like a post or comment */
export const like = mutation({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "like",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .unique();

    if (existing) throw new Error("Already liked");

    let authorId: Id<"users"> | undefined;

    if (args.targetType === "post") {
      const post = await ctx.db.get(args.targetId as Id<"posts">);
      if (!post) throw new Error("Post not found");
      authorId = post.authorId;
      await ctx.db.patch(args.targetId as Id<"posts">, {
        likesCount: (post.likesCount ?? 0) + 1,
      });
    } else if (args.targetType === "comment") {
      const comment = await ctx.db.get(args.targetId as Id<"comments">);
      if (!comment) throw new Error("Comment not found");
      authorId = comment.authorId;
      await ctx.db.patch(args.targetId as Id<"comments">, {
        likesCount: (comment.likesCount ?? 0) + 1,
      });
    }

    await ctx.db.insert("likes", {
      userId,
      targetType: args.targetType,
      targetId: args.targetId,
      createdAt: Date.now(),
    });

    if (authorId && authorId !== userId) {
      await ctx.scheduler.runAfter(0, internal.notifications.create, {
        userId: authorId,
        type: "like",
        actorId: userId,
        postId: args.targetType === "post" ? (args.targetId as Id<"posts">) : undefined,
        commentId: args.targetType === "comment" ? (args.targetId as Id<"comments">) : undefined,
      });
    }

    return { success: true };
  },
});

/** Unlike a post or comment */
export const unlike = mutation({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .unique();

    if (!existing) throw new Error("Not liked");

    await ctx.db.delete(existing._id);

    if (args.targetType === "post") {
      const post = await ctx.db.get(args.targetId as Id<"posts">);
      if (post) {
        await ctx.db.patch(args.targetId as Id<"posts">, {
          likesCount: Math.max(0, (post.likesCount ?? 0) - 1),
        });
      }
    } else if (args.targetType === "comment") {
      const comment = await ctx.db.get(args.targetId as Id<"comments">);
      if (comment) {
        await ctx.db.patch(args.targetId as Id<"comments">, {
          likesCount: Math.max(0, (comment.likesCount ?? 0) - 1),
        });
      }
    }

    return { success: true };
  },
});

/** Toggle like state */
export const toggle = mutation({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "like",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);

      if (args.targetType === "post") {
        const post = await ctx.db.get(args.targetId as Id<"posts">);
        if (post) {
          await ctx.db.patch(args.targetId as Id<"posts">, {
            likesCount: Math.max(0, (post.likesCount ?? 0) - 1),
          });
        }
      } else if (args.targetType === "comment") {
        const comment = await ctx.db.get(args.targetId as Id<"comments">);
        if (comment) {
          await ctx.db.patch(args.targetId as Id<"comments">, {
            likesCount: Math.max(0, (comment.likesCount ?? 0) - 1),
          });
        }
      }

      return { liked: false };
    } else {
      let authorId: Id<"users"> | undefined;

      if (args.targetType === "post") {
        const post = await ctx.db.get(args.targetId as Id<"posts">);
        if (!post) throw new Error("Post not found");
        authorId = post.authorId;
        await ctx.db.patch(args.targetId as Id<"posts">, {
          likesCount: (post.likesCount ?? 0) + 1,
        });
      } else if (args.targetType === "comment") {
        const comment = await ctx.db.get(args.targetId as Id<"comments">);
        if (!comment) throw new Error("Comment not found");
        authorId = comment.authorId;
        await ctx.db.patch(args.targetId as Id<"comments">, {
          likesCount: (comment.likesCount ?? 0) + 1,
        });
      }

      await ctx.db.insert("likes", {
        userId,
        targetType: args.targetType,
        targetId: args.targetId,
        createdAt: Date.now(),
      });

      if (authorId && authorId !== userId) {
        await ctx.scheduler.runAfter(0, internal.notifications.create, {
          userId: authorId,
          type: "like",
          actorId: userId,
          postId: args.targetType === "post" ? (args.targetId as Id<"posts">) : undefined,
          commentId: args.targetType === "comment" ? (args.targetId as Id<"comments">) : undefined,
        });
      }

      return { liked: true };
    }
  },
});

// ===== QUERIES =====

/** Check if user liked a target */
export const isLiked = query({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const like = await ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", userId).eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .unique();

    return like !== null;
  },
});

/** Get users who liked a target */
export const getLikers = query({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const likes = await ctx.db
      .query("likes")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .order("desc")
      .take(limit);

    const users = await Promise.all(
      likes.map(async (like) => {
        const user = await ctx.db.get(like.userId);
        if (!user || user.status !== "active") return null;
        return {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatarR2Key: user.avatarR2Key,
          dicebearSeed: user.dicebearSeed,
          dicebearBgColor: user.dicebearBgColor,
          dicebearEyes: user.dicebearEyes,
          dicebearMouth: user.dicebearMouth,
          isVerified: user.isVerified,
        };
      })
    );

    return users.filter((u) => u !== null);
  },
});

/** Get posts liked by current user */
export const getLikedPosts = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { posts: [], nextCursor: undefined };

    const limit = args.limit ?? 20;

    let likesQuery = ctx.db
      .query("likes")
      .withIndex("by_user_target", (q) => q.eq("userId", userId).eq("targetType", "post"))
      .order("desc");

    if (args.cursor) {
      likesQuery = likesQuery.filter((q) => q.lt(q.field("createdAt"), args.cursor!));
    }

    const likes = await likesQuery.take(limit + 1);
    const hasMore = likes.length > limit;
    const likesToProcess = hasMore ? likes.slice(0, limit) : likes;

    const posts = await Promise.all(
      likesToProcess.map(async (like) => {
        const post = await ctx.db.get(like.targetId as Id<"posts">);
        if (!post) return null;

        const author = await ctx.db.get(post.authorId);
        if (!author || author.status !== "active") return null;

        return {
          ...post,
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
          isLiked: true,
          isBookmarked: false,
        };
      })
    );

    return {
      posts: posts.filter((p) => p !== null),
      nextCursor:
        hasMore && likesToProcess.length > 0
          ? likesToProcess[likesToProcess.length - 1].createdAt
          : undefined,
    };
  },
});

/** Get like count */
export const getCount = query({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.targetType === "post") {
      const post = await ctx.db.get(args.targetId as Id<"posts">);
      return post?.likesCount ?? 0;
    } else if (args.targetType === "comment") {
      const comment = await ctx.db.get(args.targetId as Id<"comments">);
      return comment?.likesCount ?? 0;
    }
    return 0;
  },
});
