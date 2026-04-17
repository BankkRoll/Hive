/**
 * @fileoverview Link Previews Module
 *
 * Fetches and caches Open Graph/meta data for URLs in posts.
 *
 * Features:
 *   - Fetch title, description, image from URLs
 *   - 7-day caching with automatic expiration
 *   - Batch fetch for multiple URLs
 *   - URL extraction from text
 *
 * Security:
 *   - Blocked internal/private IP domains
 *   - Max URL length enforcement (2048 chars)
 *   - 10 second fetch timeout
 *   - HTML-only content processing
 *   - Response size limit (500KB)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalAction } from "./_generated/server";
import { getAuthUserId } from "./auth";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_URL_LENGTH = 2048;

const BLOCKED_DOMAINS = ["localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10.", "172.16."];

// ===== QUERIES =====

/** Get cached link preview */
export const get = query({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const normalizedUrl = normalizeUrl(args.url);
    if (!normalizedUrl) return null;

    const cached = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", normalizedUrl))
      .first();

    if (!cached || cached.expiresAt < Date.now()) return null;

    return cached;
  },
});

/** Get multiple link previews */
export const getMultiple = query({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, args) => {
    const results: Record<string, Doc<"linkPreviews"> | null> = {};

    await Promise.all(
      args.urls.map(async (url) => {
        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) {
          results[url] = null;
          return;
        }

        const cached = await ctx.db
          .query("linkPreviews")
          .withIndex("by_url", (q) => q.eq("url", normalizedUrl))
          .first();

        results[url] = cached && cached.expiresAt >= Date.now() ? cached : null;
      })
    );

    return results;
  },
});

/** Extract URLs from text */
export const extractUrls = query({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const matches = args.text.match(urlRegex) || [];

    const validUrls = matches
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => url !== null && !isBlockedDomain(url));

    return [...new Set(validUrls)];
  },
});

// ===== MUTATIONS =====

/** Request a link preview fetch */
export const requestFetch = mutation({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const normalizedUrl = normalizeUrl(args.url);
    if (!normalizedUrl) throw new Error("Invalid URL");

    if (isBlockedDomain(normalizedUrl)) {
      throw new Error("This domain is not allowed");
    }

    const existing = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", normalizedUrl))
      .first();

    if (existing && existing.expiresAt >= Date.now()) {
      return { cached: true, preview: existing };
    }

    await ctx.scheduler.runAfter(0, internal.linkPreviews.fetchPreview, {
      url: normalizedUrl,
    });

    return { cached: false, fetching: true };
  },
});

/** Batch fetch link previews */
export const batchFetch = mutation({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const urls = args.urls.slice(0, 5);
    const results: Record<string, { cached: boolean; preview?: Doc<"linkPreviews"> }> = {};

    await Promise.all(
      urls.map(async (url) => {
        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl || isBlockedDomain(normalizedUrl)) {
          results[url] = { cached: false };
          return;
        }

        const existing = await ctx.db
          .query("linkPreviews")
          .withIndex("by_url", (q) => q.eq("url", normalizedUrl))
          .first();

        if (existing && existing.expiresAt >= Date.now()) {
          results[url] = { cached: true, preview: existing };
        } else {
          await ctx.scheduler.runAfter(0, internal.linkPreviews.fetchPreview, {
            url: normalizedUrl,
          });
          results[url] = { cached: false };
        }
      })
    );

    return results;
  },
});

// ===== INTERNAL =====

/** Fetch link preview data */
export const fetchPreview = internalAction({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(args.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`Failed to fetch ${args.url}: ${response.status}`);
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        console.log(`Skipping non-HTML content for ${args.url}`);
        return;
      }

      const text = await response.text();
      const truncated = text.slice(0, 500 * 1024);

      const metadata = parseMetadata(truncated, args.url);

      await ctx.runMutation(internal.linkPreviews.savePr, {
        url: args.url,
        title: metadata.title,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        siteName: metadata.siteName,
      });
    } catch (error) {
      console.error(`Error fetching link preview for ${args.url}:`, error);
    }
  },
});

/** Save link preview to database */
export const savePr = internalMutation({
  args: {
    url: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    siteName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        imageUrl: args.imageUrl,
        siteName: args.siteName,
        fetchedAt: now,
        expiresAt: now + CACHE_DURATION_MS,
      });
      return existing._id;
    }

    return await ctx.db.insert("linkPreviews", {
      url: args.url,
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      siteName: args.siteName,
      fetchedAt: now,
      expiresAt: now + CACHE_DURATION_MS,
    });
  },
});

/** Cleanup expired link previews */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expired = await ctx.db
      .query("linkPreviews")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(500);

    let deleted = 0;
    for (const preview of expired) {
      await ctx.db.delete(preview._id);
      deleted++;
    }

    return { deleted };
  },
});

// ===== HELPERS =====

/** Normalize URL for consistent caching */
function normalizeUrl(url: string): string | null {
  try {
    if (url.length > MAX_URL_LENGTH) return null;

    let normalized = url.trim();
    if (!normalized.match(/^https?:\/\//i)) {
      normalized = "https://" + normalized;
    }

    const parsed = new URL(normalized);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    let result = parsed.href;
    if (result.endsWith("/") && parsed.pathname === "/") {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    return null;
  }
}

/** Check if domain is blocked */
function isBlockedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return BLOCKED_DOMAINS.some((blocked) => hostname.includes(blocked) || hostname === blocked);
  } catch {
    return true;
  }
}

/** Parse Open Graph and meta tags from HTML */
function parseMetadata(
  html: string,
  url: string
): {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
} {
  const metadata: {
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
  } = {};

  const ogTitle =
    extractMetaContent(html, 'property="og:title"') ||
    extractMetaContent(html, "property='og:title'");
  const ogDescription =
    extractMetaContent(html, 'property="og:description"') ||
    extractMetaContent(html, "property='og:description'");
  const ogImage =
    extractMetaContent(html, 'property="og:image"') ||
    extractMetaContent(html, "property='og:image'");
  const ogSiteName =
    extractMetaContent(html, 'property="og:site_name"') ||
    extractMetaContent(html, "property='og:site_name'");

  const twitterTitle =
    extractMetaContent(html, 'name="twitter:title"') ||
    extractMetaContent(html, "name='twitter:title'");
  const twitterDescription =
    extractMetaContent(html, 'name="twitter:description"') ||
    extractMetaContent(html, "name='twitter:description'");
  const twitterImage =
    extractMetaContent(html, 'name="twitter:image"') ||
    extractMetaContent(html, "name='twitter:image'");

  const metaDescription =
    extractMetaContent(html, 'name="description"') ||
    extractMetaContent(html, "name='description'");

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const htmlTitle = titleMatch ? titleMatch[1].trim() : undefined;

  metadata.title = truncate(decodeHtmlEntities(ogTitle || twitterTitle || htmlTitle), 200);
  metadata.description = truncate(
    decodeHtmlEntities(ogDescription || twitterDescription || metaDescription),
    500
  );
  metadata.siteName = truncate(decodeHtmlEntities(ogSiteName), 100);

  const rawImage = ogImage || twitterImage;
  if (rawImage) {
    metadata.imageUrl = resolveUrl(rawImage, url);
  }

  return metadata;
}

/** Extract meta tag content */
function extractMetaContent(html: string, attributePattern: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]*${attributePattern}[^>]*content="([^"]*)"`, "i"),
    new RegExp(`<meta[^>]*${attributePattern}[^>]*content='([^']*)'`, "i"),
    new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attributePattern}`, "i"),
    new RegExp(`<meta[^>]*content='([^']*)'[^>]*${attributePattern}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1].trim();
  }

  return undefined;
}

/** Resolve relative URL to absolute */
function resolveUrl(relativeUrl: string, baseUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

/** Decode HTML entities */
function decodeHtmlEntities(text: string | undefined): string | undefined {
  if (!text) return undefined;

  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Truncate text to max length */
function truncate(text: string | undefined, maxLength: number): string | undefined {
  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
