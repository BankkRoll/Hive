/**
 * @fileoverview Streaming Platform Webhook Actions
 *
 * Handles webhook processing and API interactions for Twitch and Kick
 * streaming platforms. Includes signature verification, event handling,
 * and subscription management.
 *
 * Features:
 *   - Twitch EventSub webhook handling with HMAC-SHA256 signature verification
 *   - Kick webhook handling with signature verification
 *   - Automatic EventSub subscription management for stream.online/offline events
 *   - Kick webhook subscription management for livestream status updates
 *   - Replay attack prevention via timestamp validation (10-minute window)
 *   - Event deduplication via checkWebhookEventProcessed
 *
 * Security:
 *   - HMAC-SHA256 signature verification using timing-safe comparison
 *   - Timestamp validation to prevent replay attacks
 *   - Environment variable secrets: TWITCH_WEBHOOK_SECRET, KICK_WEBHOOK_SECRET
 *   - All actions are internal (not publicly callable)
 *
 * Required Environment Variables:
 *   - TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_WEBHOOK_SECRET
 *   - KICK_CLIENT_ID, KICK_CLIENT_SECRET, KICK_WEBHOOK_SECRET (optional)
 */

"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import * as crypto from "crypto";

// ===== HELPER FUNCTIONS =====

/** Verify Twitch EventSub webhook signature using HMAC-SHA256 */
function verifyTwitchSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signature: string,
  secret: string
): boolean {
  const message = messageId + timestamp + body;
  const expectedSignature =
    "sha256=" + crypto.createHmac("sha256", secret).update(message).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
}

/** Verify Kick webhook signature using HMAC-SHA256 with timing-safe comparison */
function verifyKickSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  const normalizedSignature = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  if (normalizedSignature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(normalizedSignature), Buffer.from(expectedSignature));
}

// ===== INTERNAL ACTIONS =====

/** Process incoming Twitch EventSub webhook events */
export const handleTwitchWebhook = internalAction({
  args: {
    headers: v.object({
      messageId: v.string(),
      messageType: v.string(),
      messageSignature: v.string(),
      messageTimestamp: v.string(),
      subscriptionType: v.optional(v.string()),
    }),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    if (!secret) {
      console.error("TWITCH_WEBHOOK_SECRET not configured");
      return { success: false, error: "Webhook secret not configured" };
    }

    const isValid = verifyTwitchSignature(
      args.headers.messageId,
      args.headers.messageTimestamp,
      args.body,
      args.headers.messageSignature,
      secret
    );

    if (!isValid) {
      console.error("Invalid Twitch webhook signature");
      return { success: false, error: "Invalid signature" };
    }

    const timestamp = new Date(args.headers.messageTimestamp).getTime();
    const now = Date.now();
    if (Math.abs(now - timestamp) > 10 * 60 * 1000) {
      console.error("Twitch webhook timestamp too old");
      return { success: false, error: "Timestamp too old" };
    }

    const { processed } = await ctx.runMutation(internal.streaming.checkWebhookEventProcessed, {
      eventId: args.headers.messageId,
      platform: "twitch",
    });

    if (processed) {
      console.log("Twitch webhook event already processed:", args.headers.messageId);
      return { success: true, message: "Already processed" };
    }

    const payload = JSON.parse(args.body);

    if (args.headers.messageType === "webhook_callback_verification") {
      return { success: true, challenge: payload.challenge };
    }

    if (args.headers.messageType === "notification") {
      const event = payload.event;
      const subscriptionType = payload.subscription?.type;

      if (subscriptionType === "stream.online") {
        await ctx.runMutation(internal.streaming.updateStreamStatus, {
          platform: "twitch",
          platformUserId: event.broadcaster_user_id,
          isLive: true,
          title: event.title || "Live on Twitch",
        });
      } else if (subscriptionType === "stream.offline") {
        await ctx.runMutation(internal.streaming.updateStreamStatus, {
          platform: "twitch",
          platformUserId: event.broadcaster_user_id,
          isLive: false,
        });
      }

      await ctx.runMutation(internal.streaming.markWebhookEventProcessed, {
        eventId: args.headers.messageId,
        platform: "twitch",
        eventType: subscriptionType || "unknown",
      });
    }

    return { success: true };
  },
});

/** Process incoming Kick webhook events */
export const handleKickWebhook = internalAction({
  args: {
    headers: v.object({
      signature: v.optional(v.string()),
      eventId: v.optional(v.string()),
    }),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const secret = process.env.KICK_WEBHOOK_SECRET;

    if (secret) {
      if (!args.headers.signature) {
        console.error("Missing Kick webhook signature");
        return { success: false, error: "Missing signature" };
      }

      const isValid = verifyKickSignature(args.body, args.headers.signature, secret);

      if (!isValid) {
        console.error("Invalid Kick webhook signature");
        return { success: false, error: "Invalid signature" };
      }
    } else {
      console.warn("KICK_WEBHOOK_SECRET not configured - signature verification skipped");
    }

    const eventId = args.headers.eventId || crypto.randomUUID();

    const { processed } = await ctx.runMutation(internal.streaming.checkWebhookEventProcessed, {
      eventId,
      platform: "kick",
    });

    if (processed) {
      console.log("Kick webhook event already processed:", eventId);
      return { success: true, message: "Already processed" };
    }

    const payload = JSON.parse(args.body);

    if (payload.event_type === "livestream.status" || payload.type === "livestream_status") {
      const data = payload.data || payload;

      await ctx.runMutation(internal.streaming.updateStreamStatus, {
        platform: "kick",
        platformUserId: data.broadcaster_id || data.channel_id || data.user_id,
        isLive: data.is_live || data.livestream?.is_live || false,
        title: data.session_title || data.livestream?.session_title,
        viewerCount: data.viewer_count || data.livestream?.viewer_count,
        thumbnailUrl: data.thumbnail?.url || data.livestream?.thumbnail?.url,
      });

      await ctx.runMutation(internal.streaming.markWebhookEventProcessed, {
        eventId,
        platform: "kick",
        eventType: payload.event_type || payload.type || "livestream_status",
      });
    }

    return { success: true };
  },
});

/** Subscribe to Twitch EventSub for stream.online and stream.offline events */
export const subscribeTwitchEventSub = internalAction({
  args: {
    twitchUserId: v.string(),
    callbackUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET;

    if (!clientId || !clientSecret || !webhookSecret) {
      console.error("Twitch API credentials not configured");
      return { success: false, error: "Twitch credentials not configured" };
    }

    const tokenResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST" }
    );

    if (!tokenResponse.ok) {
      return { success: false, error: "Failed to get access token" };
    }

    const { access_token } = await tokenResponse.json();

    const subscribeOnline = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "stream.online",
        version: "1",
        condition: { broadcaster_user_id: args.twitchUserId },
        transport: {
          method: "webhook",
          callback: args.callbackUrl,
          secret: webhookSecret,
        },
      }),
    });

    const subscribeOffline = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "stream.offline",
        version: "1",
        condition: { broadcaster_user_id: args.twitchUserId },
        transport: {
          method: "webhook",
          callback: args.callbackUrl,
          secret: webhookSecret,
        },
      }),
    });

    console.log(
      `Twitch EventSub subscriptions: online=${subscribeOnline.status}, offline=${subscribeOffline.status}`
    );

    return {
      success: subscribeOnline.ok && subscribeOffline.ok,
      onlineStatus: subscribeOnline.status,
      offlineStatus: subscribeOffline.status,
    };
  },
});

/** Unsubscribe from all Twitch EventSub subscriptions for a user */
export const unsubscribeTwitchEventSub = internalAction({
  args: {
    twitchUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Twitch API credentials not configured");
      return { success: false, error: "Twitch credentials not configured" };
    }

    const tokenResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
      { method: "POST" }
    );

    if (!tokenResponse.ok) {
      return { success: false, error: "Failed to get access token" };
    }

    const { access_token } = await tokenResponse.json();

    const listResponse = await fetch(
      `https://api.twitch.tv/helix/eventsub/subscriptions?user_id=${args.twitchUserId}`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Client-Id": clientId,
        },
      }
    );

    if (!listResponse.ok) {
      return { success: false, error: "Failed to list subscriptions" };
    }

    const { data: subscriptions } = await listResponse.json();

    let deleted = 0;
    for (const sub of subscriptions || []) {
      const deleteResponse = await fetch(
        `https://api.twitch.tv/helix/eventsub/subscriptions?id=${sub.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Client-Id": clientId,
          },
        }
      );
      if (deleteResponse.ok) deleted++;
    }

    console.log(`Unsubscribed from ${deleted} Twitch EventSub subscriptions`);
    return { success: true, deleted };
  },
});

/** Subscribe to Kick webhooks for livestream status updates */
export const subscribeKickWebhook = internalAction({
  args: {
    kickUserId: v.string(),
    callbackUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.KICK_CLIENT_ID;
    const clientSecret = process.env.KICK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Kick API credentials not configured");
      return { success: false, error: "Kick credentials not configured" };
    }

    const tokenResponse = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "events:subscribe",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Failed to get Kick access token");
      return { success: false, error: "Failed to get access token" };
    }

    const { access_token } = await tokenResponse.json();

    const subscribeResponse = await fetch("https://api.kick.com/public/v1/events/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "livestream.status.updated",
        version: "1",
        condition: { broadcaster_user_id: args.kickUserId },
        transport: {
          method: "webhook",
          callback: args.callbackUrl,
        },
      }),
    });

    console.log(`Kick webhook subscription: status=${subscribeResponse.status}`);

    return {
      success: subscribeResponse.ok,
      status: subscribeResponse.status,
    };
  },
});

/** Unsubscribe from all Kick webhooks for a user */
export const unsubscribeKickWebhook = internalAction({
  args: {
    kickUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.KICK_CLIENT_ID;
    const clientSecret = process.env.KICK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Kick API credentials not configured");
      return { success: false, error: "Kick credentials not configured" };
    }

    const tokenResponse = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "events:subscribe",
      }),
    });

    if (!tokenResponse.ok) {
      return { success: false, error: "Failed to get access token" };
    }

    const { access_token } = await tokenResponse.json();

    const listResponse = await fetch(
      `https://api.kick.com/public/v1/events/subscriptions?user_id=${args.kickUserId}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!listResponse.ok) {
      return { success: false, error: "Failed to list subscriptions" };
    }

    const { data: subscriptions } = await listResponse.json();

    let deleted = 0;
    for (const sub of subscriptions || []) {
      const deleteResponse = await fetch(
        `https://api.kick.com/public/v1/events/subscriptions/${sub.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );
      if (deleteResponse.ok) deleted++;
    }

    console.log(`Unsubscribed from ${deleted} Kick webhook subscriptions`);
    return { success: true, deleted };
  },
});
