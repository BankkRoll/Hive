import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  generateAvatarUrl,
  type AvatarBgColor,
  type AvatarEyes,
  type AvatarMouth,
} from "@/lib/avatar";

/**
 * User data needed to resolve avatar URL
 */
export interface UserAvatarData {
  // R2 key for uploaded avatar
  avatarR2Key?: string | null;
  // DiceBear avatar customization
  dicebearSeed?: string | null;
  dicebearBgColor?: string | null;
  dicebearEyes?: string | null;
  dicebearMouth?: string | null;
  // Fallback to user ID if no dicebear seed
  _id?: string;
  username?: string | null;
}

/**
 * Returns the avatar URL for a user.
 * Priority:
 * 1. Uploaded avatar (avatarR2Key) - uses R2 signed URL
 * 2. DiceBear avatar (dicebearSeed) - uses DiceBear URL with customizations
 * 3. DiceBear with username/user ID as seed - fallback if no seed set
 * 4. null - no avatar available, component should show initials fallback
 */
export function useUserAvatar(
  user: UserAvatarData | null | undefined,
  size?: number
): string | null {
  // Fetch signed URL from R2 if we have an R2 key
  const signedUrl = useQuery(
    api.media.getAvatarUrl,
    user?.avatarR2Key ? { r2Key: user.avatarR2Key } : "skip"
  );

  if (!user) return null;

  // Priority 1: Uploaded avatar from R2
  if (user.avatarR2Key && signedUrl) {
    return signedUrl;
  }

  // Priority 2: DiceBear avatar with seed
  // Use username as fallback for more stable/readable avatar generation
  const seed = user.dicebearSeed || user.username || user._id;
  if (seed) {
    return generateAvatarUrl({
      seed,
      backgroundColor: (user.dicebearBgColor as AvatarBgColor) || undefined,
      eyes: (user.dicebearEyes as AvatarEyes) || undefined,
      mouth: (user.dicebearMouth as AvatarMouth) || undefined,
      size: size || 128,
    });
  }

  return null;
}

/**
 * Non-hook version for use in non-React contexts or server components.
 * Note: This cannot fetch R2 signed URLs - returns DiceBear URL only.
 * Use useUserAvatar hook in React components for full functionality.
 */
export function getUserAvatarUrl(
  user: UserAvatarData | null | undefined,
  size?: number
): string | null {
  if (!user) return null;

  // Cannot fetch R2 URL without hook - check if avatarR2Key exists
  // Return null so component knows to use a loading state or call the query
  if (user.avatarR2Key) {
    // Return null - component should use useUserAvatar hook instead
    // Or call api.media.getAvatarUrl query directly
    return null;
  }

  // DiceBear avatar with seed
  const seed = user.dicebearSeed || user.username || user._id;
  if (seed) {
    return generateAvatarUrl({
      seed,
      backgroundColor: (user.dicebearBgColor as AvatarBgColor) || undefined,
      eyes: (user.dicebearEyes as AvatarEyes) || undefined,
      mouth: (user.dicebearMouth as AvatarMouth) || undefined,
      size: size || 128,
    });
  }

  return null;
}

/**
 * Get initials from user data for fallback display
 */
export function getUserInitials(
  user: { displayName?: string | null; username?: string | null } | null | undefined
): string {
  if (!user) return "?";

  if (user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return user.displayName[0].toUpperCase();
  }

  if (user.username) {
    return user.username[0].toUpperCase();
  }

  return "?";
}
