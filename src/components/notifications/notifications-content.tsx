"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";

export function NotificationsContent() {
  const notifications = useQuery(api.notifications.getAll, { limit: 50 });
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);

  const handleMarkAsRead = async (notificationId: Id<"notifications">) => {
    try {
      await markAsRead({ notificationId });
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const result = await markAllAsRead();
      toast.success(`Marked ${result.marked} notifications as read`);
    } catch (error) {
      toast.error("Failed to mark all as read");
    }
  };

  if (notifications === undefined) {
    return (
      <div className="feed-container">
        <NotificationsHeader unreadCount={0} onMarkAllAsRead={() => {}} isLoading />
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <NotificationSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <NotificationsHeader
        unreadCount={notifications.unreadCount}
        onMarkAllAsRead={handleMarkAllAsRead}
      />

      {notifications.notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Bell className="size-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">No notifications yet</h3>
          <p className="text-muted-foreground text-sm">
            When someone interacts with you, you'll see it here.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {notifications.notifications.map((notification) => (
            <NotificationItem
              key={notification._id}
              notification={notification}
              onMarkAsRead={handleMarkAsRead}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface NotificationsHeaderProps {
  unreadCount: number;
  onMarkAllAsRead: () => void;
  isLoading?: boolean;
}

function NotificationsHeader({
  unreadCount,
  onMarkAllAsRead,
  isLoading,
}: NotificationsHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && !isLoading && (
            <Button variant="ghost" size="sm" onClick={onMarkAllAsRead}>
              <CheckCheck className="size-4 mr-1.5" />
              Mark all read
            </Button>
          )}
          <Link
            href="/settings/notifications"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <Settings className="size-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
