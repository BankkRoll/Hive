"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Lock,
  BadgeCheck,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

interface PostCardProps {
  post: {
    _id: Id<"posts">;
    content: string;
    createdAt: number;
    likesCount?: number;
    commentsCount?: number;
    viewsCount?: number;
    tipsTotal?: number;
    isLocked?: boolean;
    unlockPrice?: number;
    visibility?: "public" | "followers" | "subscribers" | "vip";
    author?: {
      _id: Id<"users">;
      username?: string;
      displayName?: string;
      avatarR2Key?: string;
      dicebearSeed?: string;
      dicebearBgColor?: string;
      dicebearEyes?: string;
      dicebearMouth?: string;
      isVerified?: boolean;
    } | null;
    isLiked?: boolean;
    isBookmarked?: boolean;
    canView?: boolean;
  };
}

export function PostCard({ post }: PostCardProps) {
  const [isLiked, setIsLiked] = useState(post.isLiked ?? false);
  const [likesCount, setLikesCount] = useState(post.likesCount ?? 0);
  const [isBookmarked, setIsBookmarked] = useState(post.isBookmarked ?? false);

  const toggleLike = useMutation(api.likes.toggle);
  const toggleBookmark = useMutation(api.bookmarks.toggle);

  const handleLike = async () => {
    // Optimistic update
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikesCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    try {
      await toggleLike({
        targetType: "post",
        targetId: post._id,
      });
    } catch (error) {
      // Revert optimistic update on failure
      setIsLiked(wasLiked);
      setLikesCount((prev) => (wasLiked ? prev + 1 : prev - 1));
      toast.error("Failed to update like");
    }
  };

  const handleBookmark = async () => {
    // Optimistic update
    const wasBookmarked = isBookmarked;
    setIsBookmarked(!wasBookmarked);

    try {
      await toggleBookmark({ postId: post._id });
    } catch (error) {
      // Revert optimistic update on failure
      setIsBookmarked(wasBookmarked);
      toast.error("Failed to update bookmark");
    }
  };

  const timeAgo = formatDistanceToNow(new Date(post.createdAt), {
    addSuffix: false,
  });

  const isLocked = post.isLocked && !post.canView;

  return (
    <article className="p-4 hover:bg-muted/30 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <Link href={`/@${post.author?.username}`}>
          <UserAvatar
            user={post.author}
            className="w-10 h-10 ring-2 ring-offset-2 ring-offset-background ring-primary/20"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/@${post.author?.username}`}
              className="font-semibold text-sm hover:underline truncate"
            >
              {post.author?.displayName || "Unknown"}
            </Link>
            {post.author?.isVerified && (
              <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href={`/@${post.author?.username}`} className="hover:underline">
              @{post.author?.username || "unknown"}
            </Link>
            <span>·</span>
            <span>{timeAgo}</span>
            {post.visibility !== "public" && (
              <>
                <span>·</span>
                <span className="capitalize">{post.visibility}</span>
              </>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 -mr-2">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Copy link</DropdownMenuItem>
            <DropdownMenuItem>Report post</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              Block @{post.author?.username}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <div className="mb-3">
        {isLocked ? (
          <div className="relative rounded-xl overflow-hidden">
            {/* Blurred preview */}
            <div className="blur-xl select-none pointer-events-none p-4 bg-muted/50">
              <p className="text-sm line-clamp-3">
                This content is locked. Subscribe to unlock exclusive content from this creator.
              </p>
            </div>

            {/* Lock overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium mb-1">Locked Content</p>
              <p className="text-xs text-muted-foreground mb-3">
                {post.unlockPrice ? `Unlock for ${post.unlockPrice} coins` : "Subscribe to unlock"}
              </p>
              <Button size="sm" className="h-8">
                <Coins className="w-4 h-4 mr-1.5" />
                Unlock
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{post.content}</p>
        )}
      </div>

      {/* TODO: Media grid */}

      {/* Actions */}
      <div className="flex items-center justify-between -mx-2">
        <div className="flex items-center gap-1">
          {/* Like */}
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 px-2 gap-1.5", isLiked && "text-destructive hover:text-destructive")}
            onClick={handleLike}
          >
            <Heart className={cn("w-4 h-4", isLiked && "fill-current animate-like")} />
            <span className="text-xs">{likesCount > 0 ? likesCount : ""}</span>
          </Button>

          {/* Comment */}
          <Link
            href={`/post/${post._id}`}
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "h-8 px-2 gap-1.5",
            })}
          >
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs">
              {(post.commentsCount ?? 0) > 0 ? post.commentsCount : ""}
            </span>
          </Link>

          {/* Share */}
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {/* Tips received */}
          {(post.tipsTotal ?? 0) > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground px-2">
              <Coins className="w-3.5 h-3.5 text-warning" />
              <span>{post.tipsTotal}</span>
            </div>
          )}

          {/* Bookmark */}
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 px-2", isBookmarked && "text-primary")}
            onClick={handleBookmark}
          >
            <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
          </Button>
        </div>
      </div>
    </article>
  );
}
