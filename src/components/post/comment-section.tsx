"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Loader2 } from "lucide-react";
import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";

interface CommentSectionProps {
  postId: Id<"posts">;
}

export function CommentSection({ postId }: CommentSectionProps) {
  const [showAllComments, setShowAllComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    commentId: Id<"comments">;
    username: string;
  } | null>(null);

  const commentsResult = useQuery(api.comments.getByPost, {
    postId,
    limit: showAllComments ? 50 : 10,
  });

  const handleReply = (commentId: Id<"comments">, username: string) => {
    setReplyingTo({ commentId, username });
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleCommentCreated = () => {
    setReplyingTo(null);
  };

  if (commentsResult === undefined) {
    return <CommentSectionSkeleton />;
  }

  const { comments, hasMore } = commentsResult;

  return (
    <div className="pb-20">
      {/* Comment Form */}
      <div className="px-4 py-4">
        <CommentForm
          postId={postId}
          replyTo={replyingTo}
          onCancelReply={handleCancelReply}
          onCommentCreated={handleCommentCreated}
        />
      </div>

      <Separator />

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <MessageCircle className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">No comments yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Be the first to share your thoughts on this post.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {comments.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              postId={postId}
              onReply={handleReply}
              isHighlighted={replyingTo?.commentId === comment._id}
            />
          ))}
        </div>
      )}

      {/* Load More Button */}
      {hasMore && !showAllComments && (
        <div className="px-4 py-4">
          <Button variant="outline" className="w-full" onClick={() => setShowAllComments(true)}>
            Show more comments
          </Button>
        </div>
      )}

      {/* Loading indicator when fetching more */}
      {showAllComments && commentsResult === undefined && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function CommentSectionSkeleton() {
  return (
    <div className="pb-20">
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1">
            <Skeleton className="w-full h-20 rounded-xl" />
          </div>
        </div>
      </div>

      <Separator />

      <div className="divide-y divide-border">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-24 h-4" />
                  <Skeleton className="w-16 h-3" />
                </div>
                <Skeleton className="w-full h-4" />
                <Skeleton className="w-3/4 h-4" />
                <div className="flex items-center gap-4 pt-2">
                  <Skeleton className="w-12 h-4" />
                  <Skeleton className="w-12 h-4" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
