"use client";

import { useQuery } from "convex/react";
import { useQueryState } from "nuqs";
import { api } from "../../../convex/_generated/api";
import { PostCard } from "@/components/post/post-card";
import { PostCardSkeleton } from "@/components/post/post-card-skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, BadgeCheck, Flame, Clock } from "lucide-react";
import Link from "next/link";
import { trendingTabParser, type TrendingTab } from "@/lib/search-params";

export function TrendingContent() {
  const [tab, setTab] = useQueryState(
    "tab",
    trendingTabParser.withOptions({
      history: "push",
    })
  );

  const trendingPosts = useQuery(api.posts.getFeed, {
    type: "forYou",
    limit: 20,
  });
  const suggestedCreators = useQuery(api.users.getSuggestions, { limit: 10 });

  return (
    <div className="feed-container">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="p-4 flex items-center gap-3">
          <TrendingUp className="size-6 text-primary" />
          <h1 className="text-xl font-bold">Trending</h1>
        </div>

        <Tabs value={tab ?? "posts"} onValueChange={(v) => setTab(v as TrendingTab)}>
          <TabsList className="w-full justify-start rounded-none bg-transparent h-auto p-0 border-b">
            <TabsTrigger
              value="posts"
              className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
            >
              <Flame className="size-4 mr-2" />
              Hot Posts
            </TabsTrigger>
            <TabsTrigger
              value="creators"
              className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
            >
              <Users className="size-4 mr-2" />
              Creators
            </TabsTrigger>
            <TabsTrigger
              value="recent"
              className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
            >
              <Clock className="size-4 mr-2" />
              Recent
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {(tab ?? "posts") === "posts" && (
        <div className="divide-y">
          {trendingPosts === undefined ? (
            Array.from({ length: 5 }).map((_, i) => <PostCardSkeleton key={i} />)
          ) : trendingPosts.posts.length === 0 ? (
            <EmptyState
              icon={Flame}
              title="No trending posts"
              description="Check back later for hot content"
            />
          ) : (
            trendingPosts.posts.map((post, index) => (
              <div key={post._id} className="relative">
                {index < 3 && (
                  <div className="absolute left-4 top-4 z-10">
                    <div
                      className={
                        "size-6 rounded-full flex items-center justify-center text-white text-xs font-bold " +
                        (index === 0
                          ? "bg-warning"
                          : index === 1
                            ? "bg-muted-foreground"
                            : "bg-accent-foreground")
                      }
                    >
                      {index + 1}
                    </div>
                  </div>
                )}
                <PostCard post={post} />
              </div>
            ))
          )}
        </div>
      )}

      {(tab ?? "posts") === "creators" && (
        <div className="p-4 space-y-4">
          {suggestedCreators === undefined ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-14 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-9 w-20" />
              </div>
            ))
          ) : suggestedCreators.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No creators found"
              description="Check back later for creator recommendations"
            />
          ) : (
            suggestedCreators.map((creator, index) => (
              <CreatorCard key={creator._id} creator={creator} rank={index + 1} />
            ))
          )}
        </div>
      )}

      {(tab ?? "posts") === "recent" && (
        <div className="divide-y">
          {trendingPosts === undefined ? (
            Array.from({ length: 5 }).map((_, i) => <PostCardSkeleton key={i} />)
          ) : trendingPosts.posts.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No recent posts"
              description="Check back later for new content"
            />
          ) : (
            trendingPosts.posts.map((post) => <PostCard key={post._id} post={post} />)
          )}
        </div>
      )}
    </div>
  );
}

interface CreatorCardProps {
  creator: {
    _id: string;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    isVerified?: boolean;
    followersCount?: number;
    bio?: string;
  };
  rank: number;
}

function CreatorCard({ creator, rank }: CreatorCardProps) {
  const rankColors = {
    1: "bg-warning",
    2: "bg-muted-foreground",
    3: "bg-accent-foreground",
  };
  const rankColor = rankColors[rank as keyof typeof rankColors] || "bg-muted-foreground";

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div
          className={
            "absolute -left-1 -top-1 size-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold z-10 " +
            rankColor
          }
        >
          {rank}
        </div>
        <UserAvatar user={creator} className="size-14" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <Link href={`/@${creator.username}`} className="font-semibold truncate hover:underline">
            {creator.displayName || creator.username}
          </Link>
          {creator.isVerified && <BadgeCheck className="size-4 text-primary flex-shrink-0" />}
        </div>
        <p className="text-sm text-muted-foreground">@{creator.username}</p>
        <p className="text-xs text-muted-foreground">
          {creator.followersCount?.toLocaleString() ?? 0} followers
        </p>
      </div>

      <Link
        href={`/@${creator.username}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        View
      </Link>
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="size-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
