/**
 * @fileoverview Direct Messages Module
 *
 * Handles private messaging between users with rich features.
 *
 * Features:
 *   - 1:1 conversations with auto-creation
 *   - Media and voice note attachments
 *   - Tip support in messages
 *   - Read receipts and unread counts
 *   - DM permission checks
 *
 * Security:
 *   - Block enforcement prevents messaging
 *   - Generic errors prevent user enumeration
 *   - Creator DM pricing/subscription gating
 *   - VIP bypass for subscription requirements
 *   - Rate limiting on message sends
 *   - Max 10,000 characters per message
 */

import { v } from "convex/values";
import { query, mutation, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const MESSAGE_MAX_LENGTH = 10000;
const DEFAULT_LIMIT = 50;

// ===== HELPERS =====

/** Enrich message with sender data and media URLs */
async function enrichMessage(ctx: QueryCtx, message: Doc<"messages">) {
  const sender = await ctx.db.get(message.senderId);
  if (!sender) return null;

  let mediaUrls: string[] = [];
  if (message.mediaIds && message.mediaIds.length > 0) {
    const mediaPromises = message.mediaIds.map(async (mediaId) => {
      const media = await ctx.db.get(mediaId);
      if (media?.storageId) {
        return await ctx.storage.getUrl(media.storageId);
      }
      return null;
    });
    mediaUrls = (await Promise.all(mediaPromises)).filter((url): url is string => url !== null);
  }

  // Get voice note URL if present
  let voiceNoteUrl: string | null = null;
  let voiceNoteDuration: number | null = null;
  if (message.voiceNoteId) {
    const voiceNote = await ctx.db.get(message.voiceNoteId);
    if (voiceNote?.storageId) {
      voiceNoteUrl = await ctx.storage.getUrl(voiceNote.storageId);
      voiceNoteDuration = voiceNote.durationSeconds;
    }
  }

  return {
    ...message,
    sender: {
      _id: sender._id,
      username: sender.username,
      displayName: sender.displayName,
      avatarR2Key: sender.avatarR2Key,
      // DiceBear avatar fields
      dicebearSeed: sender.dicebearSeed,
      dicebearBgColor: sender.dicebearBgColor,
      dicebearEyes: sender.dicebearEyes,
      dicebearMouth: sender.dicebearMouth,
    },
    mediaUrls,
    voiceNoteUrl,
    voiceNoteDuration,
  };
}

// ===== QUERIES =====

/** Get all conversations for current user */
export const getConversations = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;

    const userConvEntries = await ctx.db
      .query("userConversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    // Fetch full conversation data
    const userConversationsData = await Promise.all(
      userConvEntries.map(async (entry) => ctx.db.get(entry.conversationId))
    );
    const userConversations = userConversationsData.filter(
      (c): c is NonNullable<typeof c> => c !== null
    );

    // Enrich with participant info and last message
    const enriched = await Promise.all(
      userConversations.map(async (conv) => {
        const otherUserId = conv.participantIds.find((id) => id !== userId);
        if (!otherUserId) return null;

        const otherUser = await ctx.db.get(otherUserId);
        if (!otherUser || otherUser.status !== "active") return null;

        let lastMessage = null;
        if (conv.lastMessageId) {
          const msg = await ctx.db.get(conv.lastMessageId);
          if (msg) {
            lastMessage = {
              content: msg.content.slice(0, 50),
              senderId: msg.senderId,
              createdAt: msg.createdAt,
              isRead: !!msg.readAt,
            };
          }
        }

        // Use denormalized unread count based on user's position in participantIds
        // participantIds are sorted, so find which index this user is at
        const userIndex = conv.participantIds.indexOf(userId);
        const unreadCount = userIndex === 0 ? (conv.unreadCount0 ?? 0) : (conv.unreadCount1 ?? 0);

        return {
          ...conv,
          otherUser: {
            _id: otherUser._id,
            username: otherUser.username,
            displayName: otherUser.displayName,
            avatarR2Key: otherUser.avatarR2Key,
            dicebearSeed: otherUser.dicebearSeed,
            dicebearBgColor: otherUser.dicebearBgColor,
            dicebearEyes: otherUser.dicebearEyes,
            dicebearMouth: otherUser.dicebearMouth,
            isVerified: otherUser.isVerified,
          },
          lastMessage,
          unreadCount,
        };
      })
    );

    return enriched.filter((c) => c !== null);
  },
});

/** Get messages in a conversation */
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { messages: [], hasMore: false };
    }

    // Verify user is participant
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.participantIds.includes(userId)) {
      throw new Error("Conversation not found");
    }

    const limit = args.limit ?? DEFAULT_LIMIT;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(limit + 1);

    const hasMore = messages.length > limit;
    const items = messages.slice(0, limit);

    const enriched = await Promise.all(items.map(async (msg) => await enrichMessage(ctx, msg)));

    return {
      messages: enriched.filter((m) => m !== null).reverse(), // Oldest first
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Get existing conversation with another user */
export const getConversationWith = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      return null;
    }

    if (currentUserId === args.userId) {
      throw new Error("Cannot message yourself");
    }

    // Sort IDs for consistent lookup
    const participantIds = [currentUserId, args.userId].sort() as [Id<"users">, Id<"users">];

    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_participants", (q) => q.eq("participantIds", participantIds))
      .first();

    if (!conversation) return null;

    const otherUser = await ctx.db.get(args.userId);
    if (!otherUser) return null;

    return {
      ...conversation,
      otherUser: {
        _id: otherUser._id,
        username: otherUser.username,
        displayName: otherUser.displayName,
        avatarR2Key: otherUser.avatarR2Key,
        dicebearSeed: otherUser.dicebearSeed,
        dicebearBgColor: otherUser.dicebearBgColor,
        dicebearEyes: otherUser.dicebearEyes,
        dicebearMouth: otherUser.dicebearMouth,
        isVerified: otherUser.isVerified,
      },
    };
  },
});

// ===== MUTATIONS =====

/** Send a message with optional media, voice note, or tip */
export const send = mutation({
  args: {
    recipientId: v.id("users"),
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),
    voiceNoteId: v.optional(v.id("voiceNotes")),
    tipAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Rate limit check
    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "message",
    });
    if (!rateCheck.allowed) {
      throw new Error(
        `Rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
      );
    }

    if (userId === args.recipientId) {
      throw new Error("Cannot message yourself");
    }

    // Validate recipient exists
    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient || recipient.status !== "active") {
      // SECURITY: Use generic message to prevent user enumeration
      throw new Error("Cannot message this user");
    }

    // Check if blocked
    const blocked = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", args.recipientId).eq("blockedId", userId))
      .unique();

    if (blocked) {
      // SECURITY: Same generic message as above to prevent enumeration
      throw new Error("Cannot message this user");
    }

    // Check if recipient is a creator requiring subscription for DMs
    if (recipient.role === "creator" && recipient.isAcceptingDMs !== false) {
      // Check if recipient has DM pricing set (> 0 means subscribers only or paid)
      const dmPrice = recipient.dmPricing ?? 0;

      if (dmPrice > 0) {
        // Check if sender has an active subscription to this creator
        const subscription = await ctx.db
          .query("subscriptions")
          .withIndex("by_fan_creator", (q) =>
            q.eq("fanId", userId).eq("creatorId", args.recipientId)
          )
          .first();

        const hasActiveSubscription =
          subscription?.status === "active" || subscription?.status === "trialing";

        if (!hasActiveSubscription) {
          // Check if user is a VIP (VIPs can always DM)
          const isVip = await ctx.db
            .query("vipMembers")
            .withIndex("by_pair", (q) => q.eq("creatorId", args.recipientId).eq("memberId", userId))
            .unique();

          if (!isVip) {
            throw new Error("SUBSCRIPTION_REQUIRED");
          }
        }
      }
    }

    // Validate content
    const content = args.content.trim();
    if (!content && (!args.mediaIds || args.mediaIds.length === 0) && !args.voiceNoteId) {
      throw new Error("Message cannot be empty");
    }
    if (content.length > MESSAGE_MAX_LENGTH) {
      throw new Error(`Message must be at most ${MESSAGE_MAX_LENGTH} characters`);
    }

    // Handle tip if present
    if (args.tipAmount && args.tipAmount > 0) {
      const user = await ctx.db.get(userId);
      if (!user || (user.coinsBalance ?? 0) < args.tipAmount) {
        throw new Error("Insufficient coin balance");
      }

      // Deduct from sender (with safety check to prevent negative balance)
      const newSenderBalance = Math.max(0, (user.coinsBalance ?? 0) - args.tipAmount);
      await ctx.db.patch(userId, {
        coinsBalance: newSenderBalance,
      });

      // Add to recipient
      await ctx.db.patch(args.recipientId, {
        coinsBalance: (recipient.coinsBalance ?? 0) + args.tipAmount,
      });

      // Create transaction records
      await ctx.db.insert("coinTransactions", {
        userId,
        type: "tip_sent",
        amount: -args.tipAmount,
        relatedUserId: args.recipientId,
        createdAt: Date.now(),
      });

      await ctx.db.insert("coinTransactions", {
        userId: args.recipientId,
        type: "tip_received",
        amount: args.tipAmount,
        relatedUserId: userId,
        createdAt: Date.now(),
      });
    }

    // Get or create conversation
    const participantIds = [userId, args.recipientId].sort() as [Id<"users">, Id<"users">];

    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_participants", (q) => q.eq("participantIds", participantIds))
      .first();

    const now = Date.now();
    if (!conversation) {
      const convId = await ctx.db.insert("conversations", {
        participantIds,
        lastMessageAt: now,
        createdAt: now,
      });
      conversation = (await ctx.db.get(convId))!;

      // Create userConversations entries for both participants (for indexed queries)
      for (const participantId of participantIds) {
        await ctx.db.insert("userConversations", {
          userId: participantId,
          conversationId: convId,
          lastMessageAt: now,
        });
      }
    }

    // Create message
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      senderId: userId,
      content,
      mediaIds: args.mediaIds,
      voiceNoteId: args.voiceNoteId,
      tipAmount: args.tipAmount,
      createdAt: Date.now(),
    });

    // Update conversation with last message and increment recipient's unread count
    // participantIds are sorted, so find recipient's position
    const recipientIndex = conversation.participantIds.indexOf(args.recipientId);
    const unreadField = recipientIndex === 0 ? "unreadCount0" : "unreadCount1";
    const currentUnread =
      recipientIndex === 0 ? (conversation.unreadCount0 ?? 0) : (conversation.unreadCount1 ?? 0);

    const messageTime = Date.now();
    await ctx.db.patch(conversation._id, {
      lastMessageId: messageId,
      lastMessageAt: messageTime,
      [unreadField]: currentUnread + 1,
    });

    // Update userConversations lastMessageAt for both participants (for sort order)
    for (const participantId of conversation.participantIds) {
      const userConvEntry = await ctx.db
        .query("userConversations")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
        .filter((q) => q.eq(q.field("userId"), participantId))
        .first();
      if (userConvEntry) {
        await ctx.db.patch(userConvEntry._id, { lastMessageAt: messageTime });
      }
    }

    // Create notification
    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: args.recipientId,
      type: args.tipAmount ? "tip" : "message",
      actorId: userId,
      messageId,
      amount: args.tipAmount,
    });

    return { messageId, conversationId: conversation._id };
  },
});

/** Mark messages as read */
export const markAsRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify user is participant
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || !conversation.participantIds.includes(userId)) {
      throw new Error("Conversation not found");
    }

    // Get the user's unread count from denormalized field
    const userIndex = conversation.participantIds.indexOf(userId);
    const currentUnread =
      userIndex === 0 ? (conversation.unreadCount0 ?? 0) : (conversation.unreadCount1 ?? 0);

    // Only process if there are unread messages
    if (currentUnread === 0) {
      return { marked: 0 };
    }

    // Mark unread messages from other users as read
    const unread = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .filter((q) => q.and(q.neq(q.field("senderId"), userId), q.eq(q.field("readAt"), undefined)))
      .take(100);

    const now = Date.now();
    for (const msg of unread) {
      await ctx.db.patch(msg._id, { readAt: now });
    }

    // Reset the user's unread count to 0
    const unreadField = userIndex === 0 ? "unreadCount0" : "unreadCount1";
    await ctx.db.patch(args.conversationId, {
      [unreadField]: 0,
    });

    return { marked: unread.length };
  },
});

/** Delete a message (own messages only) */
export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    if (message.senderId !== userId) {
      throw new Error("Cannot delete this message");
    }

    await ctx.db.delete(args.messageId);

    // Update conversation last message if needed
    const conversation = await ctx.db.get(message.conversationId);
    if (conversation && conversation.lastMessageId === args.messageId) {
      const latestMessage = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", message.conversationId))
        .order("desc")
        .first();

      await ctx.db.patch(message.conversationId, {
        lastMessageId: latestMessage?._id,
        lastMessageAt: latestMessage?.createdAt ?? conversation.createdAt,
      });
    }

    return { success: true };
  },
});

/** Get total unread message count */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return 0;
    }

    // Use userConversations join table for efficient indexed lookup
    // This only reads conversations the user is actually part of
    const userConvEntries = await ctx.db
      .query("userConversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);

    if (userConvEntries.length === 0) {
      return 0;
    }

    // Batch fetch conversation details for unread counts
    const conversations = await Promise.all(
      userConvEntries.map((entry) => ctx.db.get(entry.conversationId))
    );

    let total = 0;
    for (const conv of conversations) {
      if (!conv) continue;

      // Use denormalized unread count based on user's position in participantIds
      const userIndex = conv.participantIds.indexOf(userId);
      if (userIndex === -1) continue;

      const unreadCount = userIndex === 0 ? (conv.unreadCount0 ?? 0) : (conv.unreadCount1 ?? 0);
      total += unreadCount;
    }

    return total;
  },
});

/** Check if current user can DM a specific user */
export const canDmUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      return { canDm: false, reason: "NOT_AUTHENTICATED" };
    }

    if (currentUserId === args.userId) {
      return { canDm: false, reason: "CANNOT_MESSAGE_SELF" };
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.status !== "active") {
      return { canDm: false, reason: "USER_NOT_FOUND" };
    }

    // Check if blocked
    const blocked = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", args.userId).eq("blockedId", currentUserId))
      .unique();

    if (blocked) {
      return { canDm: false, reason: "BLOCKED" };
    }

    // Check if target is not accepting DMs
    if (targetUser.isAcceptingDMs === false) {
      return { canDm: false, reason: "NOT_ACCEPTING_DMS" };
    }

    // If target is a creator with DM pricing, check subscription
    if (targetUser.role === "creator") {
      const dmPrice = targetUser.dmPricing ?? 0;

      if (dmPrice > 0) {
        // Check for active subscription
        const subscription = await ctx.db
          .query("subscriptions")
          .withIndex("by_fan_creator", (q) =>
            q.eq("fanId", currentUserId).eq("creatorId", args.userId)
          )
          .first();

        const hasActiveSubscription =
          subscription?.status === "active" || subscription?.status === "trialing";

        if (hasActiveSubscription) {
          return { canDm: true };
        }

        // Check if VIP
        const isVip = await ctx.db
          .query("vipMembers")
          .withIndex("by_pair", (q) => q.eq("creatorId", args.userId).eq("memberId", currentUserId))
          .unique();

        if (isVip) {
          return { canDm: true };
        }

        // Cannot DM - need subscription
        return {
          canDm: false,
          reason: "SUBSCRIPTION_REQUIRED",
          creator: {
            _id: targetUser._id,
            username: targetUser.username,
            displayName: targetUser.displayName,
            avatarR2Key: targetUser.avatarR2Key,
            isVerified: targetUser.isVerified,
          },
        };
      }
    }

    return { canDm: true };
  },
});
