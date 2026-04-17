/**
 * @fileoverview Database Schema
 *
 * Complete Convex database schema for the platform.
 *
 * Table Categories:
 *   - Users & Profiles (users, userPresence, follows)
 *   - Content (posts, postDigests, feedItems, media, comments)
 *   - Engagement (likes, bookmarks, shares, polls)
 *   - Messaging (conversations, messages, voiceNotes)
 *   - Subscriptions (subscriptionTiers, subscriptions, giftSubscriptions)
 *   - Monetization (coinTransactions, postUnlocks, payouts, tips)
 *   - Social (blocks, mutes, reports, hiddenPosts)
 *   - Creator Tools (emotes, promoCodes, massMessages, vipMembers, moderators)
 *   - Stories (stories, storyViews)
 *   - Referrals (referrals)
 *   - Security (loginHistory, rateLimits, twoFactorAuth)
 *   - Admin (adminActions, platformStats)
 *   - Streaming (livestreams, streamingWebhookEvents)
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// ===== VALIDATORS =====

const userRoleValidator = v.union(
  v.literal("user"),
  v.literal("creator"),
  v.literal("platform_mod"),
  v.literal("admin"),
  v.literal("super_admin")
);

const userStatusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("banned"),
  v.literal("pending_review")
);

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
  v.literal("system"), // System notifications (payouts, etc.)
  v.literal("payout_completed"),
  v.literal("payout_failed")
);

const coinTransactionTypeValidator = v.union(
  v.literal("purchase"),
  v.literal("tip_sent"),
  v.literal("tip_received"),
  v.literal("unlock"),
  v.literal("payout"),
  v.literal("referral_bonus"),
  v.literal("promo_bonus")
);

export default defineSchema({
  ...authTables,

  // ===== USERS & PROFILES =====

  users: defineTable({
    // Required auth fields from authTables
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // Profile fields
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    // R2-based avatar and banner
    avatarR2Key: v.optional(v.string()),
    bannerR2Key: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    location: v.optional(v.string()),

    // DiceBear avatar (used when no custom avatar is uploaded)
    dicebearSeed: v.optional(v.string()),
    dicebearBgColor: v.optional(v.string()),
    dicebearEyes: v.optional(v.string()),
    dicebearMouth: v.optional(v.string()),

    // RBAC
    role: v.optional(userRoleValidator),
    isVerified: v.optional(v.boolean()),
    verifiedAt: v.optional(v.number()),

    // Account status
    status: v.optional(userStatusValidator),
    suspendedUntil: v.optional(v.number()),
    suspendReason: v.optional(v.string()),
    // Scheduled function ID for auto-unsuspend
    unsuspendFunctionId: v.optional(v.id("_scheduled_functions")),

    // Stripe integration
    stripeCustomerId: v.optional(v.string()),
    stripeConnectId: v.optional(v.string()),
    stripeConnectOnboarded: v.optional(v.boolean()),

    // Coins balance (stored in cents for precision)
    coinsBalance: v.optional(v.number()),

    // Referral system
    referralCode: v.optional(v.string()),
    referredBy: v.optional(v.id("users")),
    referralCount: v.optional(v.number()),
    referralEarnings: v.optional(v.number()),

    // Creator settings
    dmPricing: v.optional(v.number()), // Price for non-subscribers to DM (0 = free)
    welcomeMessage: v.optional(v.string()), // Auto-sent to new subscribers
    isAcceptingDMs: v.optional(v.boolean()),

    // Denormalized stats
    followersCount: v.optional(v.number()),
    followingCount: v.optional(v.number()),
    postsCount: v.optional(v.number()),
    subscribersCount: v.optional(v.number()),
    totalEarnings: v.optional(v.number()),

    // Timestamps
    onboardedAt: v.optional(v.number()),
    lastActiveAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    passwordChangedAt: v.optional(v.number()), // For session invalidation on password change

    // Streaming integration
    twitchUserId: v.optional(v.string()),
    twitchUsername: v.optional(v.string()),
    kickUserId: v.optional(v.string()),
    kickUsername: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_username", ["username"])
    .index("by_role", ["role"])
    .index("by_status", ["status"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_stripeConnectId", ["stripeConnectId"])
    .index("by_referralCode", ["referralCode"])
    .index("by_referredBy", ["referredBy"])
    .searchIndex("search_username", {
      searchField: "username",
      filterFields: ["role", "status"],
    })
    .searchIndex("search_displayName", {
      searchField: "displayName",
      filterFields: ["role", "status"],
    }),

  // User Presence (separated from users table to avoid OCC conflicts)
  // This table stores high-churn fields that would otherwise invalidate user subscriptions
  userPresence: defineTable({
    userId: v.id("users"),
    lastActiveAt: v.number(),
    isOnline: v.optional(v.boolean()),
    lastHeartbeatAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_online", ["isOnline", "lastActiveAt"]),

  // Follow relationships
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower", ["followerId", "createdAt"])
    .index("by_following", ["followingId", "createdAt"])
    .index("by_pair", ["followerId", "followingId"]),

  // Posts
  posts: defineTable({
    authorId: v.id("users"),
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),
    visibility: v.union(
      v.literal("public"),
      v.literal("followers"),
      v.literal("subscribers"),
      v.literal("vip")
    ),
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
    likesCount: v.optional(v.number()),
    commentsCount: v.optional(v.number()),
    viewsCount: v.optional(v.number()),
    tipsTotal: v.optional(v.number()),
    isPinned: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_author", ["authorId", "createdAt"])
    .index("by_author_pinned", ["authorId", "isPinned"]) // For efficient pinned post queries
    .index("by_createdAt", ["createdAt"])
    .index("by_visibility", ["visibility", "createdAt"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["authorId", "visibility"],
    }),

  // Post Digests - Lightweight view of posts for feed queries
  // Contains denormalized author data to avoid N+1 joins on hot paths
  postDigests: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    // Denormalized author fields (updated via trigger when user profile changes)
    authorUsername: v.optional(v.string()),
    authorDisplayName: v.optional(v.string()),
    authorAvatarR2Key: v.optional(v.string()),
    authorIsVerified: v.optional(v.boolean()),
    authorRole: v.optional(v.string()),
    // Post summary fields
    contentPreview: v.string(), // First 200 chars
    visibility: v.union(
      v.literal("public"),
      v.literal("followers"),
      v.literal("subscribers"),
      v.literal("vip")
    ),
    isLocked: v.optional(v.boolean()),
    hasMedia: v.optional(v.boolean()),
    mediaCount: v.optional(v.number()),
    // Engagement counts (synced from posts table)
    likesCount: v.optional(v.number()),
    commentsCount: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_visibility", ["visibility", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  // Materialized Feed Items (Fan-out-on-write architecture)
  // When a user posts, entries are created for all their followers
  // This makes "following" feed queries O(1) instead of O(N) where N = followed users
  feedItems: defineTable({
    // Who this feed item belongs to (the follower)
    userId: v.id("users"),
    // The post being shown
    postId: v.id("posts"),
    // Post author (for filtering, unfollows)
    authorId: v.id("users"),
    // Denormalized author data for display without joins
    authorUsername: v.optional(v.string()),
    authorDisplayName: v.optional(v.string()),
    authorAvatarR2Key: v.optional(v.string()),
    authorIsVerified: v.optional(v.boolean()),
    // Post preview data
    contentPreview: v.string(),
    visibility: v.union(
      v.literal("public"),
      v.literal("followers"),
      v.literal("subscribers"),
      v.literal("vip")
    ),
    isLocked: v.optional(v.boolean()),
    hasMedia: v.optional(v.boolean()),
    // Engagement counts (synced periodically or on update)
    likesCount: v.optional(v.number()),
    commentsCount: v.optional(v.number()),
    // Feed type for filtering
    feedType: v.union(
      v.literal("following"), // From followed users
      v.literal("subscription") // From subscribed creators
    ),
    // Post creation time (for sorting)
    postCreatedAt: v.number(),
    // When this feed item was created
    createdAt: v.number(),
  })
    .index("by_user_following", ["userId", "feedType", "postCreatedAt"])
    .index("by_user", ["userId", "postCreatedAt"])
    .index("by_post", ["postId"])
    .index("by_author", ["authorId", "postCreatedAt"]),

  // Media files (stored in R2)
  media: defineTable({
    userId: v.id("users"),
    storageId: v.optional(v.id("_storage")),
    r2Key: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    type: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
    mimeType: v.string(),
    filename: v.optional(v.string()),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    duration: v.optional(v.number()),
    processingStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
    // Vault folder organization
    folderId: v.optional(v.id("mediaFolders")),
    tags: v.optional(v.array(v.string())), // User-defined tags
    isFavorite: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_type", ["userId", "type"])
    .index("by_folder", ["userId", "folderId", "createdAt"])
    .index("by_favorite", ["userId", "isFavorite", "createdAt"]),

  // Likes
  likes: defineTable({
    userId: v.id("users"),
    targetType: v.union(v.literal("post"), v.literal("comment")),
    targetId: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_user_target", ["userId", "targetType", "targetId"]),

  // Comments
  comments: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    content: v.string(),
    parentId: v.optional(v.id("comments")),
    likesCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_parent", ["parentId", "createdAt"]),

  // Bookmarks
  bookmarks: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_post", ["userId", "postId"])
    .index("by_post", ["postId"]),

  // Notifications
  notifications: defineTable({
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
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "read", "createdAt"])
    .index("by_type", ["userId", "type", "createdAt"])
    .index("by_read_createdAt", ["read", "createdAt"]),

  // Conversations (DMs)
  conversations: defineTable({
    participantIds: v.array(v.id("users")),
    lastMessageId: v.optional(v.id("messages")),
    lastMessageAt: v.number(),
    // Denormalized unread counts per participant (keyed by index in participantIds)
    unreadCount0: v.optional(v.number()), // Unread count for participantIds[0]
    unreadCount1: v.optional(v.number()), // Unread count for participantIds[1]
    createdAt: v.number(),
  })
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_participants", ["participantIds"]),

  // User-Conversation join table for efficient "my conversations" queries
  userConversations: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    lastMessageAt: v.number(), // Denormalized for sorting
  })
    .index("by_user", ["userId", "lastMessageAt"])
    .index("by_conversation", ["conversationId"]),

  // Messages
  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),
    voiceNoteId: v.optional(v.id("voiceNotes")),
    tipAmount: v.optional(v.number()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId", "createdAt"]),

  // Subscription tiers (creator-defined)
  subscriptionTiers: defineTable({
    creatorId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),

    // Pricing
    priceMonthly: v.number(),
    priceQuarterly: v.optional(v.number()), // 3-month price
    priceBiannual: v.optional(v.number()), // 6-month price
    priceAnnual: v.optional(v.number()),

    // Stripe price IDs
    stripePriceIdMonthly: v.optional(v.string()),
    stripePriceIdQuarterly: v.optional(v.string()),
    stripePriceIdBiannual: v.optional(v.string()),
    stripePriceIdAnnual: v.optional(v.string()),

    // Customization
    ringColor: v.optional(v.string()),
    badgeImageId: v.optional(v.id("_storage")),
    coverEmoteId: v.optional(v.id("emotes")), // Featured emote for this tier

    // Benefits
    benefits: v.optional(v.array(v.string())),
    canDM: v.optional(v.boolean()),
    canAccessVoiceNotes: v.optional(v.boolean()),
    prioritySupport: v.optional(v.boolean()),
    earlyAccess: v.optional(v.boolean()),

    // Free trial
    trialDays: v.optional(v.number()), // 0 = no trial
    trialLimit: v.optional(v.number()), // Max trial subscribers (prevent abuse)
    trialCount: v.optional(v.number()), // Current trial subscribers

    // Limits
    subscriberLimit: v.optional(v.number()),
    currentSubscribers: v.optional(v.number()),

    // Welcome message
    welcomeMessage: v.optional(v.string()),

    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_creator", ["creatorId", "order"])
    .index("by_creator_active", ["creatorId", "isActive"]),

  // Subscriptions
  subscriptions: defineTable({
    fanId: v.id("users"),
    creatorId: v.id("users"),
    tierId: v.id("subscriptionTiers"),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("paused")
    ),
    priceAtSubscription: v.number(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    // Gift subscription fields
    isGift: v.optional(v.boolean()),
    giftedBy: v.optional(v.id("users")),
    // Scheduled function ID for expiry check
    expiryFunctionId: v.optional(v.id("_scheduled_functions")),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_fan", ["fanId", "createdAt"])
    .index("by_creator", ["creatorId", "createdAt"])
    .index("by_fan_creator", ["fanId", "creatorId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"])
    .index("by_status", ["status", "currentPeriodEnd"])
    .index("by_creator_status", ["creatorId", "status"])
    .index("by_fan_status", ["fanId", "status"]),

  // Coin transactions
  coinTransactions: defineTable({
    userId: v.id("users"),
    type: coinTransactionTypeValidator,
    amount: v.number(),
    relatedUserId: v.optional(v.id("users")),
    relatedPostId: v.optional(v.id("posts")),
    relatedMessageId: v.optional(v.id("messages")),
    promoCodeId: v.optional(v.id("promoCodes")),
    referralId: v.optional(v.id("referrals")),
    stripePaymentId: v.optional(v.string()),
    description: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_type", ["userId", "type", "createdAt"])
    .index("by_stripePaymentId", ["stripePaymentId"])
    .index("by_related_user_type", ["relatedUserId", "type", "createdAt"]),

  // Post unlocks
  postUnlocks: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    amount: v.number(),
    transactionId: v.id("coinTransactions"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_post", ["postId"])
    .index("by_user_post", ["userId", "postId"]),

  // Blocks
  blocks: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blocker", ["blockerId"])
    .index("by_blocked", ["blockedId"])
    .index("by_pair", ["blockerId", "blockedId"]),

  // Reports
  reports: defineTable({
    reporterId: v.id("users"),
    targetType: v.union(
      v.literal("user"),
      v.literal("post"),
      v.literal("comment"),
      v.literal("message")
    ),
    targetId: v.string(),
    reason: v.union(
      v.literal("spam"),
      v.literal("harassment"),
      v.literal("hate_speech"),
      v.literal("violence"),
      v.literal("nudity"),
      v.literal("copyright"),
      v.literal("impersonation"),
      v.literal("other")
    ),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("reviewing"),
      v.literal("resolved"),
      v.literal("dismissed")
    ),
    resolvedById: v.optional(v.id("users")),
    resolution: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_reporter", ["reporterId"])
    .index("by_target", ["targetType", "targetId"]),

  // Admin Actions Audit Log
  adminActions: defineTable({
    adminId: v.id("users"),
    targetUserId: v.optional(v.id("users")),
    targetPostId: v.optional(v.id("posts")),
    targetCommentId: v.optional(v.id("comments")),
    action: v.union(
      v.literal("user_suspended"),
      v.literal("user_banned"),
      v.literal("user_unbanned"),
      v.literal("user_verified"),
      v.literal("post_removed"),
      v.literal("comment_removed"),
      v.literal("report_resolved"),
      v.literal("payout_approved"),
      v.literal("payout_rejected"),
      v.literal("role_changed"),
      v.literal("connect_deauthorized")
    ),
    reason: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_admin", ["adminId", "createdAt"])
    .index("by_target_user", ["targetUserId", "createdAt"])
    .index("by_action", ["action", "createdAt"]),

  // Login History (Security Audit)
  loginHistory: defineTable({
    userId: v.id("users"),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    deviceType: v.optional(
      v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet"), v.literal("unknown"))
    ),
    location: v.optional(v.string()),
    success: v.boolean(),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_ip", ["ipAddress", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_success_createdAt", ["success", "createdAt"])
    .index("by_ip_success", ["ipAddress", "success", "createdAt"]),

  // Rate Limiting
  rateLimits: defineTable({
    userId: v.id("users"),
    action: v.string(),
    timestamp: v.number(),
  })
    .index("by_user_and_action", ["userId", "action", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  // IP-based Rate Limiting (for anonymous endpoints)
  ipRateLimits: defineTable({
    ipHash: v.string(), // Hashed IP address for privacy
    action: v.string(),
    timestamp: v.number(),
  })
    .index("by_ip_and_action", ["ipHash", "action", "timestamp"])
    .index("by_timestamp", ["timestamp"]),

  // Payouts
  payouts: defineTable({
    creatorId: v.id("users"),
    amount: v.number(), // Amount in cents
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("canceled")
    ),
    stripeTransferId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    requestedAt: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_creator", ["creatorId", "createdAt"])
    .index("by_status", ["status", "createdAt"]),

  // ===== VIP MEMBERS =====

  vipMembers: defineTable({
    creatorId: v.id("users"),
    memberId: v.id("users"),
    note: v.optional(v.string()), // Creator's private note about this VIP
    assignedAt: v.number(),
  })
    .index("by_creator", ["creatorId", "assignedAt"])
    .index("by_member", ["memberId"])
    .index("by_pair", ["creatorId", "memberId"]),

  // ===== CREATOR MODERATORS =====

  creatorModerators: defineTable({
    creatorId: v.id("users"),
    moderatorId: v.id("users"),
    permissions: v.optional(
      v.array(
        v.union(
          v.literal("delete_comments"),
          v.literal("ban_users"),
          v.literal("pin_comments"),
          v.literal("manage_chat")
        )
      )
    ),
    assignedAt: v.number(),
  })
    .index("by_creator", ["creatorId"])
    .index("by_moderator", ["moderatorId"])
    .index("by_pair", ["creatorId", "moderatorId"]),

  // ===== CUSTOM EMOTES =====

  emotes: defineTable({
    creatorId: v.id("users"),
    name: v.string(), // Display name
    code: v.string(), // :emote_code: format
    imageId: v.id("_storage"),
    tier: v.optional(
      v.union(
        v.literal("free"), // Available to all followers
        v.literal("subscriber"), // Subscribers only
        v.literal("vip") // VIP only
      )
    ),
    isAnimated: v.optional(v.boolean()),
    isActive: v.boolean(),
    usageCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_creator", ["creatorId", "isActive"])
    .index("by_code", ["creatorId", "code"]),

  // ===== PROMO CODES =====

  promoCodes: defineTable({
    creatorId: v.id("users"),
    code: v.string(), // Unique code (e.g., "SUMMER2024")
    discountType: v.union(
      v.literal("percent"), // Percentage off
      v.literal("fixed"), // Fixed amount off
      v.literal("trial") // Free trial days
    ),
    discountValue: v.number(), // Percent (0-100) or cents or days
    tierId: v.optional(v.id("subscriptionTiers")), // Specific tier or all
    usageLimit: v.optional(v.number()), // Max total uses
    usageCount: v.number(),
    perUserLimit: v.optional(v.number()), // Max uses per user (default 1)
    minPurchase: v.optional(v.number()), // Minimum purchase amount in cents
    expiresAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_creator", ["creatorId", "isActive"])
    .index("by_code", ["code"]),

  // Promo code usage tracking
  promoCodeUsages: defineTable({
    promoCodeId: v.id("promoCodes"),
    userId: v.id("users"),
    subscriptionId: v.optional(v.id("subscriptions")),
    discountApplied: v.number(), // Amount saved in cents
    usedAt: v.number(),
  })
    .index("by_promo", ["promoCodeId"])
    .index("by_user", ["userId"])
    .index("by_user_promo", ["userId", "promoCodeId"]),

  // ===== STORIES =====

  stories: defineTable({
    userId: v.id("users"),
    mediaId: v.id("media"),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    caption: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    visibility: v.union(
      v.literal("public"),
      v.literal("followers"),
      v.literal("subscribers"),
      v.literal("vip")
    ),
    viewsCount: v.optional(v.number()),
    reactionsCount: v.optional(v.number()),
    expiresAt: v.number(),
    // Scheduled function ID for expiration
    expirationFunctionId: v.optional(v.id("_scheduled_functions")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_expiry", ["expiresAt"])
    .index("by_user_active", ["userId", "expiresAt"]),

  // Story views tracking
  storyViews: defineTable({
    storyId: v.id("stories"),
    viewerId: v.id("users"),
    reaction: v.optional(v.string()), // Emoji reaction
    viewedAt: v.number(),
  })
    .index("by_story", ["storyId", "viewedAt"])
    .index("by_viewer", ["viewerId"])
    .index("by_story_viewer", ["storyId", "viewerId"]),

  // ===== POLLS =====

  polls: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    question: v.string(),
    options: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        votesCount: v.number(),
      })
    ),
    allowMultiple: v.optional(v.boolean()),
    endsAt: v.optional(v.number()),
    // Scheduled function ID for auto-ending
    endFunctionId: v.optional(v.id("_scheduled_functions")),
    totalVotes: v.optional(v.number()),
    isEnded: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_author", ["authorId", "createdAt"])
    .index("by_end_time", ["endsAt"]),

  // Poll votes
  pollVotes: defineTable({
    pollId: v.id("polls"),
    voterId: v.id("users"),
    optionIds: v.array(v.string()), // Array for multi-select polls
    votedAt: v.number(),
  })
    .index("by_poll", ["pollId"])
    .index("by_voter", ["voterId"])
    .index("by_poll_voter", ["pollId", "voterId"]),

  // ===== MASS MESSAGES =====

  massMessages: defineTable({
    creatorId: v.id("users"),
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),

    // Targeting
    audience: v.union(
      v.literal("all_subscribers"),
      v.literal("active_subscribers"),
      v.literal("expiring_subscribers"), // Subs ending in 7 days
      v.literal("vips"),
      v.literal("top_tippers"),
      v.literal("new_subscribers"), // Last 30 days
      v.literal("specific_tier")
    ),
    tierId: v.optional(v.id("subscriptionTiers")), // If audience is specific_tier
    topTipperCount: v.optional(v.number()), // Top N tippers

    // Monetization
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),

    // Stats
    recipientCount: v.optional(v.number()),
    sentCount: v.optional(v.number()),
    openedCount: v.optional(v.number()),

    // Status
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed")
    ),
    scheduledFor: v.optional(v.number()),
    // Scheduled function ID for sending
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_creator", ["creatorId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_scheduled", ["status", "scheduledFor"]),

  // Mass message recipients (for tracking delivery)
  massMessageRecipients: defineTable({
    massMessageId: v.id("massMessages"),
    recipientId: v.id("users"),
    conversationId: v.optional(v.id("conversations")),
    messageId: v.optional(v.id("messages")),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    openedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_mass_message", ["massMessageId", "status"])
    .index("by_recipient", ["recipientId"]),

  // ===== REFERRALS =====

  referrals: defineTable({
    referrerId: v.id("users"),
    referredId: v.id("users"),
    status: v.union(
      v.literal("pending"), // Signed up but not qualified
      v.literal("qualified"), // Met qualification criteria
      v.literal("rewarded") // Reward paid out
    ),
    rewardAmount: v.optional(v.number()), // Coins rewarded
    rewardPaidAt: v.optional(v.number()),
    qualifiedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_referrer", ["referrerId", "createdAt"])
    .index("by_referred", ["referredId"])
    .index("by_status", ["status"]),

  // ===== STRIPE EVENT LOG =====

  stripeEvents: defineTable({
    eventId: v.string(), // Stripe event ID (unique)
    eventType: v.string(), // Event type (e.g., "checkout.session.completed")
    status: v.union(v.literal("processing"), v.literal("completed"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
    processedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventType", ["eventType", "processedAt"])
    .index("by_status", ["status", "processedAt"])
    .index("by_processedAt", ["processedAt"]),

  // ===== USER SETTINGS =====

  userSettings: defineTable({
    userId: v.id("users"),

    // Notification preferences
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    notifyOnNewFollower: v.optional(v.boolean()),
    notifyOnNewSubscriber: v.optional(v.boolean()),
    notifyOnTip: v.optional(v.boolean()),
    notifyOnComment: v.optional(v.boolean()),
    notifyOnLike: v.optional(v.boolean()),
    notifyOnDM: v.optional(v.boolean()),
    notifyOnMention: v.optional(v.boolean()),

    // Privacy settings
    showOnlineStatus: v.optional(v.boolean()),
    showLastActive: v.optional(v.boolean()),
    allowSearchEngineIndexing: v.optional(v.boolean()),

    // Display preferences
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    language: v.optional(v.string()),
    contentWarnings: v.optional(v.boolean()), // Blur sensitive content
    autoplayVideos: v.optional(v.boolean()),

    // Creator-specific settings
    hideSubscriberCount: v.optional(v.boolean()),
    hideEarnings: v.optional(v.boolean()),
    watermarkMedia: v.optional(v.boolean()),

    // Streaming settings
    showLiveStatus: v.optional(v.boolean()), // Show live indicator when streaming (default true)
    notifyFollowersOnLive: v.optional(v.boolean()), // Notify followers when going live (default true)

    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ===== PUSH NOTIFICATION TOKENS =====

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("web"), v.literal("ios"), v.literal("android")),
    deviceId: v.optional(v.string()),
    isActive: v.boolean(),
    lastUsedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "isActive"])
    .index("by_token", ["token"]),

  // ===== POST DRAFTS =====

  postDrafts: defineTable({
    authorId: v.id("users"),
    content: v.optional(v.string()),
    mediaIds: v.optional(v.array(v.id("media"))),
    visibility: v.optional(
      v.union(
        v.literal("public"),
        v.literal("followers"),
        v.literal("subscribers"),
        v.literal("vip")
      )
    ),
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
    pollQuestion: v.optional(v.string()),
    pollOptions: v.optional(v.array(v.string())),
    lastSavedAt: v.number(),
    createdAt: v.number(),
  }).index("by_author", ["authorId", "lastSavedAt"]),

  // ===== SCHEDULED POSTS =====

  scheduledPosts: defineTable({
    authorId: v.id("users"),
    content: v.string(),
    mediaIds: v.optional(v.array(v.id("media"))),
    visibility: v.union(
      v.literal("public"),
      v.literal("followers"),
      v.literal("subscribers"),
      v.literal("vip")
    ),
    isLocked: v.optional(v.boolean()),
    unlockPrice: v.optional(v.number()),
    pollQuestion: v.optional(v.string()),
    pollOptions: v.optional(v.array(v.string())),
    scheduledFor: v.number(),
    // Scheduled function ID for cancellation
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    status: v.union(
      v.literal("scheduled"),
      v.literal("publishing"),
      v.literal("published"),
      v.literal("failed"),
      v.literal("canceled")
    ),
    publishedPostId: v.optional(v.id("posts")),
    failureReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_author", ["authorId", "scheduledFor"])
    .index("by_status_schedule", ["status", "scheduledFor"]),

  // ===== CREATOR BANS =====

  creatorBans: defineTable({
    creatorId: v.id("users"),
    bannedUserId: v.id("users"),
    reason: v.optional(v.string()),
    bannedBy: v.id("users"), // Creator or their mod
    expiresAt: v.optional(v.number()), // Permanent if not set
    createdAt: v.number(),
  })
    .index("by_creator", ["creatorId"])
    .index("by_banned_user", ["bannedUserId"])
    .index("by_pair", ["creatorId", "bannedUserId"]),

  // ===== PINNED COMMENTS =====

  pinnedComments: defineTable({
    postId: v.id("posts"),
    commentId: v.id("comments"),
    pinnedBy: v.id("users"),
    pinnedAt: v.number(),
  }).index("by_post", ["postId"]),

  // ===== LINK PREVIEWS CACHE =====

  linkPreviews: defineTable({
    url: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    siteName: v.optional(v.string()),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_url", ["url"]),

  // ===== VAULT FOLDERS =====

  mediaFolders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    parentId: v.optional(v.id("mediaFolders")), // For nested folders
    color: v.optional(v.string()), // Folder color for UI
    icon: v.optional(v.string()), // Emoji or icon name
    mediaCount: v.optional(v.number()), // Denormalized count
    order: v.optional(v.number()), // Sort order
    isDefault: v.optional(v.boolean()), // Default folders can't be deleted
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "order"])
    .index("by_parent", ["userId", "parentId"])
    .index("by_name", ["userId", "name"]),

  // ===== SUBSCRIBER BADGES =====

  subscriberBadges: defineTable({
    subscriptionId: v.id("subscriptions"),
    fanId: v.id("users"),
    creatorId: v.id("users"),
    tierId: v.id("subscriptionTiers"),
    // Dynamic monthly badge - stores months subscribed
    months: v.number(), // Total months subscribed (0 = new, 1 = 1 month, etc.)
    isFounding: v.optional(v.boolean()), // Special founding member status
    // Creator can customize badge appearance per milestone
    customBadgeImageId: v.optional(v.id("_storage")),
    customBadgeColor: v.optional(v.string()),
    tenure: v.number(), // Days subscribed
    firstSubscribedAt: v.number(),
    lastUpgradedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_subscription", ["subscriptionId"])
    .index("by_fan_creator", ["fanId", "creatorId"])
    .index("by_creator_months", ["creatorId", "months"])
    .index("by_upgrade_due", ["lastUpgradedAt"]),

  // ===== MUTES =====

  mutes: defineTable({
    userId: v.id("users"), // User who muted
    mutedUserId: v.id("users"), // User who was muted
    muteNotifications: v.optional(v.boolean()), // Also mute notifications
    muteStories: v.optional(v.boolean()), // Also mute stories
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_muted", ["mutedUserId"])
    .index("by_pair", ["userId", "mutedUserId"]),

  // ===== HIDDEN POSTS =====

  hiddenPosts: defineTable({
    userId: v.id("users"), // User who hid the post
    postId: v.id("posts"), // Post that was hidden
    reason: v.optional(
      v.union(
        v.literal("not_interested"),
        v.literal("seen_too_often"),
        v.literal("offensive"),
        v.literal("other")
      )
    ),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_post", ["postId"])
    .index("by_user_post", ["userId", "postId"]),

  // ===== SHARE ANALYTICS =====

  shares: defineTable({
    postId: v.id("posts"),
    userId: v.optional(v.id("users")), // Can be anonymous
    platform: v.union(
      v.literal("twitter"),
      v.literal("facebook"),
      v.literal("linkedin"),
      v.literal("whatsapp"),
      v.literal("telegram"),
      v.literal("email"),
      v.literal("copy_link"),
      v.literal("native_share"),
      v.literal("other")
    ),
    referrer: v.optional(v.string()), // Where the share came from
    createdAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_user", ["userId", "createdAt"])
    .index("by_platform", ["platform", "createdAt"]),

  // ===== LIVE STREAMING =====

  livestreams: defineTable({
    userId: v.id("users"),
    platform: v.union(v.literal("twitch"), v.literal("kick")),
    isLive: v.boolean(),
    title: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    viewerCount: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    lastUpdatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_platform", ["userId", "platform"])
    .index("by_isLive", ["isLive", "lastUpdatedAt"]),

  // Webhook event deduplication
  streamingWebhookEvents: defineTable({
    eventId: v.string(), // External event ID from Twitch/Kick
    platform: v.union(v.literal("twitch"), v.literal("kick")),
    eventType: v.string(),
    processedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_platform_event", ["platform", "eventId"]),

  // ===== PASSWORD RESET TOKENS =====

  passwordResetTokens: defineTable({
    email: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"]),

  // ===== VERIFICATION REQUESTS =====

  verificationRequests: defineTable({
    userId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    // Basic info
    displayName: v.optional(v.string()), // How they want to be known
    category: v.optional(v.string()), // Creator category/niche
    additionalNotes: v.optional(v.string()),
    // Social proof - used for verification
    socialLinks: v.optional(v.array(v.string())),
    followerCount: v.optional(v.number()),
    // Review info
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status", "createdAt"])
    .index("by_status_date", ["status", "updatedAt"]),

  // ===== GIFT SUBSCRIPTIONS =====

  giftSubscriptions: defineTable({
    // Who's gifting
    gifterId: v.id("users"),
    // Who's receiving
    recipientId: v.optional(v.id("users")), // Optional - may not have account yet
    recipientEmail: v.optional(v.string()), // For email-based gifts
    // What creator subscription
    creatorId: v.id("users"),
    tierId: v.id("subscriptionTiers"), // Required - must select a tier
    // Duration
    durationMonths: v.number(), // 1, 3, 6, 12
    // Payment
    amountPaid: v.number(), // In cents
    stripePaymentIntentId: v.optional(v.string()),
    // Status
    status: v.union(
      v.literal("pending_payment"),
      v.literal("paid"),
      v.literal("redeemed"),
      v.literal("expired"),
      v.literal("refunded")
    ),
    // Redemption
    redemptionCode: v.optional(v.string()),
    redeemedAt: v.optional(v.number()),
    redeemedBy: v.optional(v.id("users")),
    // The actual subscription created when redeemed
    subscriptionId: v.optional(v.id("subscriptions")),
    // Gift message
    giftMessage: v.optional(v.string()),
    // Expiry (unredeemed gifts expire)
    expiresAt: v.number(),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_gifter", ["gifterId", "createdAt"])
    .index("by_recipient", ["recipientId", "status"])
    .index("by_recipient_email", ["recipientEmail", "status"])
    .index("by_redemption_code", ["redemptionCode"])
    .index("by_status", ["status", "expiresAt"])
    .index("by_creator", ["creatorId", "status"]),

  // ===== TWO-FACTOR AUTHENTICATION =====

  twoFactorAuth: defineTable({
    userId: v.id("users"),
    // TOTP secret (encrypted)
    totpSecret: v.string(),
    // Is 2FA enabled
    isEnabled: v.boolean(),
    // Backup codes (hashed)
    backupCodes: v.array(
      v.object({
        codeHash: v.string(),
        usedAt: v.optional(v.number()),
      })
    ),
    // When 2FA was enabled
    enabledAt: v.optional(v.number()),
    // Last successful verification
    lastVerifiedAt: v.optional(v.number()),
    // Recovery email (different from primary)
    recoveryEmail: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Temporary 2FA setup tokens (before confirmation)
  twoFactorSetup: defineTable({
    userId: v.id("users"),
    totpSecret: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_expiry", ["expiresAt"]),

  // ===== VOICE NOTES =====

  voiceNotes: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    // Duration in seconds
    durationSeconds: v.number(),
    // Waveform data for visualization (array of amplitude values)
    waveform: v.optional(v.array(v.number())),
    // Transcription (optional, for accessibility)
    transcription: v.optional(v.string()),
    // File info
    mimeType: v.string(),
    fileSizeBytes: v.number(),
    // Timestamps
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  // ===== PLATFORM STATISTICS =====

  platformStats: defineTable({
    // Singleton pattern - only one record with key "global"
    key: v.literal("global"),
    // User stats
    totalUsers: v.number(),
    activeUsers: v.number(),
    suspendedUsers: v.number(),
    bannedUsers: v.number(),
    pendingReviewUsers: v.number(),
    // Role stats
    totalCreators: v.number(),
    totalMods: v.number(),
    totalAdmins: v.number(),
    // Content stats
    totalPosts: v.number(),
    pendingReports: v.number(),
    // Revenue stats
    activeSubscriptions: v.number(),
    // Timestamps
    computedAt: v.number(),
  }).index("by_key", ["key"]),
});
