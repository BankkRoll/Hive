"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LiveBadge } from "./live-badge";
import { cn } from "@/lib/utils";

interface LiveAvatarProps {
  userId: Id<"users">;
  avatarR2Key?: string;
  displayName?: string;
  username?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  onLiveClick?: () => void;
}

export function LiveAvatar({
  userId,
  avatarR2Key,
  displayName,
  username,
  size = "md",
  className,
  onLiveClick,
}: LiveAvatarProps) {
  const liveStatus = useQuery(api.streaming.getLiveStatus, { userId });

  const sizeClasses = {
    sm: "size-8",
    md: "size-10",
    lg: "size-14",
    xl: "size-20",
  };

  const ringClasses = {
    sm: "ring-2 ring-offset-1",
    md: "ring-2 ring-offset-2",
    lg: "ring-[3px] ring-offset-2",
    xl: "ring-4 ring-offset-2",
  };

  const badgePositions = {
    sm: "-bottom-1 -right-1",
    md: "-bottom-1 -right-1",
    lg: "-bottom-2 -right-2",
    xl: "-bottom-2 -right-2",
  };

  const isLive = !!liveStatus;

  return (
    <div className={cn("relative inline-block", className)}>
      <UserAvatar
        user={{ avatarR2Key, displayName, username, _id: userId }}
        className={cn(
          sizeClasses[size],
          isLive && ringClasses[size],
          isLive && "ring-red-500 ring-offset-background"
        )}
      />

      {isLive && (
        <div className={cn("absolute", badgePositions[size])}>
          <LiveBadge
            size={size === "sm" ? "sm" : size === "xl" ? "md" : "sm"}
            onClick={onLiveClick}
          />
        </div>
      )}
    </div>
  );
}
