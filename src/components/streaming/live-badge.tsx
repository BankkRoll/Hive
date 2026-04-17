"use client";

import { cn } from "@/lib/utils";

interface LiveBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
}

export function LiveBadge({ size = "md", className, onClick }: LiveBadgeProps) {
  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
    lg: "text-sm px-2.5 py-1",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 font-bold uppercase tracking-wide rounded",
        "bg-red-600 text-white",
        "animate-pulse",
        sizeClasses[size],
        onClick && "cursor-pointer hover:bg-red-700 transition-colors",
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
      </span>
      LIVE
    </button>
  );
}
