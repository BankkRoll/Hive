"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BadgeCheck,
  Calendar,
  Link as LinkIcon,
  MapPin,
  MoreHorizontal,
  Settings,
  UserMinus,
  UserPlus,
  Bell,
  BellOff,
  Flag,
  Ban,
  Mail,
  Gift,
  Clock,
} from "lucide-react";
import { GiftSubscriptionDialog } from "@/components/gifts/gift-subscription-dialog";
import { FollowersFollowingDialog } from "@/components/profile/followers-following-dialog";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { formatLastActive } from "@/hooks/use-presence";
import { getUserBannerUrl } from "@/hooks/use-user-banner";

interface ProfileHeaderProps {
  user: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    bio?: string;
    avatarR2Key?: string;
    bannerR2Key?: string;
    // DiceBear avatar fields
    dicebearSeed?: string;
    dicebearBgColor?: string;
    dicebearEyes?: string;
    dicebearMouth?: string;
    isVerified?: boolean;
    role?: string;
    followersCount?: number;
    followingCount?: number;
    postsCount?: number;
    subscribersCount?: number;
    _creationTime: number;
    lastActiveAt?: number; // Only included if privacy settings allow
  };
  isFollowing: boolean;
  isSubscribed: boolean;
  isOwnProfile: boolean;
  subscriptionTier?: {
    ringColor?: string;
    name?: string;
  } | null;
}

export function ProfileHeader({
  user,
  isFollowing: initialIsFollowing,
  isSubscribed,
  isOwnProfile,
  subscriptionTier,
}: ProfileHeaderProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followersCount, setFollowersCount] = useState(user.followersCount ?? 0);
  const [isLoading, setIsLoading] = useState(false);
  const [followDialogOpen, setFollowDialogOpen] = useState(false);
  const [followDialogTab, setFollowDialogTab] = useState<"followers" | "following">("followers");
  const follow = useMutation(api.follows.follow);
  const unfollow = useMutation(api.follows.unfollow);

  const openFollowersDialog = () => {
    setFollowDialogTab("followers");
    setFollowDialogOpen(true);
  };

  const openFollowingDialog = () => {
    setFollowDialogTab("following");
    setFollowDialogOpen(true);
  };

  const handleFollowToggle = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      if (isFollowing) {
        await unfollow({ userId: user._id });
        setIsFollowing(false);
        setFollowersCount((prev) => Math.max(0, prev - 1));
        toast.success(`Unfollowed @${user.username}`);
      } else {
        await follow({ userId: user._id });
        setIsFollowing(true);
        setFollowersCount((prev) => prev + 1);
        toast.success(`Following @${user.username}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const ringColor = subscriptionTier?.ringColor ?? (isSubscribed ? "#FF006E" : undefined);

  // Get banner URL - either uploaded or auto-generated DiceBear Glass
  const bannerUrl = getUserBannerUrl(user);

  return (
    <div className="relative">
      {/* Banner - uses uploaded or auto-generated DiceBear Glass */}
      <div className="h-32 sm:h-48 bg-linear-to-br from-primary/30 via-primary/20 to-background relative overflow-hidden">
        {bannerUrl && <img src={bannerUrl} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
      </div>

      {/* Profile Info - ensure above banner overlay */}
      <div className="px-4 pb-4 relative z-10">
        {/* Avatar */}
        <div className="relative -mt-16 sm:-mt-20 mb-3 z-20">
          <UserAvatar
            user={user}
            size="lg"
            className={cn(
              "size-24 sm:size-32 border-4 border-background shadow-xl",
              ringColor && "ring-4 ring-offset-2 ring-offset-background"
            )}
            style={ringColor ? { ["--tw-ring-color" as string]: ringColor } : undefined}
          />

          {/* Subscriber badge */}
          {isSubscribed && subscriptionTier && (
            <Badge
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] px-2"
              style={{ backgroundColor: subscriptionTier.ringColor }}
            >
              {subscriptionTier.name}
            </Badge>
          )}
        </div>

        {/* Name and Actions Row */}
        <div className="flex items-start justify-between gap-3 mb-3 relative z-20">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                {user.displayName || user.username || "Unknown"}
              </h1>
              {user.isVerified && <BadgeCheck className="size-5 sm:size-6 text-primary shrink-0" />}
            </div>
            <p className="text-muted-foreground text-sm">@{user.username || "unknown"}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isOwnProfile ? (
              <Link
                href={`/profile/${user.username}/edit`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Settings className="size-4 mr-1.5" />
                Edit Profile
              </Link>
            ) : (
              <>
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  size="sm"
                  onClick={handleFollowToggle}
                  disabled={isLoading}
                  className={cn(
                    "min-w-[100px]",
                    isFollowing &&
                      "hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                  )}
                >
                  {isFollowing ? (
                    <>
                      <UserMinus className="size-4 mr-1.5" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-4 mr-1.5" />
                      Follow
                    </>
                  )}
                </Button>

                <Link
                  href={`/messages/${user._id}`}
                  className={buttonVariants({ variant: "outline", size: "icon" })}
                >
                  <Mail className="size-4" />
                </Link>

                {user.role === "creator" && (
                  <GiftSubscriptionDialog
                    creator={{
                      _id: user._id,
                      username: user.username,
                      displayName: user.displayName,
                      avatarR2Key: user.avatarR2Key,
                    }}
                  >
                    <Button variant="outline" size="icon" title="Gift a subscription">
                      <Gift className="size-4" />
                    </Button>
                  </GiftSubscriptionDialog>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Bell className="size-4 mr-2" />
                      Turn on notifications
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <LinkIcon className="size-4 mr-2" />
                      Copy profile link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Flag className="size-4 mr-2" />
                      Report @{user.username}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      <Ban className="size-4 mr-2" />
                      Block @{user.username}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {/* Bio */}
        {user.bio && <p className="text-sm mb-3 whitespace-pre-wrap">{user.bio}</p>}

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-4">
          <span className="flex items-center gap-1">
            <Calendar className="size-4" />
            Joined {formatDistanceToNow(new Date(user._creationTime), { addSuffix: true })}
          </span>
          {user.lastActiveAt && (
            <span className="flex items-center gap-1">
              <Clock className="size-4" />
              {formatLastActive(user.lastActiveAt)}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 text-sm">
          <button
            type="button"
            onClick={openFollowingDialog}
            className="hover:underline cursor-pointer"
          >
            <span className="font-semibold">{user.followingCount ?? 0}</span>{" "}
            <span className="text-muted-foreground">Following</span>
          </button>
          <button
            type="button"
            onClick={openFollowersDialog}
            className="hover:underline cursor-pointer"
          >
            <span className="font-semibold">{followersCount}</span>{" "}
            <span className="text-muted-foreground">Followers</span>
          </button>
          {(user.role === "creator" || (user.subscribersCount ?? 0) > 0) && (
            <span>
              <span className="font-semibold">{user.subscribersCount ?? 0}</span>{" "}
              <span className="text-muted-foreground">Subscribers</span>
            </span>
          )}
        </div>
      </div>

      {/* Followers/Following Dialog */}
      <FollowersFollowingDialog
        userId={user._id}
        username={user.username}
        initialTab={followDialogTab}
        open={followDialogOpen}
        onOpenChange={setFollowDialogOpen}
        isOwnProfile={isOwnProfile}
        followersCount={followersCount}
        followingCount={user.followingCount ?? 0}
      />
    </div>
  );
}
