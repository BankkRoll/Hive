"use client";

import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  showOffline?: boolean;
}

const sizeClasses = {
  sm: "size-2",
  md: "size-2.5",
  lg: "size-3",
};

const ringClasses = {
  sm: "ring-1",
  md: "ring-2",
  lg: "ring-2",
};

export function OnlineIndicator({
  isOnline,
  size = "md",
  className,
  showOffline = false,
}: OnlineIndicatorProps) {
  // Don't render anything if offline and not showing offline state
  if (!isOnline && !showOffline) {
    return null;
  }

  return (
    <span
      className={cn(
        "absolute rounded-full ring-background",
        sizeClasses[size],
        ringClasses[size],
        isOnline ? "bg-green-500" : "bg-muted-foreground/50",
        className
      )}
      title={isOnline ? "Online" : "Offline"}
    />
  );
}

interface OnlineStatusTextProps {
  isOnline: boolean;
  lastActiveText?: string;
  className?: string;
}

export function OnlineStatusText({ isOnline, lastActiveText, className }: OnlineStatusTextProps) {
  if (isOnline) {
    return <span className={cn("text-green-500 text-xs font-medium", className)}>Online</span>;
  }

  if (lastActiveText) {
    return <span className={cn("text-muted-foreground text-xs", className)}>{lastActiveText}</span>;
  }

  return null;
}
