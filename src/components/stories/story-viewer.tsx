"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  Send,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Pause,
  Play,
  BadgeCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface StoryViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUserId?: Id<"users">;
  userIds: Id<"users">[];
}

const STORY_DURATION = 5000; // 5 seconds per story

export function StoryViewer({ open, onOpenChange, initialUserId, userIds }: StoryViewerProps) {
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const currentUserId = userIds[currentUserIndex];
  const storiesList = useQuery(
    api.stories.getUserStories,
    currentUserId ? { userId: currentUserId } : "skip"
  );
  const currentUserData = useQuery(
    api.users.getById,
    currentUserId ? { userId: currentUserId } : "skip"
  );
  const markViewed = useMutation(api.stories.view);

  // Find initial user index
  useEffect(() => {
    if (initialUserId && open) {
      const index = userIds.indexOf(initialUserId);
      if (index !== -1) {
        setCurrentUserIndex(index);
        setCurrentStoryIndex(0);
        setProgress(0);
      }
    }
  }, [initialUserId, userIds, open]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setProgress(0);
      setIsPaused(false);
    }
  }, [open]);

  // Progress timer
  useEffect(() => {
    if (!open || isPaused || !storiesList?.length) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goToNextStory();
          return 0;
        }
        return prev + 100 / (STORY_DURATION / 100);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [open, isPaused, currentStoryIndex, currentUserIndex, storiesList]);

  // Mark story as viewed
  useEffect(() => {
    if (open && storiesList?.[currentStoryIndex]) {
      const story = storiesList[currentStoryIndex];
      markViewed({ storyId: story._id }).catch(() => {});
    }
  }, [open, currentStoryIndex, storiesList]);

  const goToNextStory = useCallback(() => {
    if (!storiesList) return;

    if (currentStoryIndex < storiesList.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
      setProgress(0);
    } else if (currentUserIndex < userIds.length - 1) {
      setCurrentUserIndex((prev) => prev + 1);
      setCurrentStoryIndex(0);
      setProgress(0);
    } else {
      onOpenChange(false);
    }
  }, [currentStoryIndex, currentUserIndex, storiesList, userIds, onOpenChange]);

  const goToPrevStory = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
      setProgress(0);
    } else if (currentUserIndex > 0) {
      setCurrentUserIndex((prev) => prev - 1);
      setCurrentStoryIndex(0);
      setProgress(0);
    }
  }, [currentStoryIndex, currentUserIndex]);

  const handleTap = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (x < width / 3) {
      goToPrevStory();
    } else if (x > (width * 2) / 3) {
      goToNextStory();
    } else {
      setIsPaused((prev) => !prev);
    }
  };

  if (!storiesList || storiesList.length === 0) {
    return null;
  }

  const currentStory = storiesList[currentStoryIndex];
  const author = currentUserData;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 bg-black border-0 overflow-hidden h-[100dvh] sm:h-[90vh] sm:rounded-2xl">
        <div className="relative w-full h-full flex flex-col" onClick={handleTap}>
          {/* Progress Bars */}
          <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-2">
            {storiesList.map((_: unknown, index: number) => (
              <div key={index} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-100"
                  style={{
                    width:
                      index < currentStoryIndex
                        ? "100%"
                        : index === currentStoryIndex
                          ? `${progress}%`
                          : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="absolute top-6 left-0 right-0 z-20 flex items-center justify-between px-4">
            <Link
              href={`/@${author?.username}`}
              className="flex items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <UserAvatar user={author} className="size-10 ring-2 ring-white/50" />
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-white font-semibold text-sm">
                    {author?.displayName || author?.username}
                  </span>
                  {author?.isVerified && <BadgeCheck className="size-4 text-primary" />}
                </div>
                <span className="text-white/60 text-xs">
                  {formatDistanceToNow(currentStory.createdAt, { addSuffix: true })}
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted((prev) => !prev);
                }}
              >
                {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPaused((prev) => !prev);
                }}
              >
                {isPaused ? <Play className="size-5" /> : <Pause className="size-5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                }}
              >
                <X className="size-5" />
              </Button>
            </div>
          </div>

          {/* Story Content */}
          <div className="flex-1 flex items-center justify-center bg-black">
            {currentStory.mediaUrl ? (
              currentStory.mediaType === "video" ? (
                <video
                  src={currentStory.mediaUrl}
                  className="w-full h-full object-contain"
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                />
              ) : (
                <img src={currentStory.mediaUrl} alt="" className="w-full h-full object-contain" />
              )
            ) : (
              <div className="flex items-center justify-center p-8">
                <p className="text-white text-xl text-center">{currentStory.caption}</p>
              </div>
            )}
          </div>

          {/* Navigation Arrows */}
          {(currentUserIndex > 0 || currentStoryIndex > 0) && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10"
              onClick={(e) => {
                e.stopPropagation();
                goToPrevStory();
              }}
            >
              <ChevronLeft className="size-8" />
            </Button>
          )}
          {(currentUserIndex < userIds.length - 1 ||
            currentStoryIndex < storiesList.length - 1) && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10"
              onClick={(e) => {
                e.stopPropagation();
                goToNextStory();
              }}
            >
              <ChevronRight className="size-8" />
            </Button>
          )}

          {/* Bottom Actions */}
          <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Send a message..."
                className="flex-1 bg-white/20 text-white placeholder-white/50 rounded-full px-4 py-2 text-sm outline-none"
                onClick={(e) => e.stopPropagation()}
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={(e) => e.stopPropagation()}
              >
                <Heart className="size-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={(e) => e.stopPropagation()}
              >
                <Send className="size-6" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
