"use client";

import { useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ChevronLeft, ChevronRight, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { StoryViewer } from "./story-viewer";
import { StoryCreationDialog } from "./story-creation-dialog";

interface StoryUser {
  _id: Id<"users">;
  username?: string;
  displayName?: string;
  avatarR2Key?: string;
  isVerified?: boolean;
}

interface UserStoryGroup {
  user: StoryUser;
  stories: Array<{
    _id: Id<"stories">;
    mediaUrl: string | null;
    mediaType: "image" | "video";
    isViewed: boolean;
    createdAt: number;
  }>;
  hasUnviewed: boolean;
}

export function StoriesRow() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const storyFeed = useQuery(api.stories.getFeed, { limit: 30 });

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const handleStoryClick = (userId: Id<"users">) => {
    setSelectedUserId(userId);
    setViewerOpen(true);
  };

  // Don't show internal skeleton - parent handles loading state
  // This prevents double-skeleton flash
  if (storyFeed === undefined) {
    return null;
  }

  // No stories - show add button only
  if (storyFeed.length === 0) {
    return (
      <>
        <div className="border-b border-border">
          <div className="flex items-center gap-4 px-4 py-4">
            <AddStoryButton onClick={() => setCreateDialogOpen(true)} />
          </div>
        </div>
        <StoryCreationDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      </>
    );
  }

  // Cast to proper type since API returns user as unknown
  const typedStoryFeed = storyFeed as UserStoryGroup[];
  const userIds = typedStoryFeed.map((group) => group.user._id);

  return (
    <>
      <div className="relative border-b border-border bg-card/50 backdrop-blur-sm">
        {/* Scroll buttons (desktop only) */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 hidden lg:flex size-8 bg-background/80 backdrop-blur shadow-md"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 hidden lg:flex size-8 bg-background/80 backdrop-blur shadow-md"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="size-4" />
        </Button>

        {/* Stories scroll container */}
        <div
          ref={scrollRef}
          className="flex items-center gap-4 px-4 py-4 overflow-x-auto no-scrollbar scroll-smooth"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {/* Add Story Button */}
          <AddStoryButton onClick={() => setCreateDialogOpen(true)} />

          {/* User Story Circles */}
          {typedStoryFeed.map((group) => (
            <StoryCircle
              key={group.user._id}
              user={group.user}
              hasUnviewed={group.hasUnviewed}
              onClick={() => handleStoryClick(group.user._id)}
            />
          ))}
        </div>
      </div>

      {/* Story Viewer */}
      <StoryViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        initialUserId={selectedUserId ?? undefined}
        userIds={userIds}
      />

      {/* Story Creation Dialog */}
      <StoryCreationDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </>
  );
}

interface AddStoryButtonProps {
  onClick: () => void;
}

function AddStoryButton({ onClick }: AddStoryButtonProps) {
  return (
    <button
      className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
      style={{ scrollSnapAlign: "start" }}
      onClick={onClick}
    >
      <div className="relative p-0.5 rounded-full bg-muted">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center ring-2 ring-background group-hover:bg-muted/80 transition-colors">
          <Plus className="size-6 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
      <span className="text-[11px] font-medium text-center text-muted-foreground">Add Story</span>
    </button>
  );
}

interface StoryCircleProps {
  user: StoryUser;
  hasUnviewed: boolean;
  onClick: () => void;
}

function StoryCircle({ user, hasUnviewed, onClick }: StoryCircleProps) {
  return (
    <button
      className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
      style={{ scrollSnapAlign: "start" }}
      onClick={onClick}
    >
      <div
        className={cn(
          "relative p-0.5 rounded-full transition-transform group-hover:scale-105",
          hasUnviewed ? "bg-gradient-to-tr from-primary via-pink-500 to-orange-400" : "bg-muted"
        )}
      >
        <UserAvatar user={user} className="size-16 ring-2 ring-background" />

        {/* Verified badge */}
        {user.isVerified && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5">
            <BadgeCheck className="size-4 text-primary fill-primary/20" />
          </div>
        )}
      </div>
      <span className="text-[11px] font-medium text-center max-w-[64px] truncate">
        {user.displayName || user.username || "User"}
      </span>
    </button>
  );
}

export function StoriesRowSkeleton() {
  return (
    <div className="border-b border-border bg-card/50">
      <div className="flex items-center gap-4 px-4 py-4 overflow-hidden">
        {/* Add Story skeleton */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-3 w-14" />
        </div>

        {/* Story circles skeleton */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
