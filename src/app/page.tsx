"use client";

import { useAuthDialog } from "@/components/auth/auth-dialog";
import { HiveLogo } from "@/components/logos/hive-logo";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { PostCard } from "@/components/post/post-card";
import { PostCardSkeleton } from "@/components/post/post-card-skeleton";
import { StoriesRow, StoriesRowSkeleton } from "@/components/stories/stories-row";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { feedTypeParser, type FeedType } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowUp, FileQuestion, Loader2, Sparkles } from "lucide-react";
import { useQueryState } from "nuqs";
import * as React from "react";
import { api } from "../../convex/_generated/api";

// Type for feed posts - inferred from query result
type FeedResult = typeof api.feed.getForYouFeed extends { _returnType: infer R } ? R : never;
type FeedPost = NonNullable<FeedResult>["posts"][number];

export default function HomePage() {
  const [feedType, setFeedType] = useQueryState(
    "feed",
    feedTypeParser.withOptions({
      history: "push",
    })
  );
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { openAuthDialog } = useAuthDialog();

  // Feed state
  const currentFeed = feedType ?? "for_you";
  const [posts, setPosts] = React.useState<FeedPost[]>([]);
  const [cursor, setCursor] = React.useState<number | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [newestPostTime, setNewestPostTime] = React.useState<number>(() => Date.now());
  const [showNewPostsIndicator, setShowNewPostsIndicator] = React.useState(false);
  const feedContainerRef = React.useRef<HTMLDivElement>(null);

  // Get current user for sidebar
  const user = useQuery(api.users.currentUser);

  // Initial feed query
  const initialFeed = useQuery(
    currentFeed === "for_you" ? api.feed.getForYouFeed : api.feed.getFollowingFeed,
    { limit: 20 }
  );

  // Paginated feed query (only when cursor is set)
  const paginatedFeed = useQuery(
    currentFeed === "for_you" ? api.feed.getForYouFeed : api.feed.getFollowingFeed,
    cursor ? { limit: 20, cursor } : "skip"
  );

  // Check for new posts
  const newPostsCheck = useQuery(
    api.feed.checkNewPosts,
    newestPostTime > 0
      ? {
          feedType: currentFeed as "for_you" | "following",
          since: newestPostTime,
        }
      : "skip"
  );

  // Update posts when initial feed loads
  React.useEffect(() => {
    if (initialFeed?.posts && !cursor) {
      setPosts(initialFeed.posts);
      if (initialFeed.posts.length > 0) {
        setNewestPostTime(initialFeed.posts[0].createdAt);
      }
    }
  }, [initialFeed, cursor]);

  // Append posts when paginated feed loads
  React.useEffect(() => {
    if (paginatedFeed?.posts && cursor) {
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p._id));
        const newPosts = paginatedFeed.posts.filter((p) => !existingIds.has(p._id));
        return [...prev, ...newPosts];
      });
      setIsLoadingMore(false);
    }
  }, [paginatedFeed, cursor]);

  // Show new posts indicator when there are new posts
  React.useEffect(() => {
    if (newPostsCheck && newPostsCheck.count > 0) {
      setShowNewPostsIndicator(true);
    }
  }, [newPostsCheck]);

  // Reset feed when switching tabs
  React.useEffect(() => {
    setPosts([]);
    setCursor(undefined);
    setShowNewPostsIndicator(false);
    setNewestPostTime(Date.now());
  }, [currentFeed]);

  const handleFeedTypeChange = (type: string) => {
    if (type === "following" && !isAuthenticated) {
      openAuthDialog();
      return;
    }
    setFeedType(type as FeedType);
  };

  // Load new posts (refresh)
  const handleLoadNewPosts = React.useCallback(() => {
    setPosts([]);
    setCursor(undefined);
    setShowNewPostsIndicator(false);
    setNewestPostTime(Date.now());
    // Scroll to top
    feedContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Pull to refresh
  const { containerRef, pullDistance, isRefreshing, isPulling } = usePullRefresh({
    onRefresh: handleLoadNewPosts,
    threshold: 80,
  });

  // Infinite scroll
  const hasMore =
    currentFeed === "for_you"
      ? initialFeed?.nextCursor !== undefined || paginatedFeed?.nextCursor !== undefined
      : initialFeed?.nextCursor !== undefined || paginatedFeed?.nextCursor !== undefined;

  const handleLoadMore = React.useCallback(() => {
    if (isLoadingMore) return;

    const nextCursor = paginatedFeed?.nextCursor ?? initialFeed?.nextCursor;
    if (nextCursor) {
      setIsLoadingMore(true);
      setCursor(nextCursor);
    }
  }, [isLoadingMore, paginatedFeed?.nextCursor, initialFeed?.nextCursor]);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore: hasMore,
    isLoading: isLoadingMore || initialFeed === undefined,
  });

  // Wait for both auth and feed to load before showing content
  const isLoading = authLoading || initialFeed === undefined;
  const newPostsCount = newPostsCheck?.count ?? 0;

  return (
    <SidebarProvider>
      <AppSidebar
        user={
          user
            ? {
                _id: user._id,
                username: user.username,
                displayName: user.displayName,
                avatarR2Key: user.avatarR2Key,
                dicebearSeed: user.dicebearSeed,
                dicebearBgColor: user.dicebearBgColor,
                dicebearEyes: user.dicebearEyes,
                dicebearMouth: user.dicebearMouth,
              }
            : null
        }
      />
      <SidebarInset>
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 bg-background/80 backdrop-blur-sm border-b">
          <div className="flex items-center gap-2 px-4 w-full">
            {/* Sidebar trigger - desktop */}
            <SidebarTrigger className="-ml-1 hidden lg:flex" />
            <Separator orientation="vertical" className="mr-2 h-4 hidden lg:block" />

            {/* Mobile header */}
            <div className="flex items-center justify-between w-full lg:hidden">
              <div className="text-primary w-10">
                <HiveLogo className="h-6 w-auto" />
              </div>

              {/* Feed tabs - mobile (centered) */}
              <Tabs value={currentFeed} onValueChange={handleFeedTypeChange}>
                <TabsList className="h-9 p-1 bg-muted">
                  <TabsTrigger value="for_you" className="h-7 px-3 text-xs font-medium">
                    For You
                  </TabsTrigger>
                  <TabsTrigger value="following" className="h-7 px-3 text-xs font-medium">
                    Following
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Theme toggle - mobile */}
              <AnimatedThemeToggler />
            </div>

            {/* Desktop header content */}
            <div className="hidden lg:flex items-center justify-between flex-1">
              <h1 className="text-lg font-semibold">Home</h1>
              <Tabs value={currentFeed} onValueChange={handleFeedTypeChange}>
                <TabsList className="h-9 p-1 bg-muted">
                  <TabsTrigger value="for_you" className="h-7 px-3 text-sm font-medium">
                    For You
                  </TabsTrigger>
                  <TabsTrigger value="following" className="h-7 px-3 text-sm font-medium">
                    Following
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {/* Theme toggle - desktop */}
              <AnimatedThemeToggler />
            </div>
          </div>
        </header>

        {/* Welcome banner for non-authenticated users */}
        {!isAuthenticated && !authLoading && (
          <div className="sticky top-14 z-30 bg-gradient-to-r from-primary/10 via-primary/5 to-background border-b">
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold">Welcome to Hive</h2>
                  <p className="text-sm text-muted-foreground">
                    Sign in to like, comment, and follow your favorite creators
                  </p>
                </div>
                <Button onClick={() => openAuthDialog()} size="sm">
                  Sign in
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Floating New Posts Indicator (Twitter-style) */}
        {showNewPostsIndicator && newPostsCount > 0 && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 lg:left-[calc(50%+var(--sidebar-width)/2)]">
            <Button
              onClick={handleLoadNewPosts}
              size="sm"
              className="rounded-full shadow-lg gap-2 px-4 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <ArrowUp className="size-4" />
              {newPostsCount >= 99 ? "99+" : newPostsCount} new post
              {newPostsCount !== 1 ? "s" : ""}
            </Button>
          </div>
        )}

        {/* Main Content with Pull-to-Refresh */}
        <div
          ref={containerRef}
          className={cn(
            "flex flex-1 flex-col pb-20 lg:pb-0",
            isLoading ? "overflow-hidden" : "overflow-y-auto"
          )}
        >
          {/* Pull indicator */}
          <div
            className={cn(
              "flex items-center justify-center transition-all duration-200 overflow-hidden",
              isPulling || isRefreshing ? "opacity-100" : "opacity-0"
            )}
            style={{ height: pullDistance }}
          >
            <Loader2 className={cn("size-6 text-primary", isRefreshing && "animate-spin")} />
          </div>

          <div className="feed-container" ref={feedContainerRef}>
            {/* Stories - show skeleton during loading, real content when authenticated */}
            {isLoading ? <StoriesRowSkeleton /> : isAuthenticated && <StoriesRow />}

            {/* Feed */}
            <div className="divide-y divide-border">
              {isLoading ? (
                // Loading skeletons
                Array.from({ length: 5 }).map((_, i) => <PostCardSkeleton key={i} />)
              ) : posts.length > 0 ? (
                <>
                  {/* Posts */}
                  {posts.map((post) => (
                    <PostCard key={post._id} post={post} />
                  ))}

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="h-1" />

                  {/* Loading more indicator */}
                  {isLoadingMore && (
                    <div className="py-8 flex items-center justify-center">
                      <Loader2 className="size-6 animate-spin text-primary" />
                    </div>
                  )}

                  {/* End of feed */}
                  {!hasMore && posts.length > 5 && (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      You&apos;re all caught up!
                    </div>
                  )}
                </>
              ) : (
                // Empty state
                <div className="py-20 px-4 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <FileQuestion className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No posts yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    {currentFeed === "following"
                      ? "Follow some creators to see their posts here."
                      : "Check back later for new content."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </SidebarProvider>
  );
}
