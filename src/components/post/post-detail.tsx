"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { formatDistanceToNow, format } from "date-fns";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Lock,
  BadgeCheck,
  Coins,
  ArrowLeft,
  Copy,
  Flag,
  Trash2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommentSection } from "./comment-section";
import { toast } from "sonner";

interface PostDetailContentProps {
  postId: string;
}

export function PostDetailContent({ postId }: PostDetailContentProps) {
  const router = useRouter();
  const post = useQuery(api.posts.getById, { postId: postId as Id<"posts"> });
  const toggleLike = useMutation(api.likes.toggle);
  const toggleBookmark = useMutation(api.bookmarks.toggle);

  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticLikesCount, setOptimisticLikesCount] = useState<number | null>(null);
  const [optimisticBookmarked, setOptimisticBookmarked] = useState<boolean | null>(null);

  if (post === undefined) {
    return <PostDetailSkeleton />;
  }

  if (post === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Eye className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Post not found</h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          This post may have been deleted or you don't have permission to view it.
        </p>
        <Button onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go back
        </Button>
      </div>
    );
  }

  const isLiked = optimisticLiked ?? post.isLiked ?? false;
  const likesCount = optimisticLikesCount ?? post.likesCount ?? 0;
  const isBookmarked = optimisticBookmarked ?? post.isBookmarked ?? false;
  const isLocked = post.isLocked && !post.isUnlocked;

  const handleLike = async () => {
    const newLiked = !isLiked;
    const newCount = newLiked ? likesCount + 1 : likesCount - 1;

    setOptimisticLiked(newLiked);
    setOptimisticLikesCount(newCount);

    try {
      await toggleLike({
        targetType: "post",
        targetId: post._id,
      });
    } catch (error) {
      setOptimisticLiked(null);
      setOptimisticLikesCount(null);
      toast.error("Failed to like post");
    }
  };

  const handleBookmark = async () => {
    const newBookmarked = !isBookmarked;
    setOptimisticBookmarked(newBookmarked);

    try {
      await toggleBookmark({ postId: post._id });
      toast.success(newBookmarked ? "Added to bookmarks" : "Removed from bookmarks");
    } catch (error) {
      setOptimisticBookmarked(null);
      toast.error("Failed to update bookmark");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post._id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Post by @${post.author?.username}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch (error) {
      // User cancelled share
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/post/${post._id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const createdDate = new Date(post.createdAt);
  const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true });
  const fullDate = format(createdDate, "h:mm a · MMM d, yyyy");

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-4 px-4 h-14">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-lg">Post</h1>
        </div>
      </header>

      {/* Post Content */}
      <article className="px-4 py-4">
        {/* Author Header */}
        <div className="flex items-start gap-3 mb-4">
          <Link href={`/@${post.author?.username}`}>
            <UserAvatar
              user={post.author}
              className="w-12 h-12 ring-2 ring-offset-2 ring-offset-background ring-primary/20"
            />
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/@${post.author?.username}`}
                className="font-semibold hover:underline truncate"
              >
                {post.author?.displayName || "Unknown"}
              </Link>
              {post.author?.isVerified && (
                <BadgeCheck className="w-5 h-5 text-primary flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link href={`/@${post.author?.username}`} className="hover:underline">
                @{post.author?.username || "unknown"}
              </Link>
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
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreHorizontal className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleCopyLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-warning">
                <Flag className="w-4 h-4 mr-2" />
                Report post
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Block @{post.author?.username}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Post Body */}
        <div className="mb-4">
          {isLocked ? (
            <div className="relative rounded-2xl overflow-hidden">
              <div className="blur-xl select-none pointer-events-none p-6 bg-muted/50">
                <p className="text-base leading-relaxed">
                  This content is locked. Subscribe to unlock exclusive content from this creator.
                  Premium content awaits behind this paywall. Support the creator to access their
                  exclusive work.
                </p>
              </div>

              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/20">
                  <Lock className="w-8 h-8 text-primary" />
                </div>
                <p className="text-lg font-semibold mb-1">Locked Content</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {post.unlockPrice
                    ? `Unlock for ${post.unlockPrice} coins`
                    : "Subscribe to unlock"}
                </p>
                <Button size="lg" className="gap-2">
                  <Coins className="w-5 h-5" />
                  Unlock Now
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-lg leading-relaxed whitespace-pre-wrap">{post.content}</p>

              {/* Media Grid */}
              {post.mediaUrls && post.mediaUrls.length > 0 && (
                <div
                  className={cn(
                    "grid gap-2 rounded-2xl overflow-hidden",
                    post.mediaUrls.length === 1 && "grid-cols-1",
                    post.mediaUrls.length === 2 && "grid-cols-2",
                    post.mediaUrls.length === 3 && "grid-cols-2",
                    post.mediaUrls.length >= 4 && "grid-cols-2"
                  )}
                >
                  {post.mediaUrls.slice(0, 4).map((url, index) => (
                    <div
                      key={index}
                      className={cn(
                        "relative bg-muted rounded-lg overflow-hidden",
                        post.mediaUrls.length === 3 && index === 0 && "row-span-2",
                        "aspect-square"
                      )}
                    >
                      <img
                        src={url}
                        alt={`Post media ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {post.mediaUrls.length > 4 && index === 3 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="text-2xl font-bold text-white">
                            +{post.mediaUrls.length - 4}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Tooltip>
            <TooltipTrigger>
              <time dateTime={createdDate.toISOString()} className="hover:underline cursor-help">
                {fullDate}
              </time>
            </TooltipTrigger>
            <TooltipContent>{timeAgo}</TooltipContent>
          </Tooltip>
          <span>·</span>
          <span>{post.viewsCount?.toLocaleString() ?? 0} views</span>
        </div>

        <Separator className="my-4" />

        {/* Engagement Stats */}
        <div className="flex items-center gap-6 text-sm mb-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{likesCount.toLocaleString()}</span>
            <span className="text-muted-foreground">Likes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{post.commentsCount?.toLocaleString() ?? 0}</span>
            <span className="text-muted-foreground">Comments</span>
          </div>
          {(post.tipsTotal ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-warning" />
              <span className="font-semibold">{(post.tipsTotal ?? 0).toLocaleString()}</span>
              <span className="text-muted-foreground">Tips</span>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Action Buttons */}
        <div className="flex items-center justify-around py-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="lg"
                  className={cn(
                    "flex-1 gap-2 rounded-full",
                    isLiked && "text-destructive hover:text-destructive hover:bg-destructive/10"
                  )}
                  onClick={handleLike}
                />
              }
            >
              <Heart className={cn("w-5 h-5", isLiked && "fill-current")} />
              <span className="sr-only sm:not-sr-only">Like</span>
            </TooltipTrigger>
            <TooltipContent>Like</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="lg" className="flex-1 gap-2 rounded-full" />}
            >
              <MessageCircle className="w-5 h-5" />
              <span className="sr-only sm:not-sr-only">Comment</span>
            </TooltipTrigger>
            <TooltipContent>Comment</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="lg"
                  className={cn(
                    "flex-1 gap-2 rounded-full",
                    isBookmarked && "text-primary hover:text-primary hover:bg-primary/10"
                  )}
                  onClick={handleBookmark}
                />
              }
            >
              <Bookmark className={cn("w-5 h-5", isBookmarked && "fill-current")} />
              <span className="sr-only sm:not-sr-only">Save</span>
            </TooltipTrigger>
            <TooltipContent>{isBookmarked ? "Remove from bookmarks" : "Bookmark"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="lg"
                  className="flex-1 gap-2 rounded-full"
                  onClick={handleShare}
                />
              }
            >
              <Share2 className="w-5 h-5" />
              <span className="sr-only sm:not-sr-only">Share</span>
            </TooltipTrigger>
            <TooltipContent>Share</TooltipContent>
          </Tooltip>
        </div>
      </article>

      <Separator />

      {/* Comments Section */}
      <CommentSection postId={post._id} />
    </div>
  );
}

function PostDetailSkeleton() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-4 px-4 h-14">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <Skeleton className="w-20 h-6" />
        </div>
      </header>

      <div className="px-4 py-4">
        <div className="flex items-start gap-3 mb-4">
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="flex-1">
            <Skeleton className="w-32 h-5 mb-2" />
            <Skeleton className="w-24 h-4" />
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <Skeleton className="w-full h-5" />
          <Skeleton className="w-full h-5" />
          <Skeleton className="w-3/4 h-5" />
        </div>

        <Skeleton className="w-48 h-4 mb-4" />

        <Separator className="my-4" />

        <div className="flex gap-6 mb-4">
          <Skeleton className="w-20 h-5" />
          <Skeleton className="w-24 h-5" />
        </div>

        <Separator className="my-4" />

        <div className="flex justify-around py-1">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-20 h-9 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
