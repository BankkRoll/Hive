"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Shield, Search, UserPlus, X, BadgeCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface ModeratorManagerProps {
  creatorId: Id<"users">;
}

export function ModeratorManager({ creatorId }: ModeratorManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const moderators = useQuery(api.moderators.getModerators, { creatorId });
  const searchUsers = useQuery(
    api.users.search,
    searchQuery.length >= 2 ? { query: searchQuery, limit: 10 } : "skip"
  );
  const addModerator = useMutation(api.moderators.addModerator);
  const removeModerator = useMutation(api.moderators.removeModerator);

  if (moderators === undefined) {
    return <ModeratorManagerSkeleton />;
  }

  const handleAdd = async (moderatorId: Id<"users">) => {
    try {
      await addModerator({ moderatorId });
      toast.success("Moderator added!");
      setSearchQuery("");
      setIsAdding(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add moderator");
    }
  };

  const handleRemove = async (moderatorId: Id<"users">) => {
    try {
      await removeModerator({ moderatorId });
      toast.success("Moderator removed");
    } catch (error) {
      toast.error("Failed to remove moderator");
    }
  };

  const modUserIds = new Set(moderators.map((m) => m.moderator._id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="size-5 text-info" />
            Moderators
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {moderators.length} moderator{moderators.length !== 1 ? "s" : ""} managing your content
          </p>
        </div>
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="size-4" />
              Add Moderator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Moderator</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username..."
                  className="pl-9"
                />
              </div>

              {searchQuery.length >= 2 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchUsers === undefined ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="size-10 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))
                  ) : searchUsers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No users found</p>
                  ) : (
                    searchUsers.map((user) => {
                      const isAlreadyMod = modUserIds.has(user._id);
                      return (
                        <div
                          key={user._id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted"
                        >
                          <UserAvatar user={user} className="size-10" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium truncate">
                                {user.displayName || user.username}
                              </span>
                              {user.isVerified && <BadgeCheck className="size-4 text-primary" />}
                            </div>
                            <p className="text-sm text-muted-foreground">@{user.username}</p>
                          </div>
                          <Button
                            size="sm"
                            disabled={isAlreadyMod}
                            onClick={() => handleAdd(user._id)}
                          >
                            {isAlreadyMod ? "Already Mod" : "Add"}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Moderator Permissions Info */}
      <Card className="bg-info/5 border-info/20">
        <CardContent className="p-4">
          <h3 className="font-medium flex items-center gap-2 mb-2">
            <ShieldCheck className="size-4 text-info" />
            Moderator Permissions
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Delete comments on your posts</li>
            <li>• Hide/unhide comments</li>
            <li>• Ban users from commenting</li>
            <li>• Review flagged content</li>
          </ul>
        </CardContent>
      </Card>

      {/* Moderator List */}
      {moderators.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="size-16 rounded-full bg-info/10 flex items-center justify-center mb-4">
              <Shield className="size-8 text-info" />
            </div>
            <h3 className="font-semibold text-lg mb-1">No moderators yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Add trusted followers to help manage your comments
            </p>
            <Button onClick={() => setIsAdding(true)} className="gap-2">
              <UserPlus className="size-4" />
              Add Your First Moderator
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {moderators.map((mod) => (
            <Card key={mod._id}>
              <CardContent className="p-4 flex items-center gap-3">
                <Link href={`/@${mod.moderator.username}`}>
                  <UserAvatar
                    user={mod.moderator}
                    className="size-12 ring-2 ring-info ring-offset-2 ring-offset-background"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/@${mod.moderator.username}`}
                      className="font-medium truncate hover:underline"
                    >
                      {mod.moderator.displayName || mod.moderator.username}
                    </Link>
                    <Shield className="size-4 text-info" />
                  </div>
                  <p className="text-sm text-muted-foreground">@{mod.moderator.username}</p>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground">
                      <X className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Moderator?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove{" "}
                        {mod.moderator.displayName || mod.moderator.username} as a moderator?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemove(mod.moderator._id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeratorManagerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-40 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-40 mb-2" />
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-48" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-3 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
