"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Crown, Search, UserPlus, X, Loader2, BadgeCheck, Star } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const MAX_VIPS = 100;

export function VIPManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingVIP, setIsAddingVIP] = useState(false);
  const currentUser = useQuery(api.users.currentUser);

  const vips = useQuery(
    api.vips.getVIPs,
    currentUser?._id ? { creatorId: currentUser._id } : "skip"
  );
  const searchUsers = useQuery(
    api.users.search,
    searchQuery.length >= 2 ? { query: searchQuery, limit: 10 } : "skip"
  );
  const addVIP = useMutation(api.vips.addVIP);
  const removeVIP = useMutation(api.vips.removeVIP);

  if (vips === undefined) {
    return <VIPManagerSkeleton />;
  }

  const handleAddVIP = async (memberId: Id<"users">) => {
    try {
      await addVIP({ memberId });
      toast.success("VIP added!");
      setSearchQuery("");
      setIsAddingVIP(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add VIP");
    }
  };

  const handleRemoveVIP = async (memberId: Id<"users">) => {
    try {
      await removeVIP({ memberId });
      toast.success("VIP removed");
    } catch (error) {
      toast.error("Failed to remove VIP");
    }
  };

  const vipUserIds = new Set(vips.map((v) => v.member._id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Crown className="size-5 text-warning" />
            VIP Members
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {vips.length} / {MAX_VIPS} VIP spots used
          </p>
        </div>
        <Dialog open={isAddingVIP} onOpenChange={setIsAddingVIP}>
          <DialogTrigger asChild>
            <Button className="gap-2" disabled={vips.length >= MAX_VIPS}>
              <UserPlus className="size-4" />
              Add VIP
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add VIP Member</DialogTitle>
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
                      const isAlreadyVIP = vipUserIds.has(user._id);
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
                            disabled={isAlreadyVIP}
                            onClick={() => handleAddVIP(user._id)}
                          >
                            {isAlreadyVIP ? "Already VIP" : "Add"}
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

      {/* VIP List */}
      {vips.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="size-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
              <Star className="size-8 text-warning" />
            </div>
            <h3 className="font-semibold text-lg mb-1">No VIPs yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Add your top supporters as VIPs for exclusive perks
            </p>
            <Button onClick={() => setIsAddingVIP(true)} className="gap-2">
              <UserPlus className="size-4" />
              Add Your First VIP
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vips.map((vip) => (
            <Card key={vip._id}>
              <CardContent className="p-4 flex items-center gap-3">
                <Link href={`/@${vip.member?.username}`}>
                  <UserAvatar
                    user={vip.member}
                    className="size-12 ring-2 ring-warning ring-offset-2 ring-offset-background"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/@${vip.member?.username}`}
                      className="font-medium truncate hover:underline"
                    >
                      {vip.member?.displayName || vip.member?.username}
                    </Link>
                    {vip.member?.isVerified && <BadgeCheck className="size-4 text-primary" />}
                    <Crown className="size-4 text-warning" />
                  </div>
                  <p className="text-sm text-muted-foreground">@{vip.member?.username}</p>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground">
                      <X className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove VIP?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove{" "}
                        {vip.member?.displayName || vip.member?.username} from your VIP list?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleRemoveVIP(vip.member._id)}
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

function VIPManagerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-24 mt-2" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
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
