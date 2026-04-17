"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TwitchIcon } from "@/components/logos/twitch-icon";
import { KickIcon } from "@/components/logos/kick-icon";
import { toast } from "sonner";
import { ExternalLink, Link2, Unlink, Radio, Loader2, Eye, Bell } from "lucide-react";

export function StreamingSettings() {
  const linkedAccounts = useQuery(api.streaming.getLinkedAccounts);
  const settings = useQuery(api.settings.get);
  const updateSettings = useMutation(api.settings.update);
  const unlinkTwitch = useMutation(api.streaming.unlinkTwitchAccount);
  const unlinkKick = useMutation(api.streaming.unlinkKickAccount);

  const [isUnlinking, setIsUnlinking] = useState<"twitch" | "kick" | null>(null);

  const handleUnlink = async (platform: "twitch" | "kick") => {
    setIsUnlinking(platform);
    try {
      if (platform === "twitch") {
        await unlinkTwitch();
      } else {
        await unlinkKick();
      }
      toast.success(`${platform === "twitch" ? "Twitch" : "Kick"} account disconnected`);
    } catch (error) {
      toast.error(`Failed to disconnect ${platform} account`);
    } finally {
      setIsUnlinking(null);
    }
  };

  const handleConnect = (platform: "twitch" | "kick") => {
    // Redirect to OAuth flow
    const oauthUrl =
      platform === "twitch" ? `/api/auth/twitch?connect=true` : `/api/auth/kick?connect=true`;

    window.location.href = oauthUrl;
  };

  const toggleSetting = async (
    key: "showLiveStatus" | "notifyFollowersOnLive",
    currentValue: boolean
  ) => {
    try {
      await updateSettings({ [key]: !currentValue });
      toast.success("Setting updated");
    } catch (error) {
      toast.error("Failed to update setting");
    }
  };

  if (!linkedAccounts || !settings) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Streaming"
          description="Connect your streaming accounts"
          backHref="/settings"
        />
        <div className="p-4 space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <PageHeader
        title="Streaming"
        description="Connect your streaming accounts"
        backHref="/settings"
      />
      <div className="p-4 space-y-4">
        {/* Connected Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-5" />
              Connected Accounts
            </CardTitle>
            <CardDescription>Link your streaming accounts to show when you're live</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Twitch */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-[#9146FF]/10 flex items-center justify-center">
                  <TwitchIcon className="size-6" />
                </div>
                <div>
                  <p className="font-medium">Twitch</p>
                  {linkedAccounts.twitch ? (
                    <p className="text-sm text-muted-foreground">
                      Connected as{" "}
                      <a
                        href={`https://twitch.tv/${linkedAccounts.twitch.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#9146FF] hover:underline inline-flex items-center gap-1"
                      >
                        {linkedAccounts.twitch.username}
                        <ExternalLink className="size-3" />
                      </a>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>

              {linkedAccounts.twitch ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={isUnlinking === "twitch"}
                    >
                      {isUnlinking === "twitch" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Unlink className="size-4" />
                      )}
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Twitch?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your live status will no longer be shown to your followers. You can
                        reconnect at any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleUnlink("twitch")}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleConnect("twitch")}
                >
                  <Link2 className="size-4" />
                  Connect
                </Button>
              )}
            </div>

            {/* Kick */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-[#53FC18]/10 flex items-center justify-center">
                  <KickIcon className="size-6" />
                </div>
                <div>
                  <p className="font-medium">Kick</p>
                  {linkedAccounts.kick ? (
                    <p className="text-sm text-muted-foreground">
                      Connected as{" "}
                      <a
                        href={`https://kick.com/${linkedAccounts.kick.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#53FC18] hover:underline inline-flex items-center gap-1"
                      >
                        {linkedAccounts.kick.username}
                        <ExternalLink className="size-3" />
                      </a>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>

              {linkedAccounts.kick ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={isUnlinking === "kick"}
                    >
                      {isUnlinking === "kick" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Unlink className="size-4" />
                      )}
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Kick?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your live status will no longer be shown to your followers. You can
                        reconnect at any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleUnlink("kick")}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleConnect("kick")}
                >
                  <Link2 className="size-4" />
                  Connect
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Status Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="size-5" />
              Live Status
            </CardTitle>
            <CardDescription>
              Control how your live status is displayed and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Eye className="size-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Show live status</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Display a live indicator on your profile when streaming
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.showLiveStatus}
                onCheckedChange={() => toggleSetting("showLiveStatus", settings.showLiveStatus)}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Bell className="size-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Notify followers when live</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Send a notification to followers when you go live
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.notifyFollowersOnLive}
                onCheckedChange={() =>
                  toggleSetting("notifyFollowersOnLive", settings.notifyFollowersOnLive)
                }
              />
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1">
          When connected, your profile will automatically show a live indicator when you start
          streaming based on your settings above.
        </p>
      </div>
    </div>
  );
}
