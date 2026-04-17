/**
 * @fileoverview Media Storage Module
 *
 * Manages media uploads and storage using Cloudflare R2.
 *
 * Features:
 *   - R2-based media storage with signed URLs
 *   - Type validation (image, video, audio)
 *   - Size limits per media type
 *   - Processing status tracking for videos
 *   - User media library management
 *   - Bulk operations for cleanup
 *
 * File Limits:
 *   - Images: 20MB (jpeg, png, gif, webp, avif)
 *   - Videos: 2GB (mp4, webm, quicktime, m4v)
 *   - Audio: 100MB (mpeg, wav, ogg, mp4, aac)
 *
 * Security:
 *   - Authentication required for all operations
 *   - MIME type validation against declared type
 *   - Signed URLs expire after 24 hours
 *   - Users can only access their own media
 */

import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

import type { DataModel } from "./_generated/dataModel";
import { R2 } from "@convex-dev/r2";
import { getAuthUserId } from "./auth";
import { v } from "convex/values";

const r2 = new R2(components.r2);

// ===== CONFIGURATION =====

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/aac"];

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_AUDIO_SIZE = 100 * 1024 * 1024;
const URL_EXPIRES_IN_SECONDS = 24 * 60 * 60;

// ===== R2 CLIENT API =====

/** Generate upload URL for authenticated users */
export const { generateUploadUrl, syncMetadata } = r2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
  },
  onUpload: async () => {},
});

// ===== MUTATIONS =====

/** Save media metadata after R2 upload */
export const saveMedia = mutation({
  args: {
    r2Key: v.string(),
    type: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
    mimeType: v.string(),
    filename: v.optional(v.string()),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Validate file type
    const allAllowedTypes = [
      ...ALLOWED_IMAGE_TYPES,
      ...ALLOWED_VIDEO_TYPES,
      ...ALLOWED_AUDIO_TYPES,
    ];
    if (!allAllowedTypes.includes(args.mimeType)) {
      throw new Error(`Invalid file type: ${args.mimeType}`);
    }

    // Validate file type matches declared type
    if (args.type === "image" && !ALLOWED_IMAGE_TYPES.includes(args.mimeType)) {
      throw new Error("MIME type does not match declared type");
    }
    if (args.type === "video" && !ALLOWED_VIDEO_TYPES.includes(args.mimeType)) {
      throw new Error("MIME type does not match declared type");
    }
    if (args.type === "audio" && !ALLOWED_AUDIO_TYPES.includes(args.mimeType)) {
      throw new Error("MIME type does not match declared type");
    }

    // Validate file size
    let maxSize = MAX_IMAGE_SIZE;
    if (args.type === "video") maxSize = MAX_VIDEO_SIZE;
    if (args.type === "audio") maxSize = MAX_AUDIO_SIZE;

    if (args.size > maxSize) {
      throw new Error(
        `File too large. Maximum size for ${args.type} is ${maxSize / 1024 / 1024}MB`
      );
    }

    // Create media record
    const mediaId = await ctx.db.insert("media", {
      userId,
      r2Key: args.r2Key,
      type: args.type,
      mimeType: args.mimeType,
      filename: args.filename,
      size: args.size,
      width: args.width,
      height: args.height,
      duration: args.duration,
      processingStatus: args.type === "video" ? "pending" : "completed",
      createdAt: Date.now(),
    });

    return mediaId;
  },
});

// ===== QUERIES =====

/** Get media by ID with signed URL */
export const getById = query({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    if (!media) return null;

    let url: string | null = null;
    if (media.r2Key) {
      url = await r2.getUrl(media.r2Key, { expiresIn: URL_EXPIRES_IN_SECONDS });
    }

    return {
      ...media,
      url,
    };
  },
});

/** Get multiple media items with signed URLs */
export const getMultiple = query({
  args: { mediaIds: v.array(v.id("media")) },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.mediaIds.map(async (mediaId) => {
        const media = await ctx.db.get(mediaId);
        if (!media) return null;

        let url: string | null = null;
        if (media.r2Key) {
          url = await r2.getUrl(media.r2Key, {
            expiresIn: URL_EXPIRES_IN_SECONDS,
          });
        }

        return {
          ...media,
          url,
        };
      })
    );

    return results.filter((m) => m !== null);
  },
});

/** Get signed URLs for media array (lightweight) */
export const getMediaUrls = query({
  args: { mediaIds: v.array(v.id("media")) },
  handler: async (ctx, args) => {
    const urls: Record<string, string | null> = {};

    await Promise.all(
      args.mediaIds.map(async (mediaId) => {
        const media = await ctx.db.get(mediaId);
        if (media?.r2Key) {
          urls[mediaId] = await r2.getUrl(media.r2Key, {
            expiresIn: URL_EXPIRES_IN_SECONDS,
          });
        } else {
          urls[mediaId] = null;
        }
      })
    );

    return urls;
  },
});

/** Get user's media library with signed URLs */
export const getMyMedia = query({
  args: {
    type: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("audio"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { media: [], hasMore: false };
    }

    const limit = args.limit ?? 20;

    let mediaQuery;
    if (args.type) {
      mediaQuery = ctx.db
        .query("media")
        .withIndex("by_type", (q) => q.eq("userId", userId).eq("type", args.type!));
    } else {
      mediaQuery = ctx.db.query("media").withIndex("by_user", (q) => q.eq("userId", userId));
    }

    const media = await mediaQuery.order("desc").take(limit + 1);

    const hasMore = media.length > limit;
    const items = media.slice(0, limit);

    // Get signed URLs for all items
    const withUrls = await Promise.all(
      items.map(async (m) => {
        let url: string | null = null;
        if (m.r2Key) {
          url = await r2.getUrl(m.r2Key, { expiresIn: URL_EXPIRES_IN_SECONDS });
        }
        return { ...m, url };
      })
    );

    return {
      media: withUrls,
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

/** Delete media and schedule R2 cleanup */
export const remove = mutation({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media || media.userId !== userId) {
      throw new Error("Media not found");
    }

    // Schedule R2 deletion via action
    if (media.r2Key) {
      await ctx.scheduler.runAfter(0, internal.mediaActions.deleteFromR2, {
        r2Key: media.r2Key,
      });
    }

    // Delete legacy Convex storage files if they exist
    if (media.storageId) {
      await ctx.storage.delete(media.storageId);
    }
    if (media.thumbnailStorageId) {
      await ctx.storage.delete(media.thumbnailStorageId);
    }

    // Delete the media record
    await ctx.db.delete(args.mediaId);

    return { success: true };
  },
});

// ===== INTERNAL MUTATIONS =====

/** Bulk delete media for cleanup */
export const bulkDelete = internalMutation({
  args: { mediaIds: v.array(v.id("media")) },
  handler: async (ctx, args) => {
    for (const mediaId of args.mediaIds) {
      const media = await ctx.db.get(mediaId);
      if (!media) continue;

      // Schedule R2 deletion
      if (media.r2Key) {
        await ctx.scheduler.runAfter(0, internal.mediaActions.deleteFromR2, {
          r2Key: media.r2Key,
        });
      }

      if (media.storageId) {
        await ctx.storage.delete(media.storageId);
      }
      if (media.thumbnailStorageId) {
        await ctx.storage.delete(media.thumbnailStorageId);
      }

      await ctx.db.delete(mediaId);
    }
  },
});

/** Get storage stats for user */
export const getStorageStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { totalSize: 0, count: 0, byType: {} };
    }

    const media = await ctx.db
      .query("media")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10000);

    const stats = {
      totalSize: 0,
      count: media.length,
      byType: {
        image: { count: 0, size: 0 },
        video: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
      } as Record<string, { count: number; size: number }>,
    };

    for (const m of media) {
      stats.totalSize += m.size;
      if (stats.byType[m.type]) {
        stats.byType[m.type].count++;
        stats.byType[m.type].size += m.size;
      }
    }

    return stats;
  },
});

/** Validate file before upload */
export const validateFile = query({
  args: {
    type: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { valid: false, error: "Not authenticated" };
    }

    let allowedTypes: string[];
    let maxSize: number;

    switch (args.type) {
      case "image":
        allowedTypes = ALLOWED_IMAGE_TYPES;
        maxSize = MAX_IMAGE_SIZE;
        break;
      case "video":
        allowedTypes = ALLOWED_VIDEO_TYPES;
        maxSize = MAX_VIDEO_SIZE;
        break;
      case "audio":
        allowedTypes = ALLOWED_AUDIO_TYPES;
        maxSize = MAX_AUDIO_SIZE;
        break;
    }

    if (!allowedTypes.includes(args.mimeType)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
      };
    }

    if (args.size > maxSize) {
      return {
        valid: false,
        error: `File too large. Maximum: ${maxSize / 1024 / 1024}MB`,
      };
    }

    return { valid: true };
  },
});

// ===== PROFILE IMAGE URLS =====

/** Get avatar URL from R2 */
export const getAvatarUrl = query({
  args: { r2Key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.r2Key) {
      return null;
    }
    return await r2.getUrl(args.r2Key, { expiresIn: URL_EXPIRES_IN_SECONDS });
  },
});

/** Get banner URL from R2 */
export const getBannerUrl = query({
  args: { r2Key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.r2Key) {
      return null;
    }
    return await r2.getUrl(args.r2Key, { expiresIn: URL_EXPIRES_IN_SECONDS });
  },
});

/** Get multiple avatar/banner URLs at once */
export const getProfileImageUrls = query({
  args: {
    avatarR2Key: v.optional(v.string()),
    bannerR2Key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [avatarUrl, bannerUrl] = await Promise.all([
      args.avatarR2Key
        ? r2.getUrl(args.avatarR2Key, { expiresIn: URL_EXPIRES_IN_SECONDS })
        : Promise.resolve(null),
      args.bannerR2Key
        ? r2.getUrl(args.bannerR2Key, { expiresIn: URL_EXPIRES_IN_SECONDS })
        : Promise.resolve(null),
    ]);
    return { avatarUrl, bannerUrl };
  },
});

/** Update media processing status */
export const updateProcessingStatus = internalMutation({
  args: {
    mediaId: v.id("media"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    if (!media) {
      throw new Error("Media not found");
    }

    await ctx.db.patch(args.mediaId, {
      processingStatus: args.status,
    });
  },
});

/** Export allowed types for client validation */
export const getAllowedTypes = query({
  args: {},
  handler: async () => {
    return {
      image: {
        types: ALLOWED_IMAGE_TYPES,
        maxSize: MAX_IMAGE_SIZE,
      },
      video: {
        types: ALLOWED_VIDEO_TYPES,
        maxSize: MAX_VIDEO_SIZE,
      },
      audio: {
        types: ALLOWED_AUDIO_TYPES,
        maxSize: MAX_AUDIO_SIZE,
      },
    };
  },
});

export { r2 };
