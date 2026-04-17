# Hive - Creator Platform

A social platform for creators built with Next.js, Convex, and Stripe.

<table>
  <tr>
    <td align="center">
      <b>Mobile Light</b><br/>
      <img src="https://github.com/user-attachments/assets/a4e2a9b6-c36a-4715-9b53-e25ffdd46d89" width="250"/>
    </td>
    <td align="center">
      <b>Mobile Dark</b><br/>
      <img src="https://github.com/user-attachments/assets/bdb04b3a-7efc-4707-84d3-cdad53a1b4f0" width="250"/>
    </td>
  </tr>

  <tr>
    <td align="center">
      <b>Desktop Light</b><br/>
      <img src="https://github.com/user-attachments/assets/5fe0c194-90d4-44d6-a4f3-adf120e9d12d" width="400"/>
    </td>
    <td align="center">
      <b>Desktop Dark</b><br/>
      <img src="https://github.com/user-attachments/assets/0f59271e-a813-4ca4-8d39-f1fdbd6c9496" width="400"/>
    </td>
  </tr>
</table>

---

## Features

### Content & Social

- **Posts** - Create posts with text, images, videos, and audio
- **Visibility Controls** - Public, followers-only, subscribers-only, or VIP-only content
- **Pay-Per-View Posts** - Lock posts behind a coin paywall
- **Stories** - 24-hour ephemeral content with reactions and view tracking
- **Polls** - Interactive polls with single or multiple choice options
- **Comments** - Threaded comments with likes and pinned comments
- **Likes & Bookmarks** - Save and engage with content
- **Search** - Full-text search for users and content
- **Trending** - Discover popular creators and content
- **Link Previews** - Automatic Open Graph previews for shared links

### Creator Monetization

- **Subscription Tiers** - Multiple pricing tiers with custom benefits
- **Flexible Billing** - Monthly, quarterly, biannual, and annual subscriptions
- **Free Trials** - Configurable trial periods per tier
- **Tips & Coins** - Virtual currency system for tipping creators
- **Pay-Per-View** - Unlock individual locked posts with coins
- **Gift Subscriptions** - Purchase subscriptions for other users
- **Promo Codes** - Discount codes (percent off, fixed amount, or free trial)
- **Creator Payouts** - Withdraw earnings via Stripe Connect
- **Referral Program** - Earn rewards for referring new users

### Messaging

- **Direct Messages** - Private conversations between users
- **Media in DMs** - Share images, videos, and audio in messages
- **Voice Notes** - Record and send audio messages with waveform visualization
- **Mass Messaging** - Send targeted messages to subscriber segments
- **Subscriber-Only DMs** - Restrict DMs to paying subscribers
- **Read Receipts** - See when messages are read

### Creator Tools

- **Analytics Dashboard** - Track earnings, subscribers, and engagement
- **Scheduled Posts** - Queue posts for future publishing
- **Post Drafts** - Auto-save drafts while composing
- **Media Vault** - Organize media with folders, tags, and favorites
- **Custom Emotes** - Upload custom emotes for subscribers
- **VIP Members** - Mark special fans with VIP status
- **Creator Moderators** - Assign moderators to help manage your community
- **Subscriber Badges** - Automatic loyalty badges based on subscription tenure
- **Founding Member Badges** - Special badges for early supporters
- **Welcome Messages** - Auto-send messages to new subscribers

### Live Streaming Integration

- **Twitch Integration** - Link your Twitch account and show live status
- **Kick Integration** - Link your Kick account and show live status
- **Live Badges** - Pulsing "LIVE" indicator on avatars when streaming
- **Embedded Player** - Watch streams in a dialog without leaving the app
- **Live Notifications** - Notify followers when you go live

### Notifications

- **Real-time Notifications** - Instant updates for all activity
- **Push Notifications** - Web push support via VAPID
- **Granular Controls** - Toggle notifications by type (likes, comments, tips, etc.)
- **Email Notifications** - Configurable email alerts via Resend

### User Settings & Privacy

- **Profile Customization** - Avatar, banner, bio, and DiceBear fallbacks
- **Theme Support** - Light, dark, and system themes
- **Mute Users** - Hide users from your feed without blocking
- **Hide Posts** - Remove individual posts from your feed
- **Block Users** - Full blocking with mutual invisibility
- **Online Status** - Show/hide your online presence
- **Content Warnings** - Blur sensitive content

### Security

- **Two-Factor Authentication** - TOTP-based 2FA with backup codes
- **Session Management** - View and revoke active sessions
- **Login History** - Audit trail of login attempts with device info
- **Password Reset** - Secure email-based password recovery
- **Rate Limiting** - Protection against abuse

### Admin & Moderation

- **Admin Dashboard** - Platform overview and statistics
- **Verification Queue** - Review and approve creator verification requests
- **Report Management** - Handle user reports with resolution tracking
- **User Moderation** - Suspend, ban, or restrict users
- **Audit Logging** - Track all admin actions
- **Platform Statistics** - Real-time user, content, and revenue metrics

### Technical

- **Cloudflare R2 Storage** - Media storage with signed URLs
- **Stripe Integration** - Payments, subscriptions, and Connect payouts
- **Convex Backend** - Real-time database with automatic sync
- **PWA Support** - Installable with offline fallback
- **Responsive Design** - Mobile-first with desktop optimization

---

## Quick Start

```bash
pnpm install
npx convex dev    # Creates .env.local automatically
pnpm dev
```

## Auth Setup

Generate the auth secret (run once per deployment):

```bash
npx @convex-dev/auth
```

This generates `CONVEX_AUTH_PRIVATE_KEY` which is automatically set in your Convex deployment.

---

## Environment Variables

### Local (.env.local)

```bash
# Auto-generated by Convex
CONVEX_DEPLOYMENT=dev:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# WebPush (same key as Convex)
NEXT_PUBLIC_WEBPUSH_PUBLIC_KEY=...
```

### Convex Environment

#### Required

```bash
# Core
npx convex env set CONVEX_SITE_URL "https://your-deployment.convex.site"
npx convex env set NEXT_PUBLIC_APP_URL "https://your-app.vercel.app"

# Stripe
npx convex env set STRIPE_SECRET_KEY "sk_live_..."
npx convex env set STRIPE_WEBHOOK_SECRET "whsec_..."

# Cloudflare R2 Storage
npx convex env set R2_ACCESS_KEY_ID "..."
npx convex env set R2_SECRET_ACCESS_KEY "..."
npx convex env set R2_BUCKET "your-bucket-name"
npx convex env set R2_ENDPOINT "https://xxx.r2.cloudflarestorage.com"

# Email (Resend)
npx convex env set RESEND_API_KEY "re_..."
```

#### Optional

```bash
# WebPush Notifications (generate with: npx web-push generate-vapid-keys)
npx convex env set WEBPUSH_PUBLIC_KEY "..."
npx convex env set WEBPUSH_PRIVATE_KEY "..."
npx convex env set WEBPUSH_SUBJECT "mailto:hello@example.com"

# Twitch OAuth
npx convex env set AUTH_TWITCH_ID "..."
npx convex env set AUTH_TWITCH_SECRET "..."
npx convex env set TWITCH_CLIENT_ID "..."
npx convex env set TWITCH_CLIENT_SECRET "..."
npx convex env set TWITCH_WEBHOOK_SECRET "..."

# Kick OAuth
npx convex env set AUTH_KICK_ID "..."
npx convex env set AUTH_KICK_SECRET "..."
npx convex env set KICK_CLIENT_ID "..."
npx convex env set KICK_CLIENT_SECRET "..."
npx convex env set KICK_WEBHOOK_SECRET "..."
```

> **Note:** For WebPush, use the same public key in `.env.local` as `NEXT_PUBLIC_WEBPUSH_PUBLIC_KEY`.
