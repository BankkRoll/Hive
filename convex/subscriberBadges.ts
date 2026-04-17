/**
 * @fileoverview Subscriber Badges Module
 *
 * Manages subscriber loyalty badges that track subscription tenure over time.
 * Badges evolve dynamically based on how long a user has been subscribed to a creator.
 *
 * Features:
 *   - Dynamic badge labels and colors based on subscription duration (unlimited months)
 *   - Founding member status for early/special subscribers
 *   - Custom badge appearance per subscriber (creator-controlled)
 *   - Automatic badge evolution via daily cron job
 *   - Milestone notifications for tenure achievements
 *   - Badge statistics and filtering for creators
 *
 * Security:
 *   - Badge queries allow optional unauthenticated access for public viewing
 *   - Founding member management restricted to creators only
 *   - Badge customization restricted to the owning creator
 *
 * Limits:
 *   - getMyBadges: 100 badges per user
 *   - getCreatorBadges: 10,000 badges scanned, default 50 returned
 *   - evolveBadges (cron): 500 badges per run
 *   - cleanupOrphanedBadges (cron): 1,000 badges per run
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const DAYS_PER_MONTH = 30;

// ===== QUERIES =====

/** Get a subscriber's badge for a specific creator */
export const getBadge = query({
  args: {
    creatorId: v.id("users"),
    fanId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const fanId = args.fanId ?? viewerId;

    if (!fanId) {
      return null;
    }

    const badge = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", fanId).eq("creatorId", args.creatorId))
      .first();

    if (!badge) {
      return null;
    }

    const tier = await ctx.db.get(badge.tierId);

    return {
      ...badge,
      label: getBadgeLabel(badge.months, badge.isFounding),
      color: getBadgeColorForMonths(badge.months, badge.isFounding),
      tier: tier
        ? {
            _id: tier._id,
            name: tier.name,
            ringColor: tier.ringColor,
            badgeImageId: tier.badgeImageId,
          }
        : null,
    };
  },
});

/** Get all badges for the current user across all creators */
export const getMyBadges = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const badges = await ctx.db
      .query("subscriberBadges")
      .filter((q) => q.eq(q.field("fanId"), userId))
      .take(100);

    const enriched = await Promise.all(
      badges.map(async (badge) => {
        const creator = await ctx.db.get(badge.creatorId);
        const tier = await ctx.db.get(badge.tierId);

        if (!creator) return null;

        return {
          ...badge,
          label: getBadgeLabel(badge.months, badge.isFounding),
          color: getBadgeColorForMonths(badge.months, badge.isFounding),
          creator: {
            _id: creator._id,
            username: creator.username,
            displayName: creator.displayName,
            avatarR2Key: creator.avatarR2Key,
          },
          tier: tier
            ? {
                _id: tier._id,
                name: tier.name,
                ringColor: tier.ringColor,
              }
            : null,
        };
      })
    );

    return enriched.filter((b) => b !== null);
  },
});

/** Get badges for a creator with optional filtering and statistics */
export const getCreatorBadges = query({
  args: {
    creatorId: v.optional(v.id("users")),
    minMonths: v.optional(v.number()),
    maxMonths: v.optional(v.number()),
    foundingOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = args.creatorId ?? (await getAuthUserId(ctx));
    if (!userId) {
      return { badges: [], stats: {} };
    }

    const limit = args.limit ?? 50;

    const allBadges = await ctx.db
      .query("subscriberBadges")
      .filter((q) => q.eq(q.field("creatorId"), userId))
      .take(10000);

    let filtered = allBadges;

    if (args.foundingOnly) {
      filtered = filtered.filter((b) => b.isFounding);
    }
    if (args.minMonths !== undefined) {
      filtered = filtered.filter((b) => b.months >= args.minMonths!);
    }
    if (args.maxMonths !== undefined) {
      filtered = filtered.filter((b) => b.months <= args.maxMonths!);
    }

    const stats = {
      total: allBadges.length,
      founding: allBadges.filter((b) => b.isFounding).length,
      new: allBadges.filter((b) => b.months === 0).length,
      oneToThree: allBadges.filter((b) => b.months >= 1 && b.months < 3).length,
      threeToSix: allBadges.filter((b) => b.months >= 3 && b.months < 6).length,
      sixToTwelve: allBadges.filter((b) => b.months >= 6 && b.months < 12).length,
      oneYear: allBadges.filter((b) => b.months >= 12 && b.months < 24).length,
      twoYearsPlus: allBadges.filter((b) => b.months >= 24).length,
      averageMonths:
        allBadges.length > 0
          ? Math.round(allBadges.reduce((sum, b) => sum + b.months, 0) / allBadges.length)
          : 0,
      longestTenure: allBadges.length > 0 ? Math.max(...allBadges.map((b) => b.months)) : 0,
    };

    const badges = filtered.slice(0, limit);

    const enriched = await Promise.all(
      badges.map(async (badge) => {
        const fan = await ctx.db.get(badge.fanId);
        const tier = await ctx.db.get(badge.tierId);

        if (!fan) return null;

        return {
          ...badge,
          label: getBadgeLabel(badge.months, badge.isFounding),
          color: getBadgeColorForMonths(badge.months, badge.isFounding),
          fan: {
            _id: fan._id,
            username: fan.username,
            displayName: fan.displayName,
            avatarR2Key: fan.avatarR2Key,
          },
          tier: tier
            ? {
                _id: tier._id,
                name: tier.name,
              }
            : null,
        };
      })
    );

    return {
      badges: enriched.filter((b) => b !== null),
      stats,
    };
  },
});

/** Get suggested badge milestones for UI display */
export const getMilestones = query({
  args: {},
  handler: async () => {
    return {
      milestones: [
        { months: 0, label: "New Subscriber", color: "#94A3B8" },
        { months: 1, label: "1 Month", color: "#F59E0B" },
        { months: 3, label: "3 Months", color: "#10B981" },
        { months: 6, label: "6 Months", color: "#3B82F6" },
        { months: 12, label: "1 Year", color: "#8B5CF6" },
        { months: 24, label: "2 Years", color: "#EC4899" },
        { months: 36, label: "3 Years", color: "#F43F5E" },
        { months: 48, label: "4 Years", color: "#EF4444" },
        { months: 60, label: "5 Years", color: "#DC2626" },
      ],
      founding: { label: "Founding Member", color: "#EAB308" },
      note: "Badges are dynamic and unlimited - subscribers can reach any month milestone!",
    };
  },
});

/** Get badge color for a given month count (frontend helper) */
export const getBadgeColor = query({
  args: { months: v.number(), isFounding: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    return getBadgeColorForMonths(args.months, args.isFounding);
  },
});

/** Get badge label for a given month count (frontend helper) */
export const getBadgeLabelQuery = query({
  args: { months: v.number(), isFounding: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    return getBadgeLabel(args.months, args.isFounding);
  },
});

// ===== MUTATIONS =====

/** Mark a subscriber as a founding member (creator only) */
export const markAsFounding = mutation({
  args: {
    fanId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Only creators can mark founding members");
    }

    const badge = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", args.fanId).eq("creatorId", userId))
      .first();

    if (!badge) {
      throw new Error("User is not a subscriber");
    }

    await ctx.db.patch(badge._id, {
      isFounding: true,
      lastUpgradedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.notifications.create, {
      userId: args.fanId,
      type: "system",
      actorId: userId,
      message: "You've been granted Founding Member status!",
    });

    return { success: true };
  },
});

/** Remove founding member status from a subscriber (creator only) */
export const removeFounding = mutation({
  args: {
    fanId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Only creators can manage founding members");
    }

    const badge = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", args.fanId).eq("creatorId", userId))
      .first();

    if (!badge) {
      throw new Error("User is not a subscriber");
    }

    await ctx.db.patch(badge._id, {
      isFounding: false,
      lastUpgradedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Customize badge appearance for a subscriber (creator only) */
export const customizeBadge = mutation({
  args: {
    fanId: v.id("users"),
    badgeImageId: v.optional(v.id("_storage")),
    badgeColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "creator") {
      throw new Error("Only creators can customize badges");
    }

    const badge = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", args.fanId).eq("creatorId", userId))
      .first();

    if (!badge) {
      throw new Error("User is not a subscriber");
    }

    await ctx.db.patch(badge._id, {
      customBadgeImageId: args.badgeImageId,
      customBadgeColor: args.badgeColor,
      lastUpgradedAt: Date.now(),
    });

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Create a badge for a new subscriber */
export const createBadge = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    fanId: v.id("users"),
    creatorId: v.id("users"),
    tierId: v.id("subscriptionTiers"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", args.fanId).eq("creatorId", args.creatorId))
      .first();

    if (existing) {
      if (existing.subscriptionId !== args.subscriptionId) {
        await ctx.db.patch(existing._id, {
          subscriptionId: args.subscriptionId,
          tierId: args.tierId,
        });
      }
      return existing._id;
    }

    const badgeId = await ctx.db.insert("subscriberBadges", {
      subscriptionId: args.subscriptionId,
      fanId: args.fanId,
      creatorId: args.creatorId,
      tierId: args.tierId,
      months: 0,
      isFounding: false,
      tenure: 0,
      firstSubscribedAt: Date.now(),
      lastUpgradedAt: Date.now(),
      createdAt: Date.now(),
    });

    return badgeId;
  },
});

/** Check and evolve badges based on tenure (daily cron) */
export const evolveBadges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const badges = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_upgrade_due", (q) => q.lt("lastUpgradedAt", oneDayAgo))
      .take(500);

    let upgraded = 0;

    for (const badge of badges) {
      const subscription = await ctx.db.get(badge.subscriptionId);
      if (!subscription || subscription.status !== "active") {
        continue;
      }

      const tenureDays = Math.floor((now - badge.firstSubscribedAt) / (24 * 60 * 60 * 1000));

      const newMonths = Math.floor(tenureDays / DAYS_PER_MONTH);

      if (newMonths !== badge.months) {
        const oldMonths = badge.months;

        await ctx.db.patch(badge._id, {
          months: newMonths,
          tenure: tenureDays,
          lastUpgradedAt: now,
        });

        if (shouldNotify(oldMonths, newMonths)) {
          await ctx.scheduler.runAfter(0, internal.notifications.create, {
            userId: badge.fanId,
            type: "system",
            actorId: badge.creatorId,
            message: `Your subscriber badge has been upgraded to ${getBadgeLabel(newMonths, badge.isFounding)}!`,
          });
        }

        upgraded++;
      } else {
        await ctx.db.patch(badge._id, {
          tenure: tenureDays,
          lastUpgradedAt: now,
        });
      }
    }

    return { checked: badges.length, upgraded };
  },
});

/** Handle subscription cancellation (preserves badge, stops evolution) */
export const handleSubscriptionCanceled = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args) => {
    const badge = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .first();

    if (!badge) {
      return { updated: false };
    }

    const now = Date.now();
    const tenureDays = Math.floor((now - badge.firstSubscribedAt) / (24 * 60 * 60 * 1000));
    const months = Math.floor(tenureDays / DAYS_PER_MONTH);

    await ctx.db.patch(badge._id, {
      months,
      tenure: tenureDays,
      lastUpgradedAt: now,
    });

    return { updated: true };
  },
});

/** Handle subscription reactivation (resumes badge evolution) */
export const handleSubscriptionReactivated = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    fanId: v.id("users"),
    creatorId: v.id("users"),
    tierId: v.id("subscriptionTiers"),
  },
  returns: v.id("subscriberBadges"),
  handler: async (ctx, args): Promise<Id<"subscriberBadges">> => {
    const existing = await ctx.db
      .query("subscriberBadges")
      .withIndex("by_fan_creator", (q) => q.eq("fanId", args.fanId).eq("creatorId", args.creatorId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        subscriptionId: args.subscriptionId,
        tierId: args.tierId,
        lastUpgradedAt: Date.now(),
      });
      return existing._id;
    }

    const badgeId = await ctx.runMutation(internal.subscriberBadges.createBadge, {
      subscriptionId: args.subscriptionId,
      fanId: args.fanId,
      creatorId: args.creatorId,
      tierId: args.tierId,
    });
    return badgeId;
  },
});

/** Clean up orphaned badges from deleted/old subscriptions (monthly cron) */
export const cleanupOrphanedBadges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const badges = await ctx.db.query("subscriberBadges").take(1000);

    let deleted = 0;

    for (const badge of badges) {
      const subscription = await ctx.db.get(badge.subscriptionId);

      if (!subscription) {
        await ctx.db.delete(badge._id);
        deleted++;
        continue;
      }

      if (subscription.status === "canceled") {
        const canceledTime = subscription.currentPeriodEnd;
        const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

        if (canceledTime < oneYearAgo) {
          await ctx.db.delete(badge._id);
          deleted++;
        }
      }
    }

    return { deleted };
  },
});

// ===== HELPER FUNCTIONS =====

/** Generate dynamic badge label based on months (no hardcoded limit) */
function getBadgeLabel(months: number, isFounding?: boolean): string {
  if (isFounding) {
    return "Founding Member";
  }

  if (months === 0) {
    return "New Subscriber";
  }

  if (months === 1) {
    return "1 Month";
  }

  if (months < 12) {
    return `${months} Months`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (remainingMonths === 0) {
    return years === 1 ? "1 Year" : `${years} Years`;
  }

  if (years === 1) {
    return `1 Year, ${remainingMonths} Month${remainingMonths > 1 ? "s" : ""}`;
  }

  return `${years} Years, ${remainingMonths} Month${remainingMonths > 1 ? "s" : ""}`;
}

/** Determine if user should be notified about this badge upgrade */
function shouldNotify(oldMonths: number, newMonths: number): boolean {
  if (oldMonths === 0 && newMonths >= 1) {
    return true;
  }

  if (newMonths <= 6 && newMonths > oldMonths) {
    return true;
  }

  if (newMonths > 6) {
    const oldQuarter = Math.floor(oldMonths / 3);
    const newQuarter = Math.floor(newMonths / 3);
    if (newQuarter > oldQuarter) {
      return true;
    }
  }

  const oldYears = Math.floor(oldMonths / 12);
  const newYears = Math.floor(newMonths / 12);
  if (newYears > oldYears) {
    return true;
  }

  return false;
}

/** Get badge color based on months (no hardcoded limit) */
function getBadgeColorForMonths(months: number, isFounding?: boolean): string {
  if (isFounding) {
    return "#EAB308";
  }

  if (months === 0) return "#94A3B8";
  if (months < 3) return "#F59E0B";
  if (months < 6) return "#10B981";
  if (months < 12) return "#3B82F6";
  if (months < 24) return "#8B5CF6";
  if (months < 36) return "#EC4899";
  if (months < 48) return "#F43F5E";
  if (months < 60) return "#EF4444";
  if (months < 72) return "#DC2626";
  if (months < 84) return "#B91C1C";
  if (months < 96) return "#991B1B";
  if (months < 120) return "#7F1D1D";

  return "#1E3A5F";
}
