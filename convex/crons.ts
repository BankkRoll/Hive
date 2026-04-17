/**
 * @fileoverview Scheduled Jobs (Cron Tasks)
 *
 * Background jobs that run on a schedule for maintenance and cleanup.
 *
 * Categories:
 *   - Platform Statistics: Hourly stats computation
 *   - Cleanup & Maintenance: Rate limits, notifications, stories, Stripe events, link previews
 *   - Subscription Management: Fallback expiration checks
 *   - Scheduled Content: Polls, mass messages, scheduled posts
 *   - Subscriber Badges: Badge evolution and orphan cleanup
 *   - Security: Login history archival, suspension checks
 *   - Live Streaming: Webhook event cleanup
 *   - Push Notifications: Inactive token cleanup
 *   - Password Reset: Expired token cleanup
 *   - Two-Factor Auth: Expired setup cleanup
 *   - Gift Subscriptions: Expired gift cleanup
 *
 * Note: Many scheduled operations use runAt for exact timing.
 * These crons serve as fallback mechanisms for edge cases.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ===== PLATFORM STATISTICS =====

crons.interval("compute platform stats", { hours: 1 }, internal.admin.computePlatformStats);

// ===== CLEANUP & MAINTENANCE =====

crons.interval("cleanup rate limits", { minutes: 30 }, internal.admin.cleanupRateLimits);

crons.weekly(
  "cleanup old notifications",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.notifications.cleanupOld
);

crons.interval("cleanup expired stories", { hours: 6 }, internal.stories.cleanupExpired);

crons.weekly(
  "cleanup old stripe events",
  { dayOfWeek: "saturday", hourUTC: 3, minuteUTC: 0 },
  internal.stripeHelpers.cleanupOldStripeEvents
);

crons.weekly(
  "cleanup expired link previews",
  { dayOfWeek: "monday", hourUTC: 5, minuteUTC: 0 },
  internal.linkPreviews.cleanupExpired
);

// ===== SUBSCRIPTION MANAGEMENT =====

crons.daily(
  "check expired subscriptions",
  { hourUTC: 6, minuteUTC: 0 },
  internal.subscriptions.checkExpired
);

// ===== SCHEDULED CONTENT =====

crons.interval("check ended polls", { hours: 6 }, internal.polls.checkEndedPolls);

crons.interval(
  "process scheduled mass messages",
  { hours: 6 },
  internal.massMessages.processScheduled
);

crons.interval("process scheduled posts", { hours: 6 }, internal.scheduledPosts.processScheduled);

crons.weekly(
  "cleanup old scheduled posts",
  { dayOfWeek: "sunday", hourUTC: 5, minuteUTC: 0 },
  internal.scheduledPosts.cleanupOld
);

// ===== SUBSCRIBER BADGES =====

crons.daily(
  "evolve subscriber badges",
  { hourUTC: 7, minuteUTC: 0 },
  internal.subscriberBadges.evolveBadges
);

crons.monthly(
  "cleanup orphaned badges",
  { day: 15, hourUTC: 3, minuteUTC: 0 },
  internal.subscriberBadges.cleanupOrphanedBadges
);

// ===== SECURITY =====

crons.monthly(
  "archive login history",
  { day: 1, hourUTC: 2, minuteUTC: 0 },
  internal.security.archiveLoginHistory
);

crons.daily(
  "check user suspensions",
  { hourUTC: 0, minuteUTC: 0 },
  internal.security.checkSuspensions
);

// ===== LIVE STREAMING =====

crons.weekly(
  "cleanup streaming webhook events",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.streamingCron.cleanupWebhookEvents
);

// ===== PUSH NOTIFICATIONS =====

crons.weekly(
  "cleanup inactive push tokens",
  { dayOfWeek: "wednesday", hourUTC: 3, minuteUTC: 0 },
  internal.push.cleanupInactiveTokens
);

// ===== PASSWORD RESET =====

crons.daily(
  "cleanup password reset tokens",
  { hourUTC: 5, minuteUTC: 0 },
  internal.passwordReset.cleanupExpired
);

// ===== TWO-FACTOR AUTHENTICATION =====

crons.interval("cleanup 2fa setups", { hours: 1 }, internal.twoFactor.cleanupExpiredSetups);

// ===== GIFT SUBSCRIPTIONS =====

crons.daily(
  "cleanup expired gifts",
  { hourUTC: 4, minuteUTC: 0 },
  internal.giftSubscriptions.cleanupExpired
);

export default crons;
