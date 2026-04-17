/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as batchHelpers from "../batchHelpers.js";
import type * as blocks from "../blocks.js";
import type * as bookmarks from "../bookmarks.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as emotes from "../emotes.js";
import type * as feed from "../feed.js";
import type * as feedItems from "../feedItems.js";
import type * as follows from "../follows.js";
import type * as giftSubscriptions from "../giftSubscriptions.js";
import type * as hiddenPosts from "../hiddenPosts.js";
import type * as http from "../http.js";
import type * as likes from "../likes.js";
import type * as linkPreviews from "../linkPreviews.js";
import type * as massMessages from "../massMessages.js";
import type * as media from "../media.js";
import type * as mediaActions from "../mediaActions.js";
import type * as messages from "../messages.js";
import type * as moderators from "../moderators.js";
import type * as mutes from "../mutes.js";
import type * as notifications from "../notifications.js";
import type * as passwordReset from "../passwordReset.js";
import type * as passwordResetActions from "../passwordResetActions.js";
import type * as payouts from "../payouts.js";
import type * as polls from "../polls.js";
import type * as postDigests from "../postDigests.js";
import type * as posts from "../posts.js";
import type * as presence from "../presence.js";
import type * as promoCodes from "../promoCodes.js";
import type * as push from "../push.js";
import type * as pushActions from "../pushActions.js";
import type * as referrals from "../referrals.js";
import type * as reports from "../reports.js";
import type * as scheduledPosts from "../scheduledPosts.js";
import type * as security from "../security.js";
import type * as settings from "../settings.js";
import type * as shares from "../shares.js";
import type * as stories from "../stories.js";
import type * as streaming from "../streaming.js";
import type * as streamingActions from "../streamingActions.js";
import type * as streamingCron from "../streamingCron.js";
import type * as stripe from "../stripe.js";
import type * as stripeHelpers from "../stripeHelpers.js";
import type * as stripeWebhook from "../stripeWebhook.js";
import type * as subscriberBadges from "../subscriberBadges.js";
import type * as subscriptions from "../subscriptions.js";
import type * as tips from "../tips.js";
import type * as twoFactor from "../twoFactor.js";
import type * as twoFactorActions from "../twoFactorActions.js";
import type * as users from "../users.js";
import type * as vaultFolders from "../vaultFolders.js";
import type * as verification from "../verification.js";
import type * as vips from "../vips.js";
import type * as voiceNotes from "../voiceNotes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  auth: typeof auth;
  batchHelpers: typeof batchHelpers;
  blocks: typeof blocks;
  bookmarks: typeof bookmarks;
  comments: typeof comments;
  crons: typeof crons;
  emotes: typeof emotes;
  feed: typeof feed;
  feedItems: typeof feedItems;
  follows: typeof follows;
  giftSubscriptions: typeof giftSubscriptions;
  hiddenPosts: typeof hiddenPosts;
  http: typeof http;
  likes: typeof likes;
  linkPreviews: typeof linkPreviews;
  massMessages: typeof massMessages;
  media: typeof media;
  mediaActions: typeof mediaActions;
  messages: typeof messages;
  moderators: typeof moderators;
  mutes: typeof mutes;
  notifications: typeof notifications;
  passwordReset: typeof passwordReset;
  passwordResetActions: typeof passwordResetActions;
  payouts: typeof payouts;
  polls: typeof polls;
  postDigests: typeof postDigests;
  posts: typeof posts;
  presence: typeof presence;
  promoCodes: typeof promoCodes;
  push: typeof push;
  pushActions: typeof pushActions;
  referrals: typeof referrals;
  reports: typeof reports;
  scheduledPosts: typeof scheduledPosts;
  security: typeof security;
  settings: typeof settings;
  shares: typeof shares;
  stories: typeof stories;
  streaming: typeof streaming;
  streamingActions: typeof streamingActions;
  streamingCron: typeof streamingCron;
  stripe: typeof stripe;
  stripeHelpers: typeof stripeHelpers;
  stripeWebhook: typeof stripeWebhook;
  subscriberBadges: typeof subscriberBadges;
  subscriptions: typeof subscriptions;
  tips: typeof tips;
  twoFactor: typeof twoFactor;
  twoFactorActions: typeof twoFactorActions;
  users: typeof users;
  vaultFolders: typeof vaultFolders;
  verification: typeof verification;
  vips: typeof vips;
  voiceNotes: typeof voiceNotes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
