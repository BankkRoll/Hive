"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LiveBadge } from "./live-badge";
import { ExternalLink, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface StreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stream: {
    userId: Id<"users">;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    platform: "twitch" | "kick";
    title?: string;
    viewerCount?: number;
  } | null;
}

export function StreamDialog({ open, onOpenChange, stream }: StreamDialogProps) {
  const [isLoading, setIsLoading] = useState(true);

  if (!stream) return null;

  const getPlatformUrl = () => {
    if (stream.platform === "twitch") {
      return `https://twitch.tv/${stream.username}`;
    }
    return `https://kick.com/${stream.username}`;
  };

  const getEmbedUrl = () => {
    if (stream.platform === "twitch") {
      // Twitch requires parent domain for embedding
      const parent = typeof window !== "undefined" ? window.location.hostname : "localhost";
      return `https://player.twitch.tv/?channel=${stream.username}&parent=${parent}&muted=true`;
    }
    // Kick embed URL
    return `https://kick.com/${stream.username}/embed`;
  };

  const getPlatformIcon = () => {
    if (stream.platform === "twitch") {
      return (
        <svg viewBox="0 0 24 24" className="size-5 fill-[#9146FF]">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" className="size-5 fill-[#53FC18]">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
      </svg>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserAvatar user={stream} className="size-10" />
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base">
                    {stream.displayName || stream.username}
                  </DialogTitle>
                  <LiveBadge size="sm" />
                </div>
                {stream.title && (
                  <p className="text-sm text-muted-foreground line-clamp-1">{stream.title}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {stream.viewerCount !== undefined && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="size-4" />
                  <span>{stream.viewerCount.toLocaleString()}</span>
                </div>
              )}
              <a
                href={getPlatformUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
              >
                {getPlatformIcon()}
                <span>Watch on {stream.platform === "twitch" ? "Twitch" : "Kick"}</span>
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </DialogHeader>

        <div className="relative aspect-video bg-black">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading stream...</p>
              </div>
            </div>
          )}
          <iframe
            src={getEmbedUrl()}
            className={cn("absolute inset-0 w-full h-full", isLoading && "opacity-0")}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
