"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Bell, BellOff, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function PushNotificationToggle() {
  const {
    status,
    isLoading,
    error,
    isSupported,
    isSubscribed,
    canSubscribe,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      const success = await subscribe();
      if (success) {
        toast.success("Push notifications enabled");
      } else if (error) {
        toast.error(error);
      }
    } else {
      const success = await unsubscribe();
      if (success) {
        toast.success("Push notifications disabled");
      } else if (error) {
        toast.error(error);
      }
    }
  };

  // Not supported message
  if (!isSupported) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellOff className="h-4 w-4 text-muted-foreground" />
          <Label className="text-muted-foreground">Push Notifications</Label>
        </div>
        <span className="text-xs text-muted-foreground">Not supported</span>
      </div>
    );
  }

  // Denied message
  if (status === "denied") {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <Label>Push Notifications</Label>
        </div>
        <span className="text-xs text-muted-foreground">Blocked in browser settings</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {isSubscribed ? (
          <Bell className="h-4 w-4 text-primary" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        )}
        <Label htmlFor="push-toggle">Push Notifications</Label>
      </div>
      <div className="flex items-center gap-2">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        <Switch
          id="push-toggle"
          checked={isSubscribed}
          onCheckedChange={handleToggle}
          disabled={isLoading || (!canSubscribe && !isSubscribed)}
        />
      </div>
    </div>
  );
}
