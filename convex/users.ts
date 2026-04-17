/**
 * @fileoverview Users Module
 *
 * User profile management, authentication, and account lifecycle.
 *
 * Features:
 *   - User profile CRUD (displayName, bio, username, avatars)
 *   - Username validation (3-20 chars, alphanumeric + underscore)
 *   - DiceBear avatar customization
 *   - User search by username/displayName
 *   - Public profile queries with privacy settings
 *   - Onboarding flow with referral support
 *   - GDPR-compliant account deletion (batched)
 *
 * Security:
 *   - Public queries return sanitized PublicUser type (excludes email, etc.)
 *   - Search queries sanitized against XSS characters
 *   - Rate limiting on search and account deletion
 *   - Username confirmation required for account deletion
 *
 * Limits:
 *   - Username: 3-20 characters
 *   - Display name: 50 characters max
 *   - Bio: 500 characters max
 *   - Search results: 30 max per query
 *   - Deletion batch size: 50 documents per phase
 */

import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";

import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ===== CONSTANTS =====

const DEFAULT_PRIVACY_SETTINGS = {
  showOnlineStatus: true,
  showLastActive: true,
  allowSearchEngineIndexing: false,
};

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const DISPLAY_NAME_MAX_LENGTH = 50;
const BIO_MAX_LENGTH = 500;

// ===== TYPES =====

type PublicUser = {
  _id: Id<"users">;
  _creationTime: number;
  name?: string;
  image?: string;
  username?: string;
  displayName?: string;
  bio?: string;
  avatarR2Key?: string;
  bannerR2Key?: string;
  dicebearSeed?: string;
  dicebearBgColor?: string;
  dicebearEyes?: string;
  dicebearMouth?: string;
  role?: "user" | "creator" | "platform_mod" | "admin" | "super_admin";
  isVerified?: boolean;
  verifiedAt?: number;
  status?: "active" | "suspended" | "banned" | "pending_review";
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  subscribersCount?: number;
  onboardedAt?: number;
};

// ===== HELPERS =====

/** Filters sensitive fields from user documents for public consumption. */
function toPublicUser(user: Doc<"users">): PublicUser {
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    name: user.name,
    image: user.image,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarR2Key: user.avatarR2Key,
    bannerR2Key: user.bannerR2Key,
    dicebearSeed: user.dicebearSeed,
    dicebearBgColor: user.dicebearBgColor,
    dicebearEyes: user.dicebearEyes,
    dicebearMouth: user.dicebearMouth,
    role: user.role,
    isVerified: user.isVerified,
    verifiedAt: user.verifiedAt,
    status: user.status,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    postsCount: user.postsCount,
    subscribersCount: user.subscribersCount,
    onboardedAt: user.onboardedAt,
  };
}

/** Sanitizes search query by removing XSS-prone and unsafe characters. */
function sanitizeUserSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[<>'"`;\\]/g, "")
    .replace(/[^\w\s@#\-_.]/g, "")
    .slice(0, 50);
}

// ===== INTERNAL QUERIES =====

/** Retrieves user by ID for internal/action use. */
export const getByIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/** Retrieves user by username for HTTP endpoints. */
export const getByUsernameInternal = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.username.toLowerCase().trim();
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
  },
});

/** Internal search query for action use. */
export const searchInternal = internalQuery({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PublicUser[]> => {
    const searchQuery = sanitizeUserSearchQuery(args.query);
    const limit = Math.min(args.limit ?? 10, 30);

    if (searchQuery.length < 2) {
      return [];
    }

    const byUsername = await ctx.db
      .query("users")
      .withSearchIndex("search_username", (q) =>
        q.search("username", searchQuery).eq("status", "active")
      )
      .take(limit);

    if (byUsername.length >= limit) {
      return byUsername.map(toPublicUser);
    }

    const byDisplayName = await ctx.db
      .query("users")
      .withSearchIndex("search_displayName", (q) =>
        q.search("displayName", searchQuery).eq("status", "active")
      )
      .take(limit);

    const seen = new Set(byUsername.map((u) => u._id));
    const combined = [...byUsername];

    for (const user of byDisplayName) {
      if (!seen.has(user._id)) {
        combined.push(user);
        if (combined.length >= limit) break;
      }
    }

    return combined.map(toPublicUser);
  },
});

// ===== QUERIES =====

/** Returns the current authenticated user's full document. */
export const currentUser = query({
  args: {},
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

/** Retrieves a user by ID (returns public fields only). */
export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<PublicUser | null> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return toPublicUser(user);
  },
});

/** Retrieves a user by username (returns public fields only). */
export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args): Promise<PublicUser | null> => {
    const normalized = args.username.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (!user) return null;
    return toPublicUser(user);
  },
});

/** Checks if an email exists in the system (for auth flow). */
export const checkEmailExists = query({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const normalized = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .first();
    return existing !== null;
  },
});

/** Validates whether a username is available. */
export const isUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const normalized = args.username.toLowerCase().trim();

    if (!USERNAME_REGEX.test(normalized)) {
      return false;
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();

    return existing === null;
  },
});

/** Searches users by username or display name (returns public fields only). */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PublicUser[]> => {
    const searchQuery = sanitizeUserSearchQuery(args.query);
    const limit = Math.min(args.limit ?? 10, 30);

    if (searchQuery.length < 2) {
      return [];
    }

    const byUsername = await ctx.db
      .query("users")
      .withSearchIndex("search_username", (q) =>
        q.search("username", searchQuery).eq("status", "active")
      )
      .take(limit);

    if (byUsername.length >= limit) {
      return byUsername.map(toPublicUser);
    }

    const byDisplayName = await ctx.db
      .query("users")
      .withSearchIndex("search_displayName", (q) =>
        q.search("displayName", searchQuery).eq("status", "active")
      )
      .take(limit);

    const seen = new Set(byUsername.map((u) => u._id));
    const combined = [...byUsername];

    for (const user of byDisplayName) {
      if (!seen.has(user._id)) {
        combined.push(user);
        if (combined.length >= limit) break;
      }
    }

    return combined.map(toPublicUser);
  },
});

/** Returns public profile with follow/subscribe status and privacy settings. */
export const getPublicProfile = query({
  args: { username: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{
    user: PublicUser & { lastActiveAt?: number };
    isFollowing: boolean;
    isSubscribed: boolean;
    privacySettings: {
      showOnlineStatus: boolean;
      showLastActive: boolean;
      allowSearchEngineIndexing: boolean;
    };
  } | null> => {
    const normalized = args.username.toLowerCase().trim();

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();

    if (!user || user.status !== "active") {
      return null;
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const privacySettings = {
      showOnlineStatus: settings?.showOnlineStatus ?? DEFAULT_PRIVACY_SETTINGS.showOnlineStatus,
      showLastActive: settings?.showLastActive ?? DEFAULT_PRIVACY_SETTINGS.showLastActive,
      allowSearchEngineIndexing:
        settings?.allowSearchEngineIndexing ?? DEFAULT_PRIVACY_SETTINGS.allowSearchEngineIndexing,
    };

    const currentUserId = await getAuthUserId(ctx);

    let isFollowing = false;
    let isSubscribed = false;

    if (currentUserId && currentUserId !== user._id) {
      const follow = await ctx.db
        .query("follows")
        .withIndex("by_pair", (q) => q.eq("followerId", currentUserId).eq("followingId", user._id))
        .unique();
      isFollowing = follow !== null;

      const subscription = await ctx.db
        .query("subscriptions")
        .withIndex("by_fan_creator", (q) => q.eq("fanId", currentUserId).eq("creatorId", user._id))
        .first();
      isSubscribed = subscription?.status === "active";
    }

    const publicUser = toPublicUser(user);
    const userWithPresence = privacySettings.showLastActive
      ? { ...publicUser, lastActiveAt: user.lastActiveAt }
      : publicUser;

    return {
      user: userWithPresence,
      isFollowing,
      isSubscribed,
      privacySettings,
    };
  },
});

/** Returns suggested creators to follow for discovery. */
export const getSuggestions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<PublicUser[]> => {
    const currentUserId = await getAuthUserId(ctx);
    const limit = args.limit ?? 5;

    const creators = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "creator"))
      .take(limit * 3);

    const filtered = creators
      .filter((u) => u._id !== currentUserId && u.status === "active")
      .sort((a, b) => (b.followersCount ?? 0) - (a.followersCount ?? 0))
      .slice(0, limit);

    return filtered.map(toPublicUser);
  },
});

// ===== MUTATIONS =====

/** Updates the current user's profile fields. */
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    username: v.optional(v.string()),
    dicebearSeed: v.optional(v.string()),
    dicebearBgColor: v.optional(v.string()),
    dicebearEyes: v.optional(v.string()),
    dicebearMouth: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"users">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const updates: Partial<Doc<"users">> = {
      updatedAt: Date.now(),
    };

    if (args.displayName !== undefined) {
      const displayName = args.displayName.trim();
      if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
        throw new Error(`Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`);
      }
      updates.displayName = displayName || undefined;
    }

    if (args.bio !== undefined) {
      const bio = args.bio.trim();
      if (bio.length > BIO_MAX_LENGTH) {
        throw new Error(`Bio must be at most ${BIO_MAX_LENGTH} characters`);
      }
      updates.bio = bio || undefined;
    }

    if (args.username !== undefined) {
      const username = args.username.toLowerCase().trim();

      if (!USERNAME_REGEX.test(username)) {
        throw new Error("Username must be 3-20 characters, letters, numbers, and underscores only");
      }

      const existing = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username))
        .unique();

      if (existing && existing._id !== userId) {
        throw new Error("Username already taken");
      }

      updates.username = username;
    }

    if (args.dicebearSeed !== undefined) {
      updates.dicebearSeed = args.dicebearSeed;
    }
    if (args.dicebearBgColor !== undefined) {
      updates.dicebearBgColor = args.dicebearBgColor;
    }
    if (args.dicebearEyes !== undefined) {
      updates.dicebearEyes = args.dicebearEyes;
    }
    if (args.dicebearMouth !== undefined) {
      updates.dicebearMouth = args.dicebearMouth;
    }

    await ctx.db.patch(userId, updates);

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  },
});

/** Completes user onboarding with username, display name, and optional referral. */
export const completeOnboarding = mutation({
  args: {
    username: v.string(),
    displayName: v.optional(v.string()),
    referrerUsername: v.optional(v.string()),
    dicebearSeed: v.optional(v.string()),
    dicebearBgColor: v.optional(v.string()),
    dicebearEyes: v.optional(v.string()),
    dicebearMouth: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"users">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.onboardedAt) {
      return user;
    }

    const username = args.username.toLowerCase().trim();

    if (!USERNAME_REGEX.test(username)) {
      throw new Error("Username must be 3-20 characters, letters, numbers, and underscores only");
    }

    const existingUsername = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (existingUsername && existingUsername._id !== userId) {
      throw new Error("Username already taken");
    }

    const displayName = args.displayName?.trim() || username;
    if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new Error(`Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`);
    }

    const now = Date.now();
    const referralCode = username.toUpperCase();

    await ctx.db.patch(userId, {
      username,
      displayName,
      referralCode,
      onboardedAt: now,
      lastActiveAt: now,
      updatedAt: now,
      dicebearSeed: args.dicebearSeed,
      dicebearBgColor: args.dicebearBgColor,
      dicebearEyes: args.dicebearEyes,
      dicebearMouth: args.dicebearMouth,
      role: user.role ?? "user",
      status: user.status ?? "active",
      coinsBalance: user.coinsBalance ?? 0,
      followersCount: user.followersCount ?? 0,
      followingCount: user.followingCount ?? 0,
      postsCount: user.postsCount ?? 0,
      subscribersCount: user.subscribersCount ?? 0,
      referralCount: user.referralCount ?? 0,
      referralEarnings: user.referralEarnings ?? 0,
    });

    const existingSettings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!existingSettings) {
      await ctx.db.insert("userSettings", {
        userId,
        emailNotifications: true,
        pushNotifications: true,
        notifyOnNewFollower: true,
        notifyOnNewSubscriber: true,
        notifyOnTip: true,
        notifyOnComment: true,
        notifyOnLike: true,
        notifyOnDM: true,
        notifyOnMention: true,
        showOnlineStatus: true,
        showLastActive: true,
        allowSearchEngineIndexing: false,
        contentWarnings: true,
        autoplayVideos: true,
        showLiveStatus: true,
        notifyFollowersOnLive: true,
        updatedAt: now,
      });
    }

    if (args.referrerUsername) {
      const referrerUsername = args.referrerUsername.toLowerCase().trim();

      const referrer = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", referrerUsername))
        .first();

      if (referrer && referrer._id !== userId && referrer.status === "active") {
        await ctx.db.patch(userId, {
          referredBy: referrer._id,
        });

        await ctx.db.insert("referrals", {
          referrerId: referrer._id,
          referredId: userId,
          status: "pending",
          createdAt: now,
        });

        await ctx.db.patch(referrer._id, {
          referralCount: (referrer.referralCount ?? 0) + 1,
        });
      }
    }

    const updatedUser = await ctx.db.get(userId);
    if (!updatedUser) {
      throw new Error("User not found after update");
    }
    return updatedUser;
  },
});

/** Updates user's avatar R2 storage key. */
export const updateAvatar = mutation({
  args: { r2Key: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(userId, {
      avatarR2Key: args.r2Key,
      updatedAt: Date.now(),
    });
  },
});

/** Updates user's banner R2 storage key. */
export const updateBanner = mutation({
  args: { r2Key: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(userId, {
      bannerR2Key: args.r2Key,
      updatedAt: Date.now(),
    });
  },
});

/** Initiates account deletion with username confirmation. */
export const deleteAccount = mutation({
  args: {
    confirmUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
      userId,
      action: "account_delete",
    });
    if (!rateCheck.allowed) {
      throw new Error(`Too many deletion attempts. Try again later.`);
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (args.confirmUsername.toLowerCase() !== user.username?.toLowerCase()) {
      throw new Error("Username confirmation does not match");
    }

    await ctx.scheduler.runAfter(0, internal.users.processAccountDeletion, {
      userId,
    });

    return {
      success: true,
      message: "Account deletion initiated. Your data will be removed shortly.",
    };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Updates user stat counters (followers, following, posts, subscribers). */
export const updateStats = internalMutation({
  args: {
    userId: v.id("users"),
    field: v.union(
      v.literal("followersCount"),
      v.literal("followingCount"),
      v.literal("postsCount"),
      v.literal("subscribersCount")
    ),
    delta: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return;

    const currentValue = user[args.field] ?? 0;
    const newValue = Math.max(0, currentValue + args.delta);

    await ctx.db.patch(args.userId, {
      [args.field]: newValue,
      updatedAt: Date.now(),
    });
  },
});

/** Initiates batched account deletion process. */
export const processAccountDeletion = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { success: false, reason: "user_not_found" };
    }

    await ctx.db.patch(args.userId, {
      status: "banned",
      suspendReason: "Account deletion in progress",
    });

    await ctx.scheduler.runAfter(0, internal.users.deletionBatch, {
      userId: args.userId,
      phase: "posts",
      metadata: {
        username: user.username,
        email: user.email,
        avatarR2Key: user.avatarR2Key,
        bannerR2Key: user.bannerR2Key,
      },
    });

    return { success: true, message: "Deletion process started" };
  },
});

// ===== ACCOUNT DELETION BATCHES =====

const BATCH_SIZE = 50;

/** Processes account deletion in batches by data category. Self-schedules until complete. */
export const deletionBatch = internalMutation({
  args: {
    userId: v.id("users"),
    phase: v.string(),
    metadata: v.optional(
      v.object({
        username: v.optional(v.string()),
        email: v.optional(v.string()),
        avatarR2Key: v.optional(v.string()),
        bannerR2Key: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { userId, phase, metadata } = args;
    let deleted = 0;
    let hasMore = false;
    let nextPhase = phase;

    switch (phase) {
      case "posts": {
        const posts = await ctx.db
          .query("posts")
          .withIndex("by_author", (q) => q.eq("authorId", userId))
          .take(BATCH_SIZE);

        for (const post of posts) {
          await ctx.db.delete(post._id);
          deleted++;
        }

        hasMore = posts.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "post_comments";
        break;
      }

      case "post_comments": {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_author", (q) => q.eq("authorId", userId))
          .take(BATCH_SIZE);

        for (const comment of comments) {
          await ctx.db.delete(comment._id);
          deleted++;
        }

        hasMore = comments.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "follows_out";
        break;
      }

      case "follows_out": {
        const follows = await ctx.db
          .query("follows")
          .withIndex("by_follower", (q) => q.eq("followerId", userId))
          .take(BATCH_SIZE);

        for (const follow of follows) {
          await ctx.db.delete(follow._id);
          await ctx.scheduler.runAfter(0, internal.users.updateStats, {
            userId: follow.followingId,
            field: "followersCount",
            delta: -1,
          });
          deleted++;
        }

        hasMore = follows.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "follows_in";
        break;
      }

      case "follows_in": {
        const follows = await ctx.db
          .query("follows")
          .withIndex("by_following", (q) => q.eq("followingId", userId))
          .take(BATCH_SIZE);

        for (const follow of follows) {
          await ctx.db.delete(follow._id);
          await ctx.scheduler.runAfter(0, internal.users.updateStats, {
            userId: follow.followerId,
            field: "followingCount",
            delta: -1,
          });
          deleted++;
        }

        hasMore = follows.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "likes";
        break;
      }

      case "likes": {
        const likes = await ctx.db
          .query("likes")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);

        for (const like of likes) {
          await ctx.db.delete(like._id);
          deleted++;
        }

        hasMore = likes.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "bookmarks";
        break;
      }

      case "bookmarks": {
        const bookmarks = await ctx.db
          .query("bookmarks")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);

        for (const bookmark of bookmarks) {
          await ctx.db.delete(bookmark._id);
          deleted++;
        }

        hasMore = bookmarks.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "notifications";
        break;
      }

      case "notifications": {
        const notifications = await ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);

        for (const notif of notifications) {
          await ctx.db.delete(notif._id);
          deleted++;
        }

        hasMore = notifications.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "messages";
        break;
      }

      case "messages": {
        const allConvs = await ctx.db
          .query("conversations")
          .withIndex("by_lastMessageAt")
          .take(100);

        const userConvs = allConvs
          .filter((c) => c.participantIds.includes(userId))
          .slice(0, BATCH_SIZE);

        for (const conv of userConvs) {
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
            .take(100);

          for (const msg of messages) {
            await ctx.db.delete(msg._id);
          }
          await ctx.db.delete(conv._id);
          deleted++;
        }

        hasMore = userConvs.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "subscriptions_fan";
        break;
      }

      case "subscriptions_fan": {
        const subs = await ctx.db
          .query("subscriptions")
          .withIndex("by_fan", (q) => q.eq("fanId", userId))
          .take(BATCH_SIZE);

        for (const sub of subs) {
          if (sub.status === "active") {
            await ctx.scheduler.runAfter(0, internal.subscriptions.updateTierCount, {
              tierId: sub.tierId,
              delta: -1,
            });
            await ctx.scheduler.runAfter(0, internal.users.updateStats, {
              userId: sub.creatorId,
              field: "subscribersCount",
              delta: -1,
            });
          }
          await ctx.db.delete(sub._id);
          deleted++;
        }

        hasMore = subs.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "subscriptions_creator";
        break;
      }

      case "subscriptions_creator": {
        const subs = await ctx.db
          .query("subscriptions")
          .withIndex("by_creator", (q) => q.eq("creatorId", userId))
          .take(BATCH_SIZE);

        for (const sub of subs) {
          await ctx.db.delete(sub._id);
          deleted++;
        }

        hasMore = subs.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "tiers";
        break;
      }

      case "tiers": {
        const tiers = await ctx.db
          .query("subscriptionTiers")
          .withIndex("by_creator", (q) => q.eq("creatorId", userId))
          .take(BATCH_SIZE);

        for (const tier of tiers) {
          await ctx.db.delete(tier._id);
          deleted++;
        }

        hasMore = tiers.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "media";
        break;
      }

      case "media": {
        const media = await ctx.db
          .query("media")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);

        for (const m of media) {
          if (m.r2Key) {
            await ctx.scheduler.runAfter(0, internal.mediaActions.deleteFromR2, {
              r2Key: m.r2Key,
            });
          }
          if (m.storageId) {
            await ctx.storage.delete(m.storageId);
          }
          if (m.thumbnailStorageId) {
            await ctx.storage.delete(m.thumbnailStorageId);
          }
          await ctx.db.delete(m._id);
          deleted++;
        }

        hasMore = media.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "transactions";
        break;
      }

      case "transactions": {
        const txs = await ctx.db
          .query("coinTransactions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);

        for (const tx of txs) {
          await ctx.db.delete(tx._id);
          deleted++;
        }

        hasMore = txs.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "blocks";
        break;
      }

      case "blocks": {
        const blocks1 = await ctx.db
          .query("blocks")
          .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
          .take(BATCH_SIZE);

        for (const block of blocks1) {
          await ctx.db.delete(block._id);
          deleted++;
        }

        if (blocks1.length < BATCH_SIZE) {
          const blocks2 = await ctx.db
            .query("blocks")
            .withIndex("by_blocked", (q) => q.eq("blockedId", userId))
            .take(BATCH_SIZE);

          for (const block of blocks2) {
            await ctx.db.delete(block._id);
            deleted++;
          }

          hasMore = blocks2.length === BATCH_SIZE;
        } else {
          hasMore = true;
        }

        if (!hasMore) nextPhase = "stories";
        break;
      }

      case "stories": {
        const stories = await ctx.db
          .query("stories")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(BATCH_SIZE);

        for (const story of stories) {
          const views = await ctx.db
            .query("storyViews")
            .withIndex("by_story", (q) => q.eq("storyId", story._id))
            .take(100);
          for (const view of views) {
            await ctx.db.delete(view._id);
          }
          await ctx.db.delete(story._id);
          deleted++;
        }

        hasMore = stories.length === BATCH_SIZE;
        if (!hasMore) nextPhase = "misc";
        break;
      }

      case "misc": {
        const unlocks = await ctx.db
          .query("postUnlocks")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(50);
        for (const u of unlocks) await ctx.db.delete(u._id);

        const reports = await ctx.db
          .query("reports")
          .withIndex("by_reporter", (q) => q.eq("reporterId", userId))
          .take(50);
        for (const r of reports) await ctx.db.delete(r._id);

        const pollVotes = await ctx.db
          .query("pollVotes")
          .withIndex("by_voter", (q) => q.eq("voterId", userId))
          .take(50);
        for (const pv of pollVotes) await ctx.db.delete(pv._id);

        const vipMems = await ctx.db
          .query("vipMembers")
          .withIndex("by_member", (q) => q.eq("memberId", userId))
          .take(50);
        for (const v of vipMems) await ctx.db.delete(v._id);

        const modAssigns = await ctx.db
          .query("creatorModerators")
          .withIndex("by_moderator", (q) => q.eq("moderatorId", userId))
          .take(50);
        for (const m of modAssigns) await ctx.db.delete(m._id);

        const emotes = await ctx.db
          .query("emotes")
          .withIndex("by_creator", (q) => q.eq("creatorId", userId))
          .take(50);
        for (const e of emotes) {
          if (e.imageId) await ctx.storage.delete(e.imageId);
          await ctx.db.delete(e._id);
        }

        const promos = await ctx.db
          .query("promoCodes")
          .withIndex("by_creator", (q) => q.eq("creatorId", userId))
          .take(50);
        for (const p of promos) await ctx.db.delete(p._id);

        const payouts = await ctx.db
          .query("payouts")
          .withIndex("by_creator", (q) => q.eq("creatorId", userId))
          .take(50);
        for (const p of payouts) await ctx.db.delete(p._id);

        const settings = await ctx.db
          .query("userSettings")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
        if (settings) await ctx.db.delete(settings._id);

        const drafts = await ctx.db
          .query("postDrafts")
          .withIndex("by_author", (q) => q.eq("authorId", userId))
          .take(50);
        for (const d of drafts) await ctx.db.delete(d._id);

        const scheduled = await ctx.db
          .query("scheduledPosts")
          .withIndex("by_author", (q) => q.eq("authorId", userId))
          .take(50);
        for (const s of scheduled) await ctx.db.delete(s._id);

        const logins = await ctx.db
          .query("loginHistory")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(50);
        for (const l of logins) await ctx.db.delete(l._id);

        nextPhase = "finalize";
        break;
      }

      case "finalize": {
        if (metadata?.avatarR2Key) {
          await ctx.scheduler.runAfter(0, internal.mediaActions.deleteFromR2, {
            r2Key: metadata.avatarR2Key,
          });
        }
        if (metadata?.bannerR2Key) {
          await ctx.scheduler.runAfter(0, internal.mediaActions.deleteFromR2, {
            r2Key: metadata.bannerR2Key,
          });
        }

        await ctx.db.delete(userId);

        await ctx.db.insert("adminActions", {
          adminId: userId,
          targetUserId: userId,
          action: "user_banned",
          reason: "Account self-deletion (GDPR)",
          metadata: JSON.stringify({
            username: metadata?.username,
            email: metadata?.email,
            deletedAt: Date.now(),
          }),
          createdAt: Date.now(),
        });

        return { completed: true, phase: "finalize" };
      }
    }

    if (hasMore || nextPhase !== phase) {
      await ctx.scheduler.runAfter(0, internal.users.deletionBatch, {
        userId,
        phase: nextPhase,
        metadata,
      });
    }

    return { phase, deleted, hasMore, nextPhase };
  },
});

// ===== ACTIONS =====

/** Rate-limited search action for authenticated users. */
export const searchSecure = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PublicUser[]> => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      const user = await ctx.runQuery(internal.stripeHelpers.getUserByTokenIdentifier, {
        tokenIdentifier: identity.tokenIdentifier,
      });

      if (user) {
        const rateCheck = await ctx.runMutation(internal.admin.checkRateLimitInternal, {
          userId: user._id,
          action: "search",
        });

        if (!rateCheck.allowed) {
          throw new Error(
            `Search rate limited. Try again in ${Math.ceil(rateCheck.retryAfter! / 1000)} seconds`
          );
        }
      }
    }

    const results: PublicUser[] = await ctx.runQuery(internal.users.searchInternal, {
      query: args.query,
      limit: args.limit,
    });

    return results;
  },
});
