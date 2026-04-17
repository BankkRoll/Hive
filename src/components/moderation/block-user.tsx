"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Ban, UserX, ShieldOff, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Block User Dialog
interface BlockUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: Id<"users">;
  username?: string;
  displayName?: string;
  avatarR2Key?: string;
}

export function BlockUserDialog({
  open,
  onOpenChange,
  userId,
  username,
  displayName,
  avatarR2Key,
}: BlockUserDialogProps) {
  const [isBlocking, setIsBlocking] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const blockUser = useMutation(api.blocks.block);

  const handleBlock = async () => {
    setIsBlocking(true);
    try {
      await blockUser({ userId });
      setIsBlocked(true);
      toast.success(`Blocked @${username}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to block user");
    } finally {
      setIsBlocking(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => setIsBlocked(false), 200);
  };

  if (isBlocked) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="size-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="size-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">User Blocked</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              @{username} has been blocked. They won't be able to see your content or contact you.
            </p>
            <Button onClick={handleClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-5 text-destructive" />
            Block @{username}?
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 mb-4">
            <UserAvatar
              user={{ avatarR2Key, displayName, username, _id: userId }}
              className="size-12"
            />
            <div>
              <p className="font-medium">{displayName || username}</p>
              <p className="text-sm text-muted-foreground">@{username}</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="font-medium">What happens when you block someone:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <UserX className="size-4 mt-0.5 shrink-0" />
                <span>They won't be able to find your profile or posts</span>
              </li>
              <li className="flex items-start gap-2">
                <UserX className="size-4 mt-0.5 shrink-0" />
                <span>They won't be able to message you</span>
              </li>
              <li className="flex items-start gap-2">
                <UserX className="size-4 mt-0.5 shrink-0" />
                <span>Any existing follows between you will be removed</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldOff className="size-4 mt-0.5 shrink-0" />
                <span>You won't see their content anywhere on the platform</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleBlock}
            disabled={isBlocking}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isBlocking ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Blocking...
              </>
            ) : (
              <>
                <Ban className="size-4 mr-2" />
                Block
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Block Button for profile pages
interface BlockButtonProps {
  userId: Id<"users">;
  username?: string;
  displayName?: string;
  avatarR2Key?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  children?: React.ReactNode;
}

export function BlockButton({
  userId,
  username,
  displayName,
  avatarR2Key,
  variant = "ghost",
  size = "sm",
  className,
  children,
}: BlockButtonProps) {
  const [open, setOpen] = useState(false);
  const blockStatus = useQuery(api.blocks.isBlocked, { userId });

  if (blockStatus?.blockedByMe) {
    return (
      <UnblockButton
        userId={userId}
        username={username}
        variant={variant}
        size={size}
        className={className}
      />
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn("text-destructive", className)}
        onClick={() => setOpen(true)}
      >
        {children ?? (
          <>
            <Ban className="size-4 mr-1" />
            Block
          </>
        )}
      </Button>
      <BlockUserDialog
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        username={username}
        displayName={displayName}
        avatarR2Key={avatarR2Key}
      />
    </>
  );
}

// Unblock Button
interface UnblockButtonProps {
  userId: Id<"users">;
  username?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
}

export function UnblockButton({
  userId,
  username,
  variant = "outline",
  size = "sm",
  className,
}: UnblockButtonProps) {
  const [isUnblocking, setIsUnblocking] = useState(false);
  const unblockUser = useMutation(api.blocks.unblock);

  const handleUnblock = async () => {
    setIsUnblocking(true);
    try {
      await unblockUser({ userId });
      toast.success(`Unblocked @${username}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unblock");
    } finally {
      setIsUnblocking(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <ShieldOff className="size-4 mr-1" />
          Unblock
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unblock @{username}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will be able to find your profile, see your content, and contact you again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleUnblock} disabled={isUnblocking}>
            {isUnblocking ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Unblock
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Blocked Users List
export function BlockedUsersList() {
  const blockedUsers = useQuery(api.blocks.getBlocked, { limit: 50 });
  const unblockUser = useMutation(api.blocks.unblock);
  const [unblocking, setUnblocking] = useState<Id<"users"> | null>(null);

  const handleUnblock = async (userId: Id<"users">, username?: string) => {
    setUnblocking(userId);
    try {
      await unblockUser({ userId });
      toast.success(`Unblocked @${username}`);
    } catch (error) {
      toast.error("Failed to unblock");
    } finally {
      setUnblocking(null);
    }
  };

  if (blockedUsers === undefined) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Blocked Accounts"
          description="Manage your blocked accounts"
          backHref="/settings"
        />
        <div className="p-4 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24 mt-1" />
                  </div>
                  <Skeleton className="h-9 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Blocked Accounts"
          description="Manage your blocked accounts"
          backHref="/settings"
        />
        <div className="p-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Ban className="size-12 mb-3 opacity-50" />
              <p className="font-medium">No Blocked Users</p>
              <p className="text-sm">You haven&apos;t blocked anyone yet</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <PageHeader
        title="Blocked Accounts"
        description={`${blockedUsers.length} blocked ${blockedUsers.length === 1 ? "account" : "accounts"}`}
        backHref="/settings"
      />
      <div className="p-4">
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="space-y-3">
            {blockedUsers.map((user) => (
              <Card key={user._id}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <UserAvatar user={user} className="size-12" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.displayName || user.username}</p>
                      <p className="text-sm text-muted-foreground">
                        @{user.username} · Blocked {format(user.blockedAt, "MMM d, yyyy")}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={unblocking === user._id}
                          className="gap-1"
                        >
                          {unblocking === user._id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <>
                              <ShieldOff className="size-4" />
                              Unblock
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Unblock @{user.username}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            They will be able to find your profile, see your content, and contact
                            you again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleUnblock(user._id, user.username)}>
                            Unblock
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Blocked User Banner (shown when viewing blocked user's profile)
interface BlockedUserBannerProps {
  username?: string;
  userId: Id<"users">;
}

export function BlockedUserBanner({ username, userId }: BlockedUserBannerProps) {
  const [isUnblocking, setIsUnblocking] = useState(false);
  const unblockUser = useMutation(api.blocks.unblock);

  const handleUnblock = async () => {
    setIsUnblocking(true);
    try {
      await unblockUser({ userId });
      toast.success(`Unblocked @${username}`);
    } catch (error) {
      toast.error("Failed to unblock");
    } finally {
      setIsUnblocking(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-destructive/10 border-l-4 border-destructive">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 text-destructive" />
        <div>
          <p className="font-medium">You have blocked this user</p>
          <p className="text-sm text-muted-foreground">
            You won't see their content and they can't contact you
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={handleUnblock} disabled={isUnblocking}>
        {isUnblocking ? (
          <Loader2 className="size-4 animate-spin mr-2" />
        ) : (
          <ShieldOff className="size-4 mr-2" />
        )}
        Unblock
      </Button>
    </div>
  );
}

// "You're blocked" Banner (shown when blocked by another user)
export function YouAreBlockedBanner() {
  return (
    <div className="flex items-center gap-3 p-4 bg-muted/50 border rounded-lg">
      <Ban className="size-5 text-muted-foreground" />
      <div>
        <p className="font-medium">This user has restricted who can see their content</p>
        <p className="text-sm text-muted-foreground">
          You cannot view this profile or interact with their content
        </p>
      </div>
    </div>
  );
}
