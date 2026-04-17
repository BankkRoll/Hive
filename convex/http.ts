/**
 * @fileoverview HTTP Routes Module
 *
 * Defines HTTP endpoints for webhooks and public APIs.
 *
 * Endpoints:
 *   - /stripe/webhook: Stripe payment webhooks
 *   - /webhooks/twitch: Twitch EventSub webhooks
 *   - /webhooks/kick: Kick streaming webhooks
 *   - /api/profile-meta: Public profile metadata for SEO
 *
 * Security:
 *   - Stripe: Signature verification via stripeWebhook action
 *   - Twitch: Message signature and timestamp validation
 *   - Kick: Event signature validation
 *   - Profile Meta: IP-based rate limiting, input sanitization
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

// ===== STRIPE WEBHOOK =====

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      console.error("Missing stripe-signature header");
      return new Response("Missing signature", { status: 400 });
    }

    const body = await request.text();

    try {
      const result = await ctx.runAction(internal.stripeWebhook.handleWebhook, {
        body,
        signature,
      });

      if (!result.success) {
        console.error("Webhook processing failed:", result.error);
        return new Response(result.error ?? "Webhook processing failed", {
          status: result.statusCode ?? 400,
        });
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response("Webhook handler error", { status: 500 });
    }
  }),
});

// ===== TWITCH EVENTSUB WEBHOOK =====

http.route({
  path: "/webhooks/twitch",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const messageId = request.headers.get("Twitch-Eventsub-Message-Id");
    const messageType = request.headers.get("Twitch-Eventsub-Message-Type");
    const messageSignature = request.headers.get("Twitch-Eventsub-Message-Signature");
    const messageTimestamp = request.headers.get("Twitch-Eventsub-Message-Timestamp");
    const subscriptionType = request.headers.get("Twitch-Eventsub-Subscription-Type");

    if (!messageId || !messageType || !messageSignature || !messageTimestamp) {
      console.error("Missing required Twitch headers");
      return new Response("Missing required headers", { status: 400 });
    }

    const body = await request.text();

    try {
      const result = await ctx.runAction(internal.streamingActions.handleTwitchWebhook, {
        headers: {
          messageId,
          messageType,
          messageSignature,
          messageTimestamp,
          subscriptionType: subscriptionType ?? undefined,
        },
        body,
      });

      if (result.challenge) {
        return new Response(result.challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      if (!result.success) {
        console.error("Twitch webhook processing failed:", result.error);
        return new Response(result.error ?? "Webhook processing failed", { status: 400 });
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing Twitch webhook:", error);
      return new Response("Webhook handler error", { status: 500 });
    }
  }),
});

// ===== KICK WEBHOOK =====

http.route({
  path: "/webhooks/kick",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("X-Kick-Signature") ?? request.headers.get("X-Signature");
    const eventId = request.headers.get("X-Kick-Event-Id") ?? request.headers.get("X-Event-Id");

    const body = await request.text();

    try {
      const result = await ctx.runAction(internal.streamingActions.handleKickWebhook, {
        headers: {
          signature: signature ?? undefined,
          eventId: eventId ?? undefined,
        },
        body,
      });

      if (!result.success) {
        console.error("Kick webhook processing failed:", result.error);
        return new Response(result.error ?? "Webhook processing failed", { status: 400 });
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Error processing Kick webhook:", error);
      return new Response("Webhook handler error", { status: 500 });
    }
  }),
});

// ===== PROFILE METADATA (SEO) =====

http.route({
  path: "/api/profile-meta",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const rateCheck = await ctx.runMutation(internal.admin.checkIpRateLimitInternal, {
      ipAddress: clientIp,
      action: "profile_meta",
    });

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((rateCheck.retryAfter ?? 0) / 1000),
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateCheck.retryAfter ?? 0) / 1000)),
          },
        }
      );
    }

    const url = new URL(request.url);
    const username = url.searchParams.get("username");

    if (!username) {
      return new Response(JSON.stringify({ found: false, error: "Missing username" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sanitizedUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 30);

    if (!sanitizedUsername || sanitizedUsername !== username.trim().toLowerCase()) {
      return new Response(JSON.stringify({ found: false, error: "Invalid username" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const user = await ctx.runQuery(internal.users.getByUsernameInternal, {
        username: sanitizedUsername,
      });

      if (!user) {
        return new Response(JSON.stringify({ found: false }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const settings = await ctx.runQuery(internal.settings.getByUserIdInternal, {
        userId: user._id,
      });

      return new Response(
        JSON.stringify({
          found: true,
          allowSearchEngineIndexing: settings.allowSearchEngineIndexing,
          displayName: user.displayName,
          username: user.username,
          bio: user.bio,
          isVerified: user.isVerified,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    } catch (error) {
      console.error("Error fetching profile metadata:", error);
      return new Response(JSON.stringify({ found: false, error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
