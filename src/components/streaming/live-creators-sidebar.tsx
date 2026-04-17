"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LiveBadge } from "./live-badge";
import { StreamDialog } from "./stream-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio } from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../convex/_generated/dataModel";

interface LiveCreator {
  userId: Id<"users">;
  username?: string;
  displayName?: string;
  avatarR2Key?: string;
  isVerified?: boolean;
  platform: "twitch" | "kick";
  title?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
  startedAt?: number;
}

export function LiveCreatorsSidebar() {
  const liveCreators = useQuery(api.streaming.getLiveFollowedCreators);
  const [selectedStream, setSelectedStream] = useState<LiveCreator | null>(null);

  if (liveCreators === undefined) {
    return <LiveCreatorsSidebarSkeleton />;
  }

  if (liveCreators.length === 0) {
    return null; // Don't show section if no one is live
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-2">
          <Radio className="size-4 text-red-500" />
          <h3 className="font-semibold text-sm">Live Now</h3>
          <span className="text-xs text-muted-foreground">({liveCreators.length})</span>
        </div>

        <div className="space-y-1">
          {liveCreators
            .filter((c): c is NonNullable<typeof c> => c !== null)
            .map((creator) => (
              <button
                key={creator.userId}
                onClick={() => setSelectedStream(creator as LiveCreator)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <div className="relative">
                  <UserAvatar
                    user={creator}
                    className="size-9 ring-2 ring-red-500 ring-offset-2 ring-offset-background"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate">
                      {creator.displayName || creator.username}
                    </span>
                    <LiveBadge size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {creator.viewerCount?.toLocaleString() || 0} viewers
                  </p>
                </div>

                <div className="flex-shrink-0">
                  {creator.platform === "twitch" ? (
                    <svg viewBox="0 0 24 24" className="size-4 fill-[#9146FF]">
                      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="size-4 fill-[#53FC18]">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
        </div>
      </div>

      <StreamDialog
        open={!!selectedStream}
        onOpenChange={(open) => !open && setSelectedStream(null)}
        stream={selectedStream}
      />
    </>
  );
}

function LiveCreatorsSidebarSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-2">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-1">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
