"use client";

import { useQuery } from "convex/react";
import { useQueryState, useQueryStates } from "nuqs";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/post/post-card";
import { PostCardSkeleton } from "@/components/post/post-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, FileText, TrendingUp, BadgeCheck, X } from "lucide-react";
import Link from "next/link";
import { useDebounce } from "@/hooks/use-debounce";
import { searchQueryParser, searchTabParser, type SearchTab } from "@/lib/search-params";

export function SearchContent() {
  // URL state for search query and tab
  const [query, setQuery] = useQueryState(
    "q",
    searchQueryParser.withOptions({
      history: "replace",
      shallow: true,
      throttleMs: 300,
    })
  );
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    searchTabParser.withOptions({
      history: "push",
    })
  );

  const debouncedQuery = useDebounce(query ?? "", 300);

  const users = useQuery(
    api.users.search,
    debouncedQuery.length >= 2 ? { query: debouncedQuery, limit: 20 } : "skip"
  );

  const posts = useQuery(
    api.posts.search,
    debouncedQuery.length >= 2 ? { query: debouncedQuery, limit: 20 } : "skip"
  );

  const suggestions = useQuery(api.users.getSuggestions, { limit: 10 });

  const isSearching = debouncedQuery.length >= 2;
  const isLoading = isSearching && (users === undefined || posts === undefined);

  return (
    <div className="feed-container">
      {/* Search Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search creators, posts..."
              value={query ?? ""}
              onChange={(e) => setQuery(e.target.value || null)}
              className="pl-10 pr-10 h-12 rounded-full bg-muted/50 border-0 focus-visible:ring-2 focus-visible:ring-primary"
            />
            {query && (
              <button
                onClick={() => setQuery(null)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {isSearching && (
          <Tabs value={activeTab ?? "top"} onValueChange={(v) => setActiveTab(v as SearchTab)}>
            <TabsList className="w-full justify-start rounded-none bg-transparent h-auto p-0 border-b">
              <TabsTrigger
                value="top"
                className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
              >
                <TrendingUp className="size-4 mr-2" />
                Top
              </TabsTrigger>
              <TabsTrigger
                value="people"
                className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
              >
                <Users className="size-4 mr-2" />
                People
              </TabsTrigger>
              <TabsTrigger
                value="posts"
                className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
              >
                <FileText className="size-4 mr-2" />
                Posts
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Search Results or Suggestions */}
      {isSearching ? (
        <div>
          {(activeTab ?? "top") === "top" && (
            <div>
              {/* Top People */}
              {isLoading ? (
                <div className="p-4 space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-12 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {users && users.length > 0 && (
                    <div className="p-4 border-b">
                      <h3 className="font-semibold mb-3 text-sm text-muted-foreground">People</h3>
                      <div className="space-y-3">
                        {users.slice(0, 3).map((user) => (
                          <UserResult key={user._id} user={user} />
                        ))}
                      </div>
                      {users.length > 3 && (
                        <Button
                          variant="ghost"
                          className="w-full mt-3 text-primary"
                          onClick={() => setActiveTab("people" as SearchTab)}
                        >
                          Show all people
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Top Posts */}
                  {posts && posts.length > 0 && (
                    <div className="divide-y">
                      {posts.slice(0, 5).map((post) => (
                        <PostCard key={post._id} post={post} />
                      ))}
                    </div>
                  )}

                  {users?.length === 0 && posts?.length === 0 && (
                    <EmptySearchResults query={debouncedQuery} />
                  )}
                </>
              )}
            </div>
          )}

          {(activeTab ?? "top") === "people" && (
            <div className="p-4 space-y-3">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-12 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))
              ) : users && users.length > 0 ? (
                users.map((user) => <UserResult key={user._id} user={user} />)
              ) : (
                <EmptySearchResults query={debouncedQuery} type="people" />
              )}
            </div>
          )}

          {(activeTab ?? "top") === "posts" && (
            <div className="divide-y">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
              ) : posts && posts.length > 0 ? (
                posts.map((post) => <PostCard key={post._id} post={post} />)
              ) : (
                <EmptySearchResults query={debouncedQuery} type="posts" />
              )}
            </div>
          )}
        </div>
      ) : (
        /* Suggestions when not searching */
        <div className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="size-5 text-primary" />
            Suggested Creators
          </h3>

          {suggestions === undefined ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-9 w-20" />
                </div>
              ))}
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-4">
              {suggestions.map((user) => (
                <UserResult key={user._id} user={user} showFollow />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No suggestions available</p>
          )}
        </div>
      )}
    </div>
  );
}

interface UserResultProps {
  user: {
    _id: string;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    isVerified?: boolean;
    bio?: string;
    followersCount?: number;
  };
  showFollow?: boolean;
}

function UserResult({ user, showFollow }: UserResultProps) {
  return (
    <Link
      href={`/@${user.username}`}
      className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-muted/50 transition-colors"
    >
      <UserAvatar user={user} className="size-12" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold truncate">{user.displayName || user.username}</span>
          {user.isVerified && <BadgeCheck className="size-4 text-primary flex-shrink-0" />}
        </div>
        <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
        {user.bio && <p className="text-sm text-muted-foreground truncate mt-0.5">{user.bio}</p>}
      </div>

      {showFollow && (
        <Button variant="outline" size="sm">
          Follow
        </Button>
      )}
    </Link>
  );
}

function EmptySearchResults({ query, type }: { query: string; type?: "people" | "posts" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <Search className="size-12 text-muted-foreground/50 mb-4" />
      <h3 className="font-semibold text-lg mb-1">No results found</h3>
      <p className="text-muted-foreground text-sm">
        {type === "people"
          ? `No people found matching "${query}"`
          : type === "posts"
            ? `No posts found matching "${query}"`
            : `No results found for "${query}"`}
      </p>
    </div>
  );
}
