/**
 * @fileoverview Media Actions Module
 *
 * Node.js runtime actions for R2 storage operations.
 *
 * Features:
 *   - Delete files from R2
 *   - Store files from URL to R2
 *
 * Note: These are internal actions used by other modules.
 */

"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";

const r2 = new R2(components.r2);

// ===== INTERNAL ACTIONS =====

/** Delete file from R2 */
export const deleteFromR2 = internalAction({
  args: { r2Key: v.string() },
  handler: async (ctx, args) => {
    await r2.deleteObject(ctx, args.r2Key);
  },
});

/** Store file from URL to R2 */
export const storeFromUrl = internalAction({
  args: {
    url: v.string(),
    key: v.optional(v.string()),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const response = await fetch(args.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const blob = await response.blob();
    const key = await r2.store(ctx, blob, {
      key: args.key,
      type: args.contentType,
    });

    return key;
  },
});
