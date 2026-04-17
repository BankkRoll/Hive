"use client";

import { useQuery } from "convex/react";
import { useQueryState } from "nuqs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PostCard } from "@/components/post/post-card";
import { PostCardSkeleton } from "@/components/post/post-card-skeleton";
import { Grid3X3, FileText, Heart } from "lucide-react";
import { profileTabParser, type ProfileTab } from "@/lib/search-params";

interface ProfileTabsProps {
  userId: Id<"users">;
  isOwnProfile: boolean;
}

export function ProfileTabs({ userId, isOwnProfile }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    profileTabParser.withOptions({
      history: "push",
    })
  );

  const posts = useQuery(api.posts.getByUser, { userId, limit: 20 });
  const likedPosts = useQuery(api.likes.getLikedPosts, isOwnProfile ? { limit: 20 } : "skip");

  return (
    <Tabs
      value={activeTab ?? "posts"}
      onValueChange={(v) => setActiveTab(v as ProfileTab)}
      className="w-full"
    >
      <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
        <TabsTrigger
          value="posts"
          className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
        >
          <FileText className="size-4 mr-2" />
          Posts
        </TabsTrigger>
        <TabsTrigger
          value="media"
          className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
        >
          <Grid3X3 className="size-4 mr-2" />
          Media
        </TabsTrigger>
        {isOwnProfile && (
          <TabsTrigger
            value="likes"
            className="flex-1 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
          >
            <Heart className="size-4 mr-2" />
            Likes
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="posts" className="mt-0 divide-y divide-border">
        {posts === undefined ? (
          Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
        ) : posts.posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-1">No posts yet</h3>
            <p className="text-muted-foreground text-sm">
              {isOwnProfile ? "Share your first post!" : "This user hasn't posted anything yet."}
            </p>
          </div>
        ) : (
          posts.posts.map((post) => <PostCard key={post._id} post={post} />)
        )}
      </TabsContent>

      <TabsContent value="media" className="mt-0">
        {posts === undefined ? (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {posts.posts
              .filter((post) => post.mediaUrls && post.mediaUrls.length > 0)
              .flatMap((post) =>
                post.mediaUrls!.map((url: string, idx: number) => (
                  <a
                    key={`${post._id}-${idx}`}
                    href={`/post/${post._id}`}
                    className="aspect-square relative group overflow-hidden"
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </a>
                ))
              )}
            {posts.posts.filter((post) => post.mediaUrls?.length).length === 0 && (
              <div className="col-span-3 flex flex-col items-center justify-center py-16 text-center">
                <Grid3X3 className="size-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-1">No media yet</h3>
                <p className="text-muted-foreground text-sm">Photos and videos will appear here.</p>
              </div>
            )}
          </div>
        )}
      </TabsContent>

      {isOwnProfile && (
        <TabsContent value="likes" className="mt-0 divide-y divide-border">
          {likedPosts === undefined ? (
            Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
          ) : likedPosts.posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Heart className="size-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg mb-1">No liked posts</h3>
              <p className="text-muted-foreground text-sm">Posts you like will appear here.</p>
            </div>
          ) : (
            likedPosts.posts.map((post) => <PostCard key={post._id} post={post} />)
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}
