"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PostCard } from "@/components/post/post-card";
import { PostCardSkeleton } from "@/components/post/post-card-skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function BookmarksContent() {
  const bookmarks = useQuery(api.bookmarks.getAll, { limit: 50 });
  const count = useQuery(api.bookmarks.getCount);
  const clearAll = useMutation(api.bookmarks.clearAll);

  const handleClearAll = async () => {
    try {
      const result = await clearAll();
      toast.success(`Removed ${result.deleted} bookmarks`);
    } catch (error) {
      toast.error("Failed to clear bookmarks");
    }
  };

  return (
    <div className="feed-container">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Bookmarks</h1>
            {count !== undefined && count > 0 && (
              <span className="text-sm text-muted-foreground">{count} saved</span>
            )}
          </div>

          {bookmarks && bookmarks.posts.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="size-4 mr-1.5" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all bookmarks?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove all {count} saved posts from your bookmarks. This action cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Bookmarked Posts */}
      {bookmarks === undefined ? (
        <div className="divide-y">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : bookmarks.posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Bookmark className="size-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">No bookmarks yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Save posts by tapping the bookmark icon. They'll appear here for easy access later.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {bookmarks.posts.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
