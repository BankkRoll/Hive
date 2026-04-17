"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  MoreHorizontal,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Flag,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CommentAuthor {
  _id: Id<"users">;
  username?: string;
  displayName?: string;
  avatarR2Key?: string;
  isVerified?: boolean;
}

interface CommentData {
  _id: Id<"comments">;
  postId: Id<"posts">;
  authorId: Id<"users">;
  content: string;
  parentId?: Id<"comments">;
  likesCount?: number;
  createdAt: number;
  author: CommentAuthor;
  isLiked: boolean;
  hasReplies: boolean;
}

interface CommentItemProps {
  comment: CommentData;
  postId: Id<"posts">;
  onReply: (commentId: Id<"comments">, username: string) => void;
  isHighlighted?: boolean;
  isReply?: boolean;
}

export function CommentItem({
  comment,
  postId,
  onReply,
  isHighlighted = false,
  isReply = false,
}: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null);
  const [optimisticLikesCount, setOptimisticLikesCount] = useState<number | null>(null);

  const toggleLike = useMutation(api.likes.toggle);
  const deleteComment = useMutation(api.comments.remove);

  const replies = useQuery(
    api.comments.getReplies,
    showReplies ? { commentId: comment._id, limit: 20 } : "skip"
  );

  const isLiked = optimisticLiked ?? comment.isLiked;
  const likesCount = optimisticLikesCount ?? comment.likesCount ?? 0;

  const handleLike = async () => {
    const newLiked = !isLiked;
    const newCount = newLiked ? likesCount + 1 : likesCount - 1;

    setOptimisticLiked(newLiked);
    setOptimisticLikesCount(newCount);

    try {
      await toggleLike({
        targetType: "comment",
        targetId: comment._id,
      });
    } catch (error) {
      setOptimisticLiked(null);
      setOptimisticLikesCount(null);
      toast.error("Failed to like comment");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteComment({ commentId: comment._id });
      toast.success("Comment deleted");
    } catch (error) {
      toast.error("Failed to delete comment");
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/post/${postId}#comment-${comment._id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const timeAgo = formatDistanceToNow(new Date(comment.createdAt), {
    addSuffix: false,
  });

  return (
    <div
      id={`comment-${comment._id}`}
      className={cn(
        "transition-colors",
        isHighlighted && "bg-primary/5 ring-1 ring-primary/20",
        isReply && "pl-12"
      )}
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <Link href={`/@${comment.author?.username}`} className="shrink-0">
            <UserAvatar
              user={comment.author}
              className={cn(
                "ring-2 ring-offset-2 ring-offset-background ring-border",
                isReply ? "w-8 h-8" : "w-10 h-10"
              )}
            />
          </Link>

          <div className="flex-1 min-w-0">
            {/* Author Info */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                href={`/@${comment.author?.username}`}
                className="font-semibold text-sm hover:underline"
              >
                {comment.author?.displayName || "Unknown"}
              </Link>
              {comment.author?.isVerified && (
                <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
              )}
              <Link
                href={`/@${comment.author?.username}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                @{comment.author?.username || "unknown"}
              </Link>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{timeAgo}</span>

              {/* More Options */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-6 h-6 ml-auto">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-warning">
                    <Flag className="w-4 h-4 mr-2" />
                    Report
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Comment Content */}
            <p className="text-sm mt-1 whitespace-pre-wrap break-words">{comment.content}</p>

            {/* Actions */}
            <div className="flex items-center gap-1 mt-2 -ml-2">
              {/* Like */}
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 px-2 gap-1.5 text-xs",
                  isLiked && "text-destructive hover:text-destructive"
                )}
                onClick={handleLike}
              >
                <Heart className={cn("w-3.5 h-3.5", isLiked && "fill-current")} />
                {likesCount > 0 && <span>{likesCount}</span>}
              </Button>

              {/* Reply */}
              {!isReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1.5 text-xs"
                  onClick={() => onReply(comment._id, comment.author?.username || "unknown")}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Reply
                </Button>
              )}
            </div>

            {/* View Replies Toggle */}
            {comment.hasReplies && !isReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1.5 text-xs text-primary hover:text-primary mt-1 -ml-2"
                onClick={() => setShowReplies(!showReplies)}
              >
                {showReplies ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Hide replies
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    View replies
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {showReplies && (
        <div className="border-l-2 border-border ml-8">
          {replies === undefined ? (
            <RepliesSkeleton />
          ) : replies.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No replies yet</div>
          ) : (
            replies.map((reply) => (
              <CommentItem
                key={reply._id}
                comment={reply}
                postId={postId}
                onReply={onReply}
                isReply
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RepliesSkeleton() {
  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
