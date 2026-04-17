/**
 * @fileoverview Streaming Webhook Event Cleanup
 *
 * Provides scheduled cleanup of processed webhook events to prevent
 * unbounded growth of the deduplication table.
 *
 * Features:
 *   - Removes webhook events older than 7 days
 *   - Batch deletion to avoid transaction limits (100 per run)
 *   - Designed to be called by a cron job
 *
 * Limits:
 *   - Queries up to 1000 events per run
 *   - Deletes up to 100 events per run
 */

import { internalMutation } from "./_generated/server";

// ===== INTERNAL MUTATIONS =====

/** Remove webhook events older than 7 days to prevent table bloat */
export const cleanupWebhookEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const oldEvents = await ctx.db.query("streamingWebhookEvents").take(1000);

    const toDelete = oldEvents.filter((e) => e.processedAt < oneWeekAgo);

    let deleted = 0;
    for (const event of toDelete.slice(0, 100)) {
      await ctx.db.delete(event._id);
      deleted++;
    }

    console.log(`Cleaned up ${deleted} old streaming webhook events`);
    return { deleted };
  },
});
