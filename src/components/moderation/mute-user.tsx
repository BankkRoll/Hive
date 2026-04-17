"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { VolumeX, Volume2, Bell, BellOff, Eye, EyeOff, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// MUTE BUTTON (for profile/post menus)
// ============================================

interface MuteButtonProps {
  userId: Id<"users">;
  username?: string;
  onMuted?: () => void;
  asDropdownItem?: boolean;
}

export function MuteButton({ userId, username, onMuted, asDropdownItem }: MuteButtonProps) {
  const [open, setOpen] = useState(false);
  const [muteNotifications, setMuteNotifications] = useState(true);
  const [muteStories, setMuteStories] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const muteStatus = useQuery(api.mutes.isMuted, { userId });
  const mute = useMutation(api.mutes.mute);
  const unmute = useMutation(api.mutes.unmute);

  const isMuted = muteStatus?.muted ?? false;

  const handleMute = async () => {
    setIsLoading(true);
    try {
      await mute({ userId, muteNotifications, muteStories });
      toast.success(`@${username} has been muted`);
      setOpen(false);
      onMuted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mute user");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnmute = async () => {
    setIsLoading(true);
    try {
      await unmute({ userId });
      toast.success(`@${username} has been unmuted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unmute user");
    } finally {
      setIsLoading(false);
    }
  };

  if (isMuted) {
    if (asDropdownItem) {
      return (
        <DropdownMenuItem onClick={handleUnmute} disabled={isLoading} className="gap-2">
          <Volume2 className="size-4" />
          Unmute @{username}
        </DropdownMenuItem>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleUnmute}
        disabled={isLoading}
        className="gap-2"
      >
        <Volume2 className="size-4" />
        Unmute
      </Button>
    );
  }

  const TriggerButton = asDropdownItem ? (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        setOpen(true);
      }}
      className="gap-2"
    >
      <VolumeX className="size-4" />
      Mute @{username}
    </DropdownMenuItem>
  ) : (
    <Button variant="outline" size="sm" className="gap-2">
      <VolumeX className="size-4" />
      Mute
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{TriggerButton}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VolumeX className="size-5" />
            Mute @{username}
          </DialogTitle>
          <DialogDescription>
            Muted accounts won&apos;t appear in your feed, but they can still follow you and view
            your content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                {muteNotifications ? <BellOff className="size-4" /> : <Bell className="size-4" />}
              </div>
              <div>
                <Label htmlFor="mute-notifications" className="font-medium">
                  Mute Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Don&apos;t receive notifications from this user
                </p>
              </div>
            </div>
            <Switch
              id="mute-notifications"
              checked={muteNotifications}
              onCheckedChange={setMuteNotifications}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                {muteStories ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </div>
              <div>
                <Label htmlFor="mute-stories" className="font-medium">
                  Mute Stories
                </Label>
                <p className="text-sm text-muted-foreground">
                  Don&apos;t show stories from this user
                </p>
              </div>
            </div>
            <Switch id="mute-stories" checked={muteStories} onCheckedChange={setMuteStories} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleMute} disabled={isLoading}>
            {isLoading ? "Muting..." : "Mute User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MUTED USERS LIST
// ============================================

export function MutedUsersList() {
  const mutedUsers = useQuery(api.mutes.getMuted, {});
  const unmute = useMutation(api.mutes.unmute);
  const updateSettings = useMutation(api.mutes.updateMuteSettings);

  const [editingUser, setEditingUser] = useState<Id<"users"> | null>(null);

  const handleUnmute = async (userId: Id<"users">, username?: string) => {
    try {
      await unmute({ userId });
      toast.success(`@${username} has been unmuted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unmute user");
    }
  };

  const handleUpdateSettings = async (
    userId: Id<"users">,
    settings: { muteNotifications?: boolean; muteStories?: boolean }
  ) => {
    try {
      await updateSettings({ userId, ...settings });
      toast.success("Mute settings updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update settings");
    }
  };

  if (mutedUsers === undefined) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Muted Accounts"
          description="Manage your muted accounts"
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

  if (mutedUsers.length === 0) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Muted Accounts"
          description="Manage your muted accounts"
          backHref="/settings"
        />
        <div className="p-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <VolumeX className="size-12 mb-3 opacity-50" />
              <p className="font-medium">No Muted Users</p>
              <p className="text-sm">You haven&apos;t muted anyone yet</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <PageHeader
        title="Muted Accounts"
        description={`${mutedUsers.length} muted ${mutedUsers.length === 1 ? "account" : "accounts"}`}
        backHref="/settings"
      />
      <div className="p-4">
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="space-y-3">
            {mutedUsers.map((user) => (
              <MutedUserCard
                key={user._id}
                user={user}
                isEditing={editingUser === user._id}
                onEdit={() => setEditingUser(editingUser === user._id ? null : user._id)}
                onUnmute={() => handleUnmute(user._id, user.username)}
                onUpdateSettings={(settings) => handleUpdateSettings(user._id, settings)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface MutedUserCardProps {
  user: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    mutedAt: number;
    muteNotifications: boolean;
    muteStories: boolean;
  };
  isEditing: boolean;
  onEdit: () => void;
  onUnmute: () => void;
  onUpdateSettings: (settings: { muteNotifications?: boolean; muteStories?: boolean }) => void;
}

function MutedUserCard({
  user,
  isEditing,
  onEdit,
  onUnmute,
  onUpdateSettings,
}: MutedUserCardProps) {
  const mutedDate = new Date(user.mutedAt);

  return (
    <Card className={cn(isEditing && "ring-2 ring-primary")}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <UserAvatar user={user} className="size-12" />

          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{user.displayName || user.username}</p>
            <p className="text-sm text-muted-foreground">
              @{user.username} · Muted {mutedDate.toLocaleDateString()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onEdit} className="size-9">
              <Settings className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onUnmute} className="gap-1">
              <Volume2 className="size-4" />
              Unmute
            </Button>
          </div>
        </div>

        {isEditing && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {user.muteNotifications ? (
                  <BellOff className="size-4 text-muted-foreground" />
                ) : (
                  <Bell className="size-4" />
                )}
                <span className="text-sm">Mute Notifications</span>
              </div>
              <Switch
                checked={user.muteNotifications}
                onCheckedChange={(checked) => onUpdateSettings({ muteNotifications: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {user.muteStories ? (
                  <EyeOff className="size-4 text-muted-foreground" />
                ) : (
                  <Eye className="size-4" />
                )}
                <span className="text-sm">Mute Stories</span>
              </div>
              <Switch
                checked={user.muteStories}
                onCheckedChange={(checked) => onUpdateSettings({ muteStories: checked })}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// MUTE STATUS INDICATOR
// ============================================

interface MuteStatusProps {
  userId: Id<"users">;
  showLabel?: boolean;
}

export function MuteStatus({ userId, showLabel = false }: MuteStatusProps) {
  const muteStatus = useQuery(api.mutes.isMuted, { userId });

  if (!muteStatus?.muted) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      <VolumeX className="size-3" />
      {showLabel && <span className="text-xs">Muted</span>}
    </div>
  );
}
