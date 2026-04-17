"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  EyeOff,
  Eye,
  ThumbsDown,
  RefreshCw,
  AlertTriangle,
  HelpCircle,
  Undo2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// HIDE POST BUTTON (for post menus)
// ============================================

type HideReason = "not_interested" | "seen_too_often" | "offensive" | "other";

interface HidePostButtonProps {
  postId: Id<"posts">;
  onHidden?: () => void;
  asDropdownItem?: boolean;
}

export function HidePostButton({ postId, onHidden, asDropdownItem }: HidePostButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<HideReason>("not_interested");
  const [isLoading, setIsLoading] = useState(false);

  const isHidden = useQuery(api.hiddenPosts.isHidden, { postId });
  const hide = useMutation(api.hiddenPosts.hide);
  const unhide = useMutation(api.hiddenPosts.unhide);

  const handleHide = async () => {
    setIsLoading(true);
    try {
      await hide({ postId, reason });
      toast.success("Post hidden from your feed");
      setOpen(false);
      onHidden?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to hide post");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnhide = async () => {
    setIsLoading(true);
    try {
      await unhide({ postId });
      toast.success("Post restored to your feed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unhide post");
    } finally {
      setIsLoading(false);
    }
  };

  if (isHidden) {
    if (asDropdownItem) {
      return (
        <DropdownMenuItem onClick={handleUnhide} disabled={isLoading} className="gap-2">
          <Eye className="size-4" />
          Show this post
        </DropdownMenuItem>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleUnhide}
        disabled={isLoading}
        className="gap-2"
      >
        <Eye className="size-4" />
        Show Post
      </Button>
    );
  }

  const reasons: { value: HideReason; label: string; icon: typeof ThumbsDown }[] = [
    { value: "not_interested", label: "Not interested", icon: ThumbsDown },
    { value: "seen_too_often", label: "Seen too often", icon: RefreshCw },
    { value: "offensive", label: "Offensive content", icon: AlertTriangle },
    { value: "other", label: "Other reason", icon: HelpCircle },
  ];

  const TriggerButton = asDropdownItem ? (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        setOpen(true);
      }}
      className="gap-2"
    >
      <EyeOff className="size-4" />
      Hide this post
    </DropdownMenuItem>
  ) : (
    <Button variant="ghost" size="sm" className="gap-2">
      <EyeOff className="size-4" />
      Hide
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{TriggerButton}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeOff className="size-5" />
            Hide this post
          </DialogTitle>
          <DialogDescription>
            This post will be removed from your feed. You can view and restore hidden posts from
            your settings.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <label className="text-sm font-medium mb-2 block">
            Why are you hiding this post? (optional)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {reasons.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors",
                    reason === r.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="text-sm">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleHide} disabled={isLoading}>
            {isLoading ? "Hiding..." : "Hide Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// HIDDEN POSTS LIST
// ============================================

export function HiddenPostsList() {
  const hiddenPosts = useQuery(api.hiddenPosts.getHidden, {});
  const stats = useQuery(api.hiddenPosts.getStats, {});
  const unhide = useMutation(api.hiddenPosts.unhide);
  const unhideAllFromUser = useMutation(api.hiddenPosts.unhideAllFromUser);

  const handleUnhide = async (postId: Id<"posts">) => {
    try {
      await unhide({ postId });
      toast.success("Post restored to your feed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unhide post");
    }
  };

  const handleUnhideAllFromUser = async (authorId: Id<"users">, username?: string) => {
    try {
      const result = await unhideAllFromUser({ authorId });
      toast.success(`Restored ${result.unhiddenCount} posts from @${username}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unhide posts");
    }
  };

  const reasonLabels: Record<string, string> = {
    not_interested: "Not interested",
    seen_too_often: "Seen too often",
    offensive: "Offensive",
    other: "Other",
    unspecified: "No reason",
  };

  if (hiddenPosts === undefined) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Hidden Posts"
          description="Manage your hidden posts"
          backHref="/settings"
        />
        <div className="p-4 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (hiddenPosts.length === 0) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Hidden Posts"
          description="Manage your hidden posts"
          backHref="/settings"
        />
        <div className="p-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <EyeOff className="size-12 mb-3 opacity-50" />
              <p className="font-medium">No Hidden Posts</p>
              <p className="text-sm">Posts you hide will appear here</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <PageHeader
        title="Hidden Posts"
        description={`${stats?.total ?? 0} hidden ${stats?.total === 1 ? "post" : "posts"}`}
        backHref="/settings"
      />
      <div className="p-4 space-y-4">
        {/* Stats */}
        {stats && stats.total > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Hide Reasons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byReason)
                  .filter(([, count]) => count > 0)
                  .map(([reason, count]) => (
                    <Badge key={reason} variant="secondary">
                      {reasonLabels[reason] ?? reason}: {count}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        <ScrollArea className="h-[calc(100vh-12rem)]">
          <div className="space-y-3">
            {hiddenPosts.map((post) => (
              <HiddenPostCard
                key={post._id}
                post={post}
                onUnhide={() => handleUnhide(post._id)}
                onUnhideAllFromUser={() =>
                  handleUnhideAllFromUser(post.author._id, post.author.username)
                }
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface HiddenPostCardProps {
  post: {
    _id: Id<"posts">;
    content: string;
    hiddenAt: number;
    reason?: string;
    author: {
      _id: Id<"users">;
      username?: string;
      displayName?: string;
      avatarR2Key?: string;
    };
  };
  onUnhide: () => void;
  onUnhideAllFromUser: () => void;
}

function HiddenPostCard({ post, onUnhide, onUnhideAllFromUser }: HiddenPostCardProps) {
  const hiddenDate = new Date(post.hiddenAt);

  const reasonLabels: Record<string, string> = {
    not_interested: "Not interested",
    seen_too_often: "Seen too often",
    offensive: "Offensive",
    other: "Other",
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <UserAvatar user={post.author} className="size-10" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{post.author.displayName || post.author.username}</span>
              <span className="text-sm text-muted-foreground">@{post.author.username}</span>
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{post.content}</p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Hidden {hiddenDate.toLocaleDateString()}</span>
              {post.reason && (
                <>
                  <span>·</span>
                  <Badge variant="outline" className="text-xs">
                    {reasonLabels[post.reason] ?? post.reason}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={onUnhide} className="gap-1">
            <Undo2 className="size-3" />
            Restore
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onUnhideAllFromUser}
            className="gap-1 text-muted-foreground"
          >
            <Eye className="size-3" />
            Show all from @{post.author.username}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// HIDDEN POST OVERLAY (for inline display)
// ============================================

interface HiddenPostOverlayProps {
  postId: Id<"posts">;
  onRestore?: () => void;
}

export function HiddenPostOverlay({ postId, onRestore }: HiddenPostOverlayProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const unhide = useMutation(api.hiddenPosts.unhide);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await unhide({ postId });
      toast.success("Post restored");
      onRestore?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore post");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Card className="bg-muted/50 border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-8">
        <EyeOff className="size-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground mb-3">This post is hidden</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRestore}
          disabled={isRestoring}
          className="gap-1"
        >
          <Eye className="size-3" />
          {isRestoring ? "Restoring..." : "Show Post"}
        </Button>
      </CardContent>
    </Card>
  );
}
