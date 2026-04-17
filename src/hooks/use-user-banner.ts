import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { generateBannerUrl } from "@/lib/avatar";

/**
 * User data needed to resolve banner URL
 */
export interface UserBannerData {
  // R2 key for uploaded banner
  bannerR2Key?: string | null;
  // Use username or _id as seed for generated banner
  username?: string | null;
  _id?: string;
}

/**
 * Returns the banner URL for a user.
 * Priority:
 * 1. Uploaded banner (bannerR2Key) - uses R2 signed URL
 * 2. Generated DiceBear Glass banner - uses username or _id as seed
 */
export function useUserBanner(user: UserBannerData | null | undefined): string | null {
  // Fetch signed URL from R2 if we have an R2 key
  const signedUrl = useQuery(
    api.media.getBannerUrl,
    user?.bannerR2Key ? { r2Key: user.bannerR2Key } : "skip"
  );

  if (!user) return null;

  // Priority 1: Uploaded banner from R2
  if (user.bannerR2Key && signedUrl) {
    return signedUrl;
  }

  // Priority 2: Generated DiceBear Glass banner
  const seed = user.username || user._id;
  if (seed) {
    return generateBannerUrl({ seed });
  }

  return null;
}

/**
 * Non-hook version for use in non-React contexts or server components.
 * Note: This cannot fetch R2 signed URLs - returns DiceBear URL only.
 * Use useUserBanner hook in React components for full functionality.
 */
export function getUserBannerUrl(user: UserBannerData | null | undefined): string | null {
  if (!user) return null;

  // Cannot fetch R2 URL without hook - return null if user has R2 banner
  if (user.bannerR2Key) {
    return null;
  }

  // Generated DiceBear Glass banner
  const seed = user.username || user._id;
  if (seed) {
    return generateBannerUrl({ seed });
  }

  return null;
}
