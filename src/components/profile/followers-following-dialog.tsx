"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { BadgeCheck, UserMinus, UserPlus, Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

type TabType = "followers" | "following";

interface FollowerUser {
  _id: Id<"users">;
  username?: string;
  displayName?: string;
  avatarR2Key?: string;
  dicebearSeed?: string;
  dicebearBgColor?: string;
  dicebearEyes?: string;
  dicebearMouth?: string;
  isVerified?: boolean;
  bio?: string;
}

interface FollowerItem {
  user: FollowerUser;
  followedAt: number;
  isFollowing: boolean;
}

interface FollowersFollowingDialogProps {
  userId: Id<"users">;
  username?: string;
  initialTab?: TabType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwnProfile?: boolean;
  followersCount?: number;
  followingCount?: number;
}

export function FollowersFollowingDialog({
  userId,
  username,
  initialTab = "followers",
  open,
  onOpenChange,
  isOwnProfile = false,
  followersCount = 0,
  followingCount = 0,
}: FollowersFollowingDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Reset to initial tab when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden max-h-[85vh] flex flex-col gap-0">
        <DialogHeader className="p-4 pb-0 shrink-0">
          <DialogTitle className="text-center">@{username || "user"}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabType)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full rounded-none border-b bg-transparent p-0 h-auto shrink-0">
            <TabsTrigger
              value="followers"
              className="flex-1 rounded-none border-b-2 border-transparent py-3 data-active:border-primary data-active:bg-transparent data-active:shadow-none"
            >
              Followers
              <span className="ml-1.5 text-muted-foreground">{followersCount}</span>
            </TabsTrigger>
            <TabsTrigger
              value="following"
              className="flex-1 rounded-none border-b-2 border-transparent py-3 data-active:border-primary data-active:bg-transparent data-active:shadow-none"
            >
              Following
              <span className="ml-1.5 text-muted-foreground">{followingCount}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="followers" className="flex-1 min-h-0 mt-0">
            <FollowersList
              userId={userId}
              type="followers"
              isOwnProfile={isOwnProfile}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="following" className="flex-1 min-h-0 mt-0">
            <FollowersList
              userId={userId}
              type="following"
              isOwnProfile={isOwnProfile}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ===== FOLLOWERS LIST COMPONENT =====

interface FollowersListProps {
  userId: Id<"users">;
  type: TabType;
  isOwnProfile: boolean;
  onClose: () => void;
}

function FollowersList({ userId, type, isOwnProfile, onClose }: FollowersListProps) {
  const [allItems, setAllItems] = useState<FollowerItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasInitialized, setHasInitialized] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch data based on type
  const followersData = useQuery(
    api.follows.getFollowers,
    type === "followers" ? { userId, cursor } : "skip"
  );
  const followingData = useQuery(
    api.follows.getFollowing,
    type === "following" ? { userId, cursor } : "skip"
  );

  const data = type === "followers" ? followersData : followingData;
  const items: FollowerItem[] | undefined =
    type === "followers"
      ? (followersData?.followers as FollowerItem[] | undefined)
      : (followingData?.following as FollowerItem[] | undefined);
  const hasMore = data?.hasMore ?? false;
  const isLoading = data === undefined;

  // Accumulate items as we paginate
  useEffect(() => {
    if (items && items.length > 0) {
      if (!cursor) {
        // First load - replace all
        setAllItems(items);
      } else {
        // Subsequent loads - append
        setAllItems((prev) => {
          const existingIds = new Set(prev.map((p) => p.user._id));
          const newItems = items.filter((item) => !existingIds.has(item.user._id));
          return [...prev, ...newItems];
        });
      }
      setHasInitialized(true);
    } else if (items && items.length === 0 && !cursor) {
      setAllItems([]);
      setHasInitialized(true);
    }
  }, [items, cursor]);

  // Reset when type changes
  useEffect(() => {
    setAllItems([]);
    setCursor(undefined);
    setHasInitialized(false);
  }, [type]);

  const loadMore = useCallback(() => {
    if (data?.cursor && hasMore && !isLoading) {
      setCursor(data.cursor);
    }
  }, [data?.cursor, hasMore, isLoading]);

  const { sentinelRef: infiniteScrollRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading,
    threshold: 200,
  });

  // Sync refs
  useEffect(() => {
    if (sentinelRef.current && infiniteScrollRef.current !== sentinelRef.current) {
      // The hook manages its own ref, we'll use our local one for the div
    }
  }, [infiniteScrollRef]);

  // Loading skeleton
  if (isLoading && !hasInitialized) {
    return (
      <div className="p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <FollowUserRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (hasInitialized && allItems.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users className="size-5" />
          </EmptyMedia>
          <EmptyTitle>
            {type === "followers" ? "No followers yet" : "Not following anyone"}
          </EmptyTitle>
          <EmptyDescription>
            {type === "followers"
              ? isOwnProfile
                ? "When people follow you, they'll appear here."
                : "This user doesn't have any followers yet."
              : isOwnProfile
                ? "When you follow people, they'll appear here."
                : "This user isn't following anyone yet."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="h-100">
      <div className="p-2">
        {allItems.map((item) => (
          <FollowUserRow
            key={item.user._id}
            user={item.user}
            isFollowing={item.isFollowing}
            isOwnProfile={isOwnProfile}
            listType={type}
            profileUserId={userId}
            onClose={onClose}
          />
        ))}

        {/* Sentinel for infinite scroll */}
        <div
          ref={(el) => {
            // @ts-expect-error - ref assignment for infinite scroll
            if (infiniteScrollRef) infiniteScrollRef.current = el;
          }}
          className="h-1"
        />

        {/* Loading more indicator */}
        {isLoading && hasInitialized && (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ===== FOLLOW USER ROW COMPONENT =====

interface FollowUserRowProps {
  user: FollowerUser;
  isFollowing: boolean;
  isOwnProfile: boolean;
  listType: TabType;
  profileUserId: Id<"users">;
  onClose: () => void;
}

function FollowUserRow({
  user,
  isFollowing: initialIsFollowing,
  isOwnProfile,
  listType,
  profileUserId,
  onClose,
}: FollowUserRowProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);
  const removeFollower = useMutation(api.follows.removeFollower);

  // Check if this is the current user (can't follow yourself)
  const currentUser = useQuery(api.users.currentUser);
  const isCurrentUser = currentUser?._id === user._id;
  const isProfileOwnerRow = profileUserId === user._id;

  const handleFollowToggle = async () => {
    if (isLoading || isCurrentUser) return;
    setIsLoading(true);

    try {
      if (isFollowing) {
        await unfollow({ userId: user._id });
        setIsFollowing(false);
        toast.success(`Unfollowed @${user.username}`);
      } else {
        await follow({ userId: user._id });
        setIsFollowing(true);
        toast.success(`Following @${user.username}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFollower = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await removeFollower({ followerId: user._id });
      setIsRemoved(true);
      toast.success(`Removed @${user.username} from your followers`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render removed followers
  if (isRemoved) return null;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
      {/* Avatar - clickable to profile */}
      <Link href={`/@${user.username}`} onClick={onClose} className="shrink-0">
        <UserAvatar user={user} size="default" />
      </Link>

      {/* User info - clickable to profile */}
      <Link href={`/@${user.username}`} onClick={onClose} className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-medium truncate">
            {user.displayName || user.username || "Unknown"}
          </span>
          {user.isVerified && <BadgeCheck className="size-4 text-primary shrink-0" />}
        </div>
        <p className="text-sm text-muted-foreground truncate">@{user.username || "unknown"}</p>
        {user.bio && <p className="text-sm text-muted-foreground truncate mt-0.5">{user.bio}</p>}
      </Link>

      {/* Action button */}
      {!isCurrentUser && !isProfileOwnerRow && (
        <div className="shrink-0">
          {/* Own profile viewing followers - show remove button */}
          {isOwnProfile && listType === "followers" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveFollower}
              disabled={isLoading}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <UserMinus className="size-4 mr-1" />
                  Remove
                </>
              )}
            </Button>
          ) : (
            /* Follow/unfollow button */
            <Button
              variant={isFollowing ? "outline" : "default"}
              size="sm"
              onClick={handleFollowToggle}
              disabled={isLoading}
              className={cn(
                isFollowing &&
                  "hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
              )}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isFollowing ? (
                <>
                  <UserMinus className="size-4 mr-1" />
                  Following
                </>
              ) : (
                <>
                  <UserPlus className="size-4 mr-1" />
                  Follow
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ===== SKELETON =====

function FollowUserRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <Skeleton className="size-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-8 w-20 rounded-md shrink-0" />
    </div>
  );
}
