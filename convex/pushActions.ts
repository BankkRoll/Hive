/**
 * @fileoverview Push Notification Actions Module
 *
 * Node.js runtime actions for sending web push notifications.
 *
 * Features:
 *   - Web Push via VAPID keys
 *   - Automatic token deactivation on 404/410
 *   - Token last-used tracking
 *
 * Environment Variables:
 *   - WEBPUSH_PUBLIC_KEY
 *   - WEBPUSH_PRIVATE_KEY
 *   - WEBPUSH_SUBJECT
 */

"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import webpush from "web-push";

const webpushPublicKey = process.env.WEBPUSH_PUBLIC_KEY;
const webpushPrivateKey = process.env.WEBPUSH_PRIVATE_KEY;
const webpushSubject = process.env.WEBPUSH_SUBJECT || "mailto:admin@example.com";

if (webpushPublicKey && webpushPrivateKey) {
  webpush.setVapidDetails(webpushSubject, webpushPublicKey, webpushPrivateKey);
}

// ===== INTERNAL ACTIONS =====

/** Send push notification to a user */
export const sendPushNotification = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    icon: v.optional(v.string()),
    badge: v.optional(v.string()),
    url: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!webpushPublicKey || !webpushPrivateKey) {
      console.log("WebPush keys not configured, skipping push notification");
      return { sent: 0, failed: 0 };
    }

    // Get user's active push tokens
    const tokens = await ctx.runMutation(internal.push.getTokensForUser, {
      userId: args.userId,
    });

    if (tokens.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      icon: args.icon || "/icons/icon-192x192.png",
      badge: args.badge || "/icons/badge-72x72.png",
      url: args.url || "/",
      data: args.data,
    });

    let sent = 0;
    let failed = 0;

    for (const tokenData of tokens) {
      try {
        // For web push, the token is the subscription object as JSON
        const subscription = JSON.parse(tokenData.token);

        await webpush.sendNotification(subscription, payload);
        sent++;

        // Update last used time
        await ctx.runMutation(internal.push.updateTokenLastUsed, {
          tokenId: tokenData.id,
        });
      } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        console.error(`Failed to send push to token ${tokenData.id}:`, err);
        failed++;

        // If the subscription is invalid/expired, deactivate it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await ctx.runMutation(internal.push.deactivateToken, {
            tokenId: tokenData.id,
          });
        }
      }
    }

    return { sent, failed };
  },
});
