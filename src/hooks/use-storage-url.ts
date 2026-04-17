import type { Id } from "@/../convex/_generated/dataModel";

/**
 * Returns the URL for a Convex storage file.
 * Uses the /api/storage endpoint which proxies to Convex storage.
 */
export function useStorageUrl(
  storageId: Id<"_storage"> | string | undefined | null
): string | null {
  if (!storageId) return null;
  return `/api/storage/${storageId}`;
}

/**
 * Non-hook version for use in non-React contexts.
 */
export function getStorageUrl(
  storageId: Id<"_storage"> | string | undefined | null
): string | null {
  if (!storageId) return null;
  return `/api/storage/${storageId}`;
}
