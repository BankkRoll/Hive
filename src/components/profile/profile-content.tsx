"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import { SubscriptionTiers } from "@/components/profile/subscription-tiers";
import { Skeleton } from "@/components/ui/skeleton";
import { UserX } from "lucide-react";

interface ProfileContentProps {
  username: string;
}

export function ProfileContent({ username }: ProfileContentProps) {
  const currentUser = useQuery(api.users.currentUser);
  const profile = useQuery(api.users.getPublicProfile, { username });
  const subscription = useQuery(
    api.subscriptions.isSubscribed,
    profile?.user?._id ? { creatorId: profile.user._id } : "skip"
  );

  if (profile === undefined || currentUser === undefined) {
    return <ProfileSkeleton />;
  }

  if (profile === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <UserX className="size-10 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold mb-2">User not found</h1>
        <p className="text-muted-foreground">
          The user @{username} doesn't exist or has been removed.
        </p>
      </div>
    );
  }

  const isOwnProfile = currentUser?._id === profile.user._id;
  const isCreator = profile.user.role === "creator";

  return (
    <div className="min-h-screen">
      <ProfileHeader
        user={profile.user}
        isFollowing={profile.isFollowing}
        isSubscribed={profile.isSubscribed}
        isOwnProfile={isOwnProfile}
        subscriptionTier={subscription?.tier}
      />

      {/* Centered content container for tabs and posts */}
      <div className="feed-container">
        {/* Subscription Tiers for creators */}
        {isCreator && !isOwnProfile && (
          <SubscriptionTiers
            creatorId={profile.user._id}
            creatorUsername={profile.user.username ?? ""}
            isSubscribed={profile.isSubscribed}
            currentTierId={subscription?.tier?._id}
          />
        )}

        {/* Content Tabs */}
        <ProfileTabs userId={profile.user._id} isOwnProfile={isOwnProfile} />
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Banner - EXACT match: h-32 sm:h-48 */}
      <div className="h-32 sm:h-48 relative">
        <Skeleton className="w-full h-full" />
      </div>

      {/* Profile Info - EXACT match: px-4 pb-4 relative z-10 */}
      <div className="px-4 pb-4 relative z-10">
        {/* Avatar - EXACT match: -mt-16 sm:-mt-20 mb-3, size-24 sm:size-32 */}
        <div className="relative -mt-16 sm:-mt-20 mb-3 z-20">
          <Skeleton className="size-24 sm:size-32 rounded-full border-4 border-background shadow-xl" />
        </div>

        {/* Name and Actions Row - EXACT match: flex items-start justify-between gap-3 mb-3 */}
        <div className="flex items-start justify-between gap-3 mb-3 relative z-20">
          <div className="min-w-0 flex-1">
            {/* Display Name - matches text-xl sm:text-2xl (h-7 sm:h-8) */}
            <Skeleton className="h-7 sm:h-8 w-40 mb-1" />
            {/* Username - matches text-sm (h-4) */}
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Action button */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>

        {/* Bio - matches text-sm mb-3 */}
        <div className="mb-3">
          <Skeleton className="h-4 w-full mb-1.5" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Meta Info - EXACT match: flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-4 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Stats - EXACT match: flex items-center gap-6 text-sm */}
        <div className="flex items-center gap-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Tabs and content in feed-container - EXACT match */}
      <div className="feed-container">
        {/* Tabs - matches TabsList w-full border-b h-12 */}
        <div className="border-b">
          <div className="flex">
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-12 flex-1" />
          </div>
        </div>

        {/* Post skeletons - matches PostCard structure */}
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4">
              <div className="flex gap-3">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex items-center gap-4 pt-2">
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
