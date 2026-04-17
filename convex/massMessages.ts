/**
 * @fileoverview Mass Messages Module
 *
 * Allows creators to send messages to multiple subscribers at once.
 *
 * Features:
 *   - Target specific audiences (all subscribers, VIPs, tiers, etc.)
 *   - Schedule messages for future delivery
 *   - Draft/scheduled/sent/failed status tracking
 *   - Delivery and open rate analytics
 *   - Batched sending to prevent timeouts
 *
 * Audiences:
 *   - all_subscribers: All subscribers regardless of status
 *   - active_subscribers: Currently active subscribers
 *   - expiring_subscribers: Subscribers expiring within 7 days
 *   - vips: VIP members only
 *   - top_tippers: Top N tippers by total amount
 *   - new_subscribers: Subscribed within last 30 days
 *   - specific_tier: Specific subscription tier
 *
 * Limits:
 *   - Max 10,000 recipients per message
 *   - Batch size: 100 per processing cycle
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, type QueryCtx } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";

const MAX_MASS_MESSAGE_RECIPIENTS = 10000;
const BATCH_SIZE = 100;

// ===== QUERIES =====

/** Get creator's mass messages */
export const getMyMassMessages = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("scheduled"),
        v.literal("sending"),
        v.literal("sent"),
        v.literal("failed")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = args.limit ?? 50;

    let messages = await ctx.db
      .query("massMessages")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .order("desc")
      .take(limit * 2);

    if (args.status) {
      messages = messages.filter((m) => m.status === args.status);
    }

    return messages.slice(0, limit);
  },
});

/** Get mass message by ID */
export const getById = query({
  args: { massMessageId: v.id("massMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const message = await ctx.db.get(args.massMessageId);
    if (!message || message.creatorId !== userId) return null;

    return message;
  },
});

/** Preview audience recipients */
export const previewAudience = query({
  args: {
    audience: v.union(
      v.literal("all_subscribers"),
      v.literal("active_subscribers"),
      v.literal("expiring_subscribers"),
      v.literal("vips"),
      v.literal("top_tippers"),
      v.literal("new_subscribers"),
      v.literal("specific_tier")
    ),
    tierId: v.optional(v.id("subscriptionTiers")),
    topTipperCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { count: 0, preview: [] };

    const recipients = await getAudienceRecipients(ctx, userId, args);

    const preview = await Promise.all(
      recipients.slice(0, 10).map(async (recipientId) => {
        const user = await ctx.db.get(recipientId);
        if (!user) return null;
        return {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatarR2Key: user.avatarR2Key,
        };
      })
    );

    return {
      count: recipients.length,
      preview: preview.filter((p) => p !== null),
    };
  },
});

/** Get delivery stats for a mass message */
export const getDeliveryStats = query({
  args: { massMessageId: v.id("massMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const message = await ctx.db.get(args.massMessageId);
    if (!message || message.creatorId !== userId) return null;

    const recipients = await ctx.db
      .query("massMessageRecipients")
      .withIndex("by_mass_message", (q) => q.eq("massMessageId", args.massMessageId))
      .take(MAX_MASS_MESSAGE_RECIPIENTS);

    const stats = {
      total: recipients.length,
      pending: recipients.filter((r) => r.status === "pending").length,
      sent: recipients.filter((r) => r.status === "sent").length,
      failed: recipients.filter((r) => r.status === "failed").length,
      opened: recipients.filter((r) => r.openedAt).length,
    };

    return {
      ...stats,
      deliveryRate: stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0,
      openRate: stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0,
    };
  },
});

// ===== MUTATIONS =====

/** Create a mass message */
export const create = mutation({
  args: {
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),
    audience: v.union(
      v.literal("all_subscribers"),
      v.literal("active_subscribers"),
      v.literal("expiring_subscribers"),
      v.literal("vips"),
      v.literal("top_tippers"),
      v.literal("new_subscribers"),
      v.literal("specific_tier")
    ),
    tierId: v.optional(v.id("subscriptionTiers")),
    topTipperCount: v.optional(v.number()),
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Must be a creator to send mass messages");
    }

    if (!args.content.trim()) throw new Error("Message content is required");

    if (args.audience === "specific_tier" && !args.tierId) {
      throw new Error("Tier ID is required for specific tier audience");
    }

    if (args.tierId) {
      const tier = await ctx.db.get(args.tierId);
      if (!tier || tier.creatorId !== userId) {
        throw new Error("Invalid subscription tier");
      }
    }

    if (args.isLocked && (!args.unlockPrice || args.unlockPrice < 1)) {
      throw new Error("Unlock price is required for locked messages");
    }

    if (args.scheduledFor && args.scheduledFor < Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    const recipients = await getAudienceRecipients(ctx, userId, {
      audience: args.audience,
      tierId: args.tierId,
      topTipperCount: args.topTipperCount,
    });

    if (recipients.length === 0) throw new Error("No recipients match this audience");
    if (recipients.length > MAX_MASS_MESSAGE_RECIPIENTS) {
      throw new Error(`Maximum ${MAX_MASS_MESSAGE_RECIPIENTS} recipients allowed`);
    }

    const now = Date.now();
    const status = args.scheduledFor ? "scheduled" : "draft";

    const massMessageId = await ctx.db.insert("massMessages", {
      creatorId: userId,
      content: args.content.trim(),
      mediaIds: args.mediaIds,
      audience: args.audience,
      tierId: args.tierId,
      topTipperCount: args.topTipperCount,
      isLocked: args.isLocked,
      unlockPrice: args.unlockPrice,
      recipientCount: recipients.length,
      sentCount: 0,
      openedCount: 0,
      status,
      scheduledFor: args.scheduledFor,
      createdAt: now,
    });

    if (args.scheduledFor) {
      await ctx.scheduler.runAfter(0, internal.massMessages.createRecipients, {
        massMessageId,
        recipientIds: recipients,
      });

      const scheduledFunctionId = await ctx.scheduler.runAt(
        args.scheduledFor,
        internal.massMessages.startScheduledSend,
        { massMessageId }
      );

      await ctx.db.patch(massMessageId, { scheduledFunctionId });
    }

    return { massMessageId, recipientCount: recipients.length };
  },
});

/** Update a draft/scheduled mass message */
export const update = mutation({
  args: {
    massMessageId: v.id("massMessages"),
    content: v.optional(v.string()),
    mediaIds: v.optional(v.array(v.id("media"))),
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.massMessageId);
    if (!message || message.creatorId !== userId) {
      throw new Error("Mass message not found");
    }

    if (message.status !== "draft" && message.status !== "scheduled") {
      throw new Error("Can only update draft or scheduled messages");
    }

    const updates: Record<string, unknown> = {};

    if (args.content !== undefined) updates.content = args.content.trim();
    if (args.mediaIds !== undefined) updates.mediaIds = args.mediaIds;
    if (args.isLocked !== undefined) updates.isLocked = args.isLocked;
    if (args.unlockPrice !== undefined) updates.unlockPrice = args.unlockPrice;

    if (args.scheduledFor !== undefined) {
      if (args.scheduledFor && args.scheduledFor < Date.now()) {
        throw new Error("Scheduled time must be in the future");
      }
      updates.scheduledFor = args.scheduledFor;
      updates.status = args.scheduledFor ? "scheduled" : "draft";

      if (message.scheduledFunctionId) {
        await ctx.scheduler.cancel(message.scheduledFunctionId);
        updates.scheduledFunctionId = undefined;
      }

      if (args.scheduledFor) {
        const scheduledFunctionId = await ctx.scheduler.runAt(
          args.scheduledFor,
          internal.massMessages.startScheduledSend,
          { massMessageId: args.massMessageId }
        );
        updates.scheduledFunctionId = scheduledFunctionId;
      }
    }

    await ctx.db.patch(args.massMessageId, updates);

    return { success: true };
  },
});

/** Send a mass message immediately */
export const send = mutation({
  args: { massMessageId: v.id("massMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.massMessageId);
    if (!message || message.creatorId !== userId) {
      throw new Error("Mass message not found");
    }

    if (message.status !== "draft" && message.status !== "scheduled") {
      throw new Error("Message has already been sent or is being sent");
    }

    const recipients = await getAudienceRecipients(ctx, userId, {
      audience: message.audience,
      tierId: message.tierId,
      topTipperCount: message.topTipperCount,
    });

    if (recipients.length === 0) throw new Error("No recipients match this audience");

    await ctx.db.patch(args.massMessageId, {
      status: "sending",
      recipientCount: recipients.length,
    });

    await ctx.scheduler.runAfter(0, internal.massMessages.createRecipients, {
      massMessageId: args.massMessageId,
      recipientIds: recipients,
    });

    await ctx.scheduler.runAfter(100, internal.massMessages.processSending, {
      massMessageId: args.massMessageId,
    });

    return { success: true, recipientCount: recipients.length };
  },
});

/** Cancel a scheduled mass message */
export const cancel = mutation({
  args: { massMessageId: v.id("massMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.massMessageId);
    if (!message || message.creatorId !== userId) {
      throw new Error("Mass message not found");
    }

    if (message.status !== "scheduled") {
      throw new Error("Can only cancel scheduled messages");
    }

    if (message.scheduledFunctionId) {
      await ctx.scheduler.cancel(message.scheduledFunctionId);
    }

    const recipients = await ctx.db
      .query("massMessageRecipients")
      .withIndex("by_mass_message", (q) => q.eq("massMessageId", args.massMessageId))
      .take(MAX_MASS_MESSAGE_RECIPIENTS);

    for (const recipient of recipients) {
      await ctx.db.delete(recipient._id);
    }

    await ctx.db.patch(args.massMessageId, {
      status: "draft",
      scheduledFor: undefined,
      scheduledFunctionId: undefined,
    });

    return { success: true };
  },
});

/** Delete a mass message */
export const remove = mutation({
  args: { massMessageId: v.id("massMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.massMessageId);
    if (!message || message.creatorId !== userId) {
      throw new Error("Mass message not found");
    }

    if (message.status === "sending") {
      throw new Error("Cannot delete message while sending");
    }

    if (message.scheduledFunctionId) {
      await ctx.scheduler.cancel(message.scheduledFunctionId);
    }

    const recipients = await ctx.db
      .query("massMessageRecipients")
      .withIndex("by_mass_message", (q) => q.eq("massMessageId", args.massMessageId))
      .take(MAX_MASS_MESSAGE_RECIPIENTS);

    for (const recipient of recipients) {
      await ctx.db.delete(recipient._id);
    }

    await ctx.db.delete(args.massMessageId);

    return { success: true };
  },
});

// ===== INTERNAL =====

/** Create recipient records */
export const createRecipients = internalMutation({
  args: {
    massMessageId: v.id("massMessages"),
    recipientIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const recipientId of args.recipientIds) {
      await ctx.db.insert("massMessageRecipients", {
        massMessageId: args.massMessageId,
        recipientId,
        status: "pending",
        createdAt: now,
      });
    }
  },
});

/** Process sending in batches */
export const processSending = internalMutation({
  args: { massMessageId: v.id("massMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.massMessageId);
    if (!message || message.status !== "sending") return;

    const pendingRecipients = await ctx.db
      .query("massMessageRecipients")
      .withIndex("by_mass_message", (q) =>
        q.eq("massMessageId", args.massMessageId).eq("status", "pending")
      )
      .take(BATCH_SIZE);

    if (pendingRecipients.length === 0) {
      await ctx.db.patch(args.massMessageId, {
        status: "sent",
        sentAt: Date.now(),
      });
      return;
    }

    let sentCount = 0;

    for (const recipient of pendingRecipients) {
      try {
        let conversation = await ctx.db
          .query("conversations")
          .withIndex("by_participants")
          .filter((q) =>
            q.eq(q.field("participantIds"), [message.creatorId, recipient.recipientId].sort())
          )
          .first();

        if (!conversation) {
          const conversationId = await ctx.db.insert("conversations", {
            participantIds: [message.creatorId, recipient.recipientId].sort() as [
              Id<"users">,
              Id<"users">,
            ],
            lastMessageAt: Date.now(),
            createdAt: Date.now(),
          });
          conversation = await ctx.db.get(conversationId);
        }

        const messageId = await ctx.db.insert("messages", {
          conversationId: conversation!._id,
          senderId: message.creatorId,
          content: message.content,
          mediaIds: message.mediaIds,
          createdAt: Date.now(),
        });

        await ctx.db.patch(conversation!._id, {
          lastMessageId: messageId,
          lastMessageAt: Date.now(),
        });

        await ctx.db.patch(recipient._id, {
          status: "sent",
          conversationId: conversation!._id,
          messageId,
        });

        sentCount++;
      } catch (error) {
        await ctx.db.patch(recipient._id, { status: "failed" });
      }
    }

    await ctx.db.patch(args.massMessageId, {
      sentCount: (message.sentCount ?? 0) + sentCount,
    });

    await ctx.scheduler.runAfter(100, internal.massMessages.processSending, {
      massMessageId: args.massMessageId,
    });
  },
});

/** Start sending a scheduled mass message */
export const startScheduledSend = internalMutation({
  args: { massMessageId: v.id("massMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.massMessageId);

    if (!message) return { success: false, reason: "Message not found" };
    if (message.status !== "scheduled") {
      return { success: false, reason: "Message not in scheduled state" };
    }

    await ctx.db.patch(args.massMessageId, {
      status: "sending",
      scheduledFunctionId: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.massMessages.processSending, {
      massMessageId: args.massMessageId,
    });

    return { success: true };
  },
});

/** Fallback: Process missed scheduled messages */
export const processScheduled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const scheduledMessages = await ctx.db
      .query("massMessages")
      .withIndex("by_scheduled", (q) => q.eq("status", "scheduled").lt("scheduledFor", now))
      .take(10);

    for (const message of scheduledMessages) {
      await ctx.scheduler.runAfter(0, internal.massMessages.startScheduledSend, {
        massMessageId: message._id,
      });
    }

    return { processed: scheduledMessages.length };
  },
});

// ===== HELPERS =====

/** Get recipient IDs for an audience */
async function getAudienceRecipients(
  ctx: QueryCtx,
  creatorId: Id<"users">,
  args: {
    audience: string;
    tierId?: Id<"subscriptionTiers">;
    topTipperCount?: number;
  }
): Promise<Id<"users">[]> {
  const now = Date.now();
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  switch (args.audience) {
    case "all_subscribers": {
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
        .take(MAX_MASS_MESSAGE_RECIPIENTS);
      return subs.map((s: Doc<"subscriptions">) => s.fanId);
    }

    case "active_subscribers": {
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
        .take(MAX_MASS_MESSAGE_RECIPIENTS);
      return subs
        .filter((s: Doc<"subscriptions">) => s.status === "active")
        .map((s: Doc<"subscriptions">) => s.fanId);
    }

    case "expiring_subscribers": {
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
        .take(MAX_MASS_MESSAGE_RECIPIENTS);
      return subs
        .filter(
          (s: Doc<"subscriptions">) =>
            s.status === "active" &&
            s.currentPeriodEnd < sevenDaysFromNow &&
            s.currentPeriodEnd > now
        )
        .map((s: Doc<"subscriptions">) => s.fanId);
    }

    case "vips": {
      const vips = await ctx.db
        .query("vipMembers")
        .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
        .take(100);
      return vips.map((v: Doc<"vipMembers">) => v.memberId);
    }

    case "top_tippers": {
      const count = args.topTipperCount ?? 100;
      const transactions = await ctx.db
        .query("coinTransactions")
        .filter((q) =>
          q.and(q.eq(q.field("userId"), creatorId), q.eq(q.field("type"), "tip_received"))
        )
        .take(10000);

      const tipperTotals = new Map<string, number>();
      for (const tx of transactions) {
        if (tx.relatedUserId) {
          const current = tipperTotals.get(tx.relatedUserId) ?? 0;
          tipperTotals.set(tx.relatedUserId, current + tx.amount);
        }
      }

      const sorted = Array.from(tipperTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count);

      return sorted.map(([userId]) => userId as Id<"users">);
    }

    case "new_subscribers": {
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
        .take(MAX_MASS_MESSAGE_RECIPIENTS);
      return subs
        .filter((s: Doc<"subscriptions">) => s.status === "active" && s.createdAt > thirtyDaysAgo)
        .map((s: Doc<"subscriptions">) => s.fanId);
    }

    case "specific_tier": {
      if (!args.tierId) return [];
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
        .take(MAX_MASS_MESSAGE_RECIPIENTS);
      return subs
        .filter((s: Doc<"subscriptions">) => s.status === "active" && s.tierId === args.tierId)
        .map((s: Doc<"subscriptions">) => s.fanId);
    }

    default:
      return [];
  }
}
