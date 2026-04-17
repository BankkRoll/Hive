"use client";

import { Avatar, AvatarImage, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { useUserAvatar, getUserInitials, type UserAvatarData } from "@/hooks/use-user-avatar";
import { OnlineIndicator } from "@/components/ui/online-indicator";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  user:
    | (UserAvatarData & {
        displayName?: string | null;
        username?: string | null;
        isVerified?: boolean;
      })
    | null
    | undefined;
  size?: "sm" | "default" | "lg";
  className?: string;
  style?: React.CSSProperties;
  showBadge?: boolean;
  badgeContent?: React.ReactNode;
  // Online status indicator
  showOnlineIndicator?: boolean;
  isOnline?: boolean;
}

/**
 * Unified user avatar component.
 * Automatically handles:
 * - Uploaded avatars (from R2 storage with signed URLs)
 * - DiceBear generated avatars
 * - Initials fallback
 * - Online status indicator (optional)
 */
export function UserAvatar({
  user,
  size = "default",
  className,
  style,
  showBadge,
  badgeContent,
  showOnlineIndicator = false,
  isOnline = false,
}: UserAvatarProps) {
  const avatarUrl = useUserAvatar(user, size === "lg" ? 128 : size === "sm" ? 48 : 64);
  const initials = getUserInitials(user);

  // Map avatar size to indicator size
  const indicatorSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";

  // Position classes for the online indicator
  const indicatorPosition = size === "lg" ? "bottom-0.5 right-0.5" : "bottom-0 right-0";

  return (
    <Avatar size={size} className={cn("relative", className)} style={style}>
      {avatarUrl && (
        <AvatarImage src={avatarUrl} alt={user?.displayName || user?.username || "User"} />
      )}
      <AvatarFallback>{initials}</AvatarFallback>
      {showBadge && badgeContent && <AvatarBadge>{badgeContent}</AvatarBadge>}
      {showOnlineIndicator && (
        <OnlineIndicator isOnline={isOnline} size={indicatorSize} className={indicatorPosition} />
      )}
    </Avatar>
  );
}
