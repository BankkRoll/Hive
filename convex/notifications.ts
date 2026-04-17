/**
 * @fileoverview Notifications Module
 *
 * Manages in-app and push notifications for user activity.
 *
 * Features:
 *   - Multiple notification types (follow, like, comment, tip, etc.)
 *   - Push notification integration
 *   - Read/unread status tracking
 *   - User preference respecting
 *   - Duplicate suppression (5 min window for same actor+type)
 *   - Automatic cleanup of old notifications (30 days)
 *
 * Notification Types:
 *   - follow, like, comment, mention, tip, subscription
 *   - message, vip_added, mod_added, story_mention
 *   - poll_ended, referral_signup, referral_reward
 *   - payout_completed, payout_failed, system
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";

// ===== HELPERS =====

/** Map notification type to push notification content */
function getPushContent(
  type: Doc<"notifications">["type"],
  actorName: string | undefined,
  message: string | undefined,
  amount: number | undefined
): { title: string; body: string; url: string } {
  const actor = actorName || "Someone";

  switch (type) {
    case "follow":
      return {
        title: "New Follower",
        body: `${actor} started following you`,
        url: "/notifications",
      };
    case "like":
      return {
        title: "New Like",
        body: `${actor} liked your post`,
        url: "/notifications",
      };
    case "comment":
      return {
        title: "New Comment",
        body: `${actor} commented on your post`,
        url: "/notifications",
      };
    case "mention":
      return {
        title: "Mentioned",
        body: `${actor} mentioned you`,
        url: "/notifications",
      };
    case "tip":
      return {
        title: "New Tip!",
        body: `${actor} sent you a $${(amount || 0).toFixed(2)} tip`,
        url: "/wallet",
      };
    case "subscription":
      return {
        title: "New Subscriber!",
        body: `${actor} subscribed to your content`,
        url: "/dashboard",
      };
    case "message":
      return {
        title: "New Message",
        body: `${actor} sent you a message`,
        url: "/messages",
      };
    case "vip_added":
      return {
        title: "VIP Access Granted",
        body: `${actor} added you as a VIP`,
        url: "/notifications",
      };
    case "mod_added":
      return {
        title: "Moderator Access",
        body: `${actor} made you a moderator`,
        url: "/notifications",
      };
    case "story_mention":
      return {
        title: "Story Mention",
        body: `${actor} mentioned you in their story`,
        url: "/notifications",
      };
    case "poll_ended":
      return {
        title: "Poll Ended",
        body: "A poll you participated in has ended",
        url: "/notifications",
      };
    case "referral_signup":
      return {
        title: "Referral Signup",
        body: "Someone signed up using your referral link",
        url: "/referrals",
      };
    case "referral_reward":
      return {
        title: "Referral Reward",
        body: `You earned $${(amount || 0).toFixed(2)} from a referral`,
        url: "/wallet",
      };
    case "payout_completed":
      return {
        title: "Payout Complete",
        body: `Your payout of $${(amount || 0).toFixed(2)} has been sent`,
        url: "/wallet",
      };
    case "payout_failed":
      return {
        title: "Payout Failed",
        body: "There was an issue with your payout",
        url: "/wallet",
      };
    case "system":
      return {
        title: "Notification",
        body: message || "You have a new notification",
        url: "/notifications",
      };
    default:
      return {
        title: "Notification",
        body: "You have a new notification",
        url: "/notifications",
      };
  }
}

/** Check if user wants push notifications for this type */
function shouldSendPushForType(
  type: Doc<"notifications">["type"],
  settings: {
    pushNotifications: boolean;
    notifyOnNewFollower: boolean;
    notifyOnNewSubscriber: boolean;
    notifyOnTip: boolean;
    notifyOnComment: boolean;
    notifyOnLike: boolean;
    notifyOnDM: boolean;
    notifyOnMention: boolean;
  }
): boolean {
  if (!settings.pushNotifications) return false;

  switch (type) {
    case "follow":
      return settings.notifyOnNewFollower;
    case "subscription":
      return settings.notifyOnNewSubscriber;
    case "tip":
      return settings.notifyOnTip;
    case "comment":
      return settings.notifyOnComment;
    case "like":
      return settings.notifyOnLike;
    case "message":
      return settings.notifyOnDM;
    case "mention":
    case "story_mention":
      return settings.notifyOnMention;
    // Always send push for these important notifications
    case "vip_added":
    case "mod_added":
    case "payout_completed":
    case "payout_failed":
    case "referral_reward":
    case "system":
      return true;
    // Lower priority - use default push setting
    case "poll_ended":
    case "referral_signup":
    default:
      return settings.pushNotifications;
  }
}

const DEFAULT_LIMIT = 20;

const notificationTypeValidator = v.union(
  v.literal("follow"),
  v.literal("like"),
  v.literal("comment"),
  v.literal("mention"),
  v.literal("tip"),
  v.literal("subscription"),
  v.literal("message"),
  v.literal("vip_added"),
  v.literal("mod_added"),
  v.literal("story_mention"),
  v.literal("poll_ended"),
  v.literal("referral_signup"),
  v.literal("referral_reward"),
  v.literal("system"),
  v.literal("payout_completed"),
  v.literal("payout_failed")
);

// ===== INTERNAL MUTATIONS =====

/** Create a notification with optional push */
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    type: notificationTypeValidator,
    actorId: v.optional(v.id("users")), // Optional for system notifications
    postId: v.optional(v.id("posts")),
    commentId: v.optional(v.id("comments")),
    messageId: v.optional(v.id("messages")),
    storyId: v.optional(v.id("stories")),
    pollId: v.optional(v.id("polls")),
    amount: v.optional(v.number()),
    message: v.optional(v.string()), // For system notifications
  },
  handler: async (ctx, args) => {
    // Don't create notification if actor is the user (but only if actorId is provided)
    if (args.actorId && args.userId === args.actorId) {
      return null;
    }

    // Check for duplicate recent notification (within 5 minutes)
    // Using by_type index: ["userId", "type", "createdAt"]
    const recentCutoff = Date.now() - 5 * 60 * 1000;
    const recentByType = await ctx.db
      .query("notifications")
      .withIndex("by_type", (q) =>
        q.eq("userId", args.userId).eq("type", args.type).gt("createdAt", recentCutoff)
      )
      .take(10);

    // Check if any of these recent notifications are from the same actor
    const recent = recentByType.find((n) => n.actorId === args.actorId);

    // Don't create duplicate for same actor + type within 5 min
    if (recent && args.type === "like") {
      return null;
    }

    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      actorId: args.actorId,
      postId: args.postId,
      commentId: args.commentId,
      messageId: args.messageId,
      storyId: args.storyId,
      pollId: args.pollId,
      amount: args.amount,
      message: args.message,
      read: false,
      createdAt: Date.now(),
    });

    // Trigger push notification
    // Get user settings
    const userSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    // Default settings if none exist
    const settings = {
      pushNotifications: userSettings?.pushNotifications ?? true,
      notifyOnNewFollower: userSettings?.notifyOnNewFollower ?? true,
      notifyOnNewSubscriber: userSettings?.notifyOnNewSubscriber ?? true,
      notifyOnTip: userSettings?.notifyOnTip ?? true,
      notifyOnComment: userSettings?.notifyOnComment ?? true,
      notifyOnLike: userSettings?.notifyOnLike ?? false,
      notifyOnDM: userSettings?.notifyOnDM ?? true,
      notifyOnMention: userSettings?.notifyOnMention ?? true,
    };

    // Check if we should send push for this notification type
    if (shouldSendPushForType(args.type, settings)) {
      // Get actor's name for the push notification
      let actorName: string | undefined;
      if (args.actorId) {
        const actor = await ctx.db.get(args.actorId);
        if (actor && "displayName" in actor) {
          actorName = actor.displayName || actor.username;
        }
      }

      // Generate push content
      const pushContent = getPushContent(args.type, actorName, args.message, args.amount);

      // Schedule push notification action
      await ctx.scheduler.runAfter(0, internal.pushActions.sendPushNotification, {
        userId: args.userId,
        title: pushContent.title,
        body: pushContent.body,
        url: pushContent.url,
        data: {
          notificationId,
          type: args.type,
        },
      });
    }

    return notificationId;
  },
});

// ===== QUERIES =====

/** Get notifications for current user */
export const getAll = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { notifications: [], hasMore: false, unreadCount: 0 };
    }

    const limit = args.limit ?? DEFAULT_LIMIT;

    let notifications: Doc<"notifications">[];

    if (args.unreadOnly) {
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) => q.eq("userId", userId).eq("read", false))
        .order("desc")
        .take(limit + 1);
    } else {
      notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .take(limit + 1);
    }

    const hasMore = notifications.length > limit;
    const items = notifications.slice(0, limit);

    // Enrich with actor data
    const enriched = await Promise.all(
      items.map(async (notif) => {
        // Skip notifications without an actor
        if (!notif.actorId) return null;

        const actor = await ctx.db.get(notif.actorId);
        if (!actor) return null;

        // Ensure we have a users document (type guard)
        if (!("username" in actor)) return null;

        let postPreview: string | undefined;
        if (notif.postId) {
          const post = await ctx.db.get(notif.postId);
          postPreview = post?.content?.slice(0, 50);
        }

        let commentPreview: string | undefined;
        if (notif.commentId) {
          const comment = await ctx.db.get(notif.commentId);
          commentPreview = comment?.content?.slice(0, 50);
        }

        return {
          ...notif,
          actor: {
            _id: actor._id,
            username: actor.username,
            displayName: actor.displayName,
            avatarR2Key: actor.avatarR2Key,
            dicebearSeed: actor.dicebearSeed,
            dicebearBgColor: actor.dicebearBgColor,
            dicebearEyes: actor.dicebearEyes,
            dicebearMouth: actor.dicebearMouth,
            isVerified: actor.isVerified,
          },
          postPreview,
          commentPreview,
        };
      })
    );

    // Get unread count
    const unreadNotifs = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", userId).eq("read", false))
      .take(100);

    return {
      notifications: enriched.filter((n) => n !== null),
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
      unreadCount: unreadNotifs.length,
    };
  },
});

/** Get unread count */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return 0;
    }

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", userId).eq("read", false))
      .take(100);

    return unread.length;
  },
});

// ===== MUTATIONS =====

/** Mark a notification as read */
export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Notification not found");
    }

    await ctx.db.patch(args.notificationId, { read: true });
    return { success: true };
  },
});

/** Mark all notifications as read */
export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", userId).eq("read", false))
      .take(500);

    for (const notif of unread) {
      await ctx.db.patch(notif._id, { read: true });
    }

    return { marked: unread.length };
  },
});

/** Delete a notification */
export const remove = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Notification not found");
    }

    await ctx.db.delete(args.notificationId);
    return { success: true };
  },
});

/** Delete all notifications */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    for (const notif of notifications) {
      await ctx.db.delete(notif._id);
    }

    return { deleted: notifications.length };
  },
});

/** Get notification settings */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    // Return defaults - can be extended with actual settings table
    return {
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      tips: true,
      subscriptions: true,
      messages: true,
      email: false,
      push: true,
    };
  },
});

// ===== SCHEDULED CLEANUP =====

/** Clean up old read notifications (keep last 30 days) */
export const cleanupOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Delete old READ notifications using by_read_createdAt index: ["read", "createdAt"]
    const oldNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_read_createdAt", (q) => q.eq("read", true).lt("createdAt", thirtyDaysAgo))
      .take(100); // Process in smaller batches to stay within transaction limits

    for (const notif of oldNotifications) {
      await ctx.db.delete(notif._id);
    }

    // If there are more, the next scheduled run will continue
    return { deleted: oldNotifications.length };
  },
});
