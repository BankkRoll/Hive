/**
 * @fileoverview Polls Module
 *
 * Manages polls attached to posts with voting functionality.
 *
 * Features:
 *   - Create polls with 2-6 options
 *   - Single or multiple choice voting
 *   - Automatic poll ending with scheduler
 *   - Vote tallying with percentages
 *   - Poll ending notifications
 *
 * Limits:
 *   - Min options: 2
 *   - Max options: 6
 *   - One vote per user per poll
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MAX_POLL_OPTIONS = 6;
const MIN_POLL_OPTIONS = 2;

// ===== QUERIES =====

/** Get poll for a post */
export const getByPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const poll = await ctx.db
      .query("polls")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .unique();

    if (!poll) return null;

    // Check if user has voted
    let userVote = null;
    if (userId) {
      const vote = await ctx.db
        .query("pollVotes")
        .withIndex("by_poll_voter", (q) => q.eq("pollId", poll._id).eq("voterId", userId))
        .unique();

      if (vote) {
        userVote = vote.optionIds;
      }
    }

    // Calculate percentages
    const totalVotes = poll.totalVotes ?? 0;
    const optionsWithPercentage = poll.options.map((option) => ({
      ...option,
      percentage: totalVotes > 0 ? Math.round((option.votesCount / totalVotes) * 100) : 0,
    }));

    return {
      ...poll,
      options: optionsWithPercentage,
      userVote,
      hasVoted: userVote !== null,
      isEnded: poll.isEnded || (poll.endsAt && poll.endsAt < Date.now()),
    };
  },
});

/** Get user's poll votes */
export const getMyVotes = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    const votes = await ctx.db
      .query("pollVotes")
      .withIndex("by_voter", (q) => q.eq("voterId", userId))
      .order("desc")
      .take(limit);

    return Promise.all(
      votes.map(async (vote) => {
        const poll = await ctx.db.get(vote.pollId);
        if (!poll) return null;

        const post = await ctx.db.get(poll.postId);

        return {
          vote,
          poll: {
            _id: poll._id,
            question: poll.question,
            options: poll.options,
            totalVotes: poll.totalVotes,
          },
          postId: poll.postId,
          postContent: post?.content?.slice(0, 100),
        };
      })
    ).then((results) => results.filter((r) => r !== null));
  },
});

/** Get polls ending soon (for notifications) */
export const getEndingSoon = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const now = Date.now();
    const oneDayFromNow = now + 24 * 60 * 60 * 1000;

    // Get polls ending in next 24 hours
    const polls = await ctx.db
      .query("polls")
      .withIndex("by_end_time")
      .filter((q) =>
        q.and(
          q.gt(q.field("endsAt"), now),
          q.lt(q.field("endsAt"), oneDayFromNow),
          q.neq(q.field("isEnded"), true)
        )
      )
      .take(50);

    // Filter to polls user hasn't voted on yet
    const unvotedPolls = [];
    for (const poll of polls) {
      const vote = await ctx.db
        .query("pollVotes")
        .withIndex("by_poll_voter", (q) => q.eq("pollId", poll._id).eq("voterId", userId))
        .unique();

      if (!vote) {
        unvotedPolls.push(poll);
      }
    }

    return unvotedPolls;
  },
});

// ===== MUTATIONS =====

/** Create a poll attached to a post */
export const create = mutation({
  args: {
    postId: v.id("posts"),
    question: v.string(),
    options: v.array(v.string()),
    allowMultiple: v.optional(v.boolean()),
    endsAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify post ownership
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== userId) {
      throw new Error("Post not found");
    }

    // Check if post already has a poll
    const existingPoll = await ctx.db
      .query("polls")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .unique();

    if (existingPoll) {
      throw new Error("Post already has a poll");
    }

    // Validate options
    if (args.options.length < MIN_POLL_OPTIONS) {
      throw new Error(`Minimum ${MIN_POLL_OPTIONS} options required`);
    }

    if (args.options.length > MAX_POLL_OPTIONS) {
      throw new Error(`Maximum ${MAX_POLL_OPTIONS} options allowed`);
    }

    // Clean and validate option texts
    const cleanedOptions = args.options.map((o) => o.trim()).filter((o) => o.length > 0);

    if (cleanedOptions.length < MIN_POLL_OPTIONS) {
      throw new Error("Options cannot be empty");
    }

    // Check for duplicates
    const uniqueOptions = new Set(cleanedOptions.map((o) => o.toLowerCase()));
    if (uniqueOptions.size !== cleanedOptions.length) {
      throw new Error("Duplicate options are not allowed");
    }

    // Validate end time
    if (args.endsAt && args.endsAt < Date.now()) {
      throw new Error("End time must be in the future");
    }

    // Create poll
    const pollId = await ctx.db.insert("polls", {
      postId: args.postId,
      authorId: userId,
      question: args.question.trim(),
      options: cleanedOptions.map((text, index) => ({
        id: `option_${index}`,
        text,
        votesCount: 0,
      })),
      allowMultiple: args.allowMultiple ?? false,
      endsAt: args.endsAt,
      totalVotes: 0,
      isEnded: false,
      createdAt: Date.now(),
    });

    // If poll has an end time, schedule automatic ending
    if (args.endsAt) {
      const endFunctionId = await ctx.scheduler.runAt(args.endsAt, internal.polls.autoEndPoll, {
        pollId,
      });
      await ctx.db.patch(pollId, { endFunctionId });
    }

    return { pollId };
  },
});

/** Vote on a poll */
export const vote = mutation({
  args: {
    pollId: v.id("polls"),
    optionIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const poll = await ctx.db.get(args.pollId);
    if (!poll) {
      throw new Error("Poll not found");
    }

    // Check if ended
    if (poll.isEnded || (poll.endsAt && poll.endsAt < Date.now())) {
      throw new Error("Poll has ended");
    }

    // Check if already voted
    const existingVote = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll_voter", (q) => q.eq("pollId", args.pollId).eq("voterId", userId))
      .unique();

    if (existingVote) {
      throw new Error("You have already voted on this poll");
    }

    // Validate options
    if (args.optionIds.length === 0) {
      throw new Error("Must select at least one option");
    }

    if (!poll.allowMultiple && args.optionIds.length > 1) {
      throw new Error("Only one option can be selected");
    }

    // Verify all option IDs are valid
    const validOptionIds = poll.options.map((o) => o.id);
    for (const optionId of args.optionIds) {
      if (!validOptionIds.includes(optionId)) {
        throw new Error("Invalid option");
      }
    }

    // Create vote
    await ctx.db.insert("pollVotes", {
      pollId: args.pollId,
      voterId: userId,
      optionIds: args.optionIds,
      votedAt: Date.now(),
    });

    // Update vote counts
    const updatedOptions = poll.options.map((option) => ({
      ...option,
      votesCount: args.optionIds.includes(option.id) ? option.votesCount + 1 : option.votesCount,
    }));

    await ctx.db.patch(args.pollId, {
      options: updatedOptions,
      totalVotes: (poll.totalVotes ?? 0) + 1,
    });

    return { success: true };
  },
});

/** End a poll early */
export const endPoll = mutation({
  args: { pollId: v.id("polls") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const poll = await ctx.db.get(args.pollId);
    if (!poll || poll.authorId !== userId) {
      throw new Error("Poll not found");
    }

    if (poll.isEnded) {
      throw new Error("Poll is already ended");
    }

    // Cancel the scheduled auto-end function if it exists
    if (poll.endFunctionId) {
      await ctx.scheduler.cancel(poll.endFunctionId);
    }

    await ctx.db.patch(args.pollId, {
      isEnded: true,
      endFunctionId: undefined,
    });

    // Notify voters
    await ctx.scheduler.runAfter(0, internal.polls.notifyPollEnded, {
      pollId: args.pollId,
    });

    return { success: true };
  },
});

/** Delete a poll */
export const remove = mutation({
  args: { pollId: v.id("polls") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const poll = await ctx.db.get(args.pollId);
    if (!poll || poll.authorId !== userId) {
      throw new Error("Poll not found");
    }

    // Cancel the scheduled auto-end function if it exists
    if (poll.endFunctionId) {
      await ctx.scheduler.cancel(poll.endFunctionId);
    }

    // Delete all votes
    const votes = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", args.pollId))
      .take(10000);

    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    // Delete poll
    await ctx.db.delete(args.pollId);

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Auto-end a poll (called by scheduler) */
export const autoEndPoll = internalMutation({
  args: {
    pollId: v.id("polls"),
  },
  handler: async (ctx, args) => {
    const poll = await ctx.db.get(args.pollId);

    // Guard: Poll might have been deleted or already ended
    if (!poll) {
      return { success: false, reason: "Poll not found" };
    }

    if (poll.isEnded) {
      return { success: false, reason: "Poll already ended" };
    }

    // End the poll
    await ctx.db.patch(args.pollId, {
      isEnded: true,
      endFunctionId: undefined,
    });

    // Notify poll author
    await ctx.scheduler.runAfter(0, internal.polls.notifyPollEnded, {
      pollId: args.pollId,
    });

    return { success: true };
  },
});

/** Check for missed ended polls (cron fallback) */
export const checkEndedPolls = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find polls that should have ended but weren't processed by runAt
    const endedPolls = await ctx.db
      .query("polls")
      .withIndex("by_end_time")
      .filter((q) => q.and(q.lt(q.field("endsAt"), now), q.neq(q.field("isEnded"), true)))
      .take(100);

    let processed = 0;

    for (const poll of endedPolls) {
      // Use the same autoEndPoll handler
      await ctx.scheduler.runAfter(0, internal.polls.autoEndPoll, {
        pollId: poll._id,
      });
      processed++;
    }

    return { processed };
  },
});

/** Notify when poll ends */
export const notifyPollEnded = internalMutation({
  args: { pollId: v.id("polls") },
  handler: async (ctx, args) => {
    const poll = await ctx.db.get(args.pollId);
    if (!poll) return;

    // Find winning option(s)
    const maxVotes = Math.max(...poll.options.map((o) => o.votesCount));
    const winners = poll.options.filter((o) => o.votesCount === maxVotes);

    // Notify author
    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: poll.authorId,
      type: "poll_ended",
      pollId: args.pollId,
      message: `Your poll "${poll.question.slice(0, 50)}" has ended with ${poll.totalVotes ?? 0} votes`,
    });
  },
});
