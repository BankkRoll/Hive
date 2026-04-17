"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, X, Loader2, AtSign, Smile, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CommentFormProps {
  postId: Id<"posts">;
  replyTo?: {
    commentId: Id<"comments">;
    username: string;
  } | null;
  onCancelReply?: () => void;
  onCommentCreated?: () => void;
}

export function CommentForm({
  postId,
  replyTo,
  onCancelReply,
  onCommentCreated,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentUser = useQuery(api.users.currentUser);
  const createComment = useMutation(api.comments.create);

  // Focus textarea when replying
  useEffect(() => {
    if (replyTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTo]);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createComment({
        postId,
        content: trimmedContent,
        parentId: replyTo?.commentId,
      });
      setContent("");
      toast.success(replyTo ? "Reply posted" : "Comment posted");
      onCommentCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const characterCount = content.length;
  const maxCharacters = 2000;
  const isOverLimit = characterCount > maxCharacters;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !isSubmitting;

  return (
    <div className="relative">
      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-primary/5 rounded-lg">
          <AtSign className="w-4 h-4 text-primary" />
          <span className="text-sm">
            Replying to <span className="font-medium text-primary">@{replyTo.username}</span>
          </span>
          <Button variant="ghost" size="icon" className="w-6 h-6 ml-auto" onClick={onCancelReply}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar */}
        <UserAvatar
          user={currentUser}
          className="w-10 h-10 ring-2 ring-offset-2 ring-offset-background ring-border shrink-0"
        />

        {/* Input Area */}
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "relative rounded-2xl border transition-all",
              isFocused ? "border-primary ring-2 ring-primary/20" : "border-input",
              isOverLimit && "border-destructive ring-2 ring-destructive/20"
            )}
          >
            <Textarea
              ref={textareaRef}
              placeholder={replyTo ? "Write your reply..." : "Write a comment..."}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="min-h-[80px] max-h-[300px] border-0 bg-transparent focus-visible:ring-0 focus-visible:border-0 rounded-2xl resize-none px-4 py-3"
              disabled={isSubmitting}
            />

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  disabled={isSubmitting}
                  type="button"
                >
                  <ImageIcon className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  disabled={isSubmitting}
                  type="button"
                >
                  <Smile className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                {/* Character count */}
                {content.length > 0 && (
                  <div
                    className={cn(
                      "text-xs transition-colors",
                      isOverLimit
                        ? "text-destructive"
                        : characterCount > maxCharacters * 0.9
                          ? "text-warning"
                          : "text-muted-foreground"
                    )}
                  >
                    {characterCount}/{maxCharacters}
                  </div>
                )}

                {/* Submit button */}
                <Button
                  size="sm"
                  className="h-8 px-4 gap-2 rounded-full"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {replyTo ? "Reply" : "Post"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Keyboard shortcut hint */}
          {isFocused && content.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 px-1">
              Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Ctrl</kbd>{" "}
              + <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> to
              post
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
