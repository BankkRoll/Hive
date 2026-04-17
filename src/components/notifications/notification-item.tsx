"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  MessageCircle,
  UserPlus,
  AtSign,
  Coins,
  Crown,
  Mail,
  Star,
  Shield,
  Bell,
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface NotificationItemProps {
  notification: {
    _id: Id<"notifications">;
    type: string;
    read: boolean;
    createdAt: number;
    amount?: number;
    postPreview?: string;
    commentPreview?: string;
    actor?: {
      _id: Id<"users">;
      username?: string;
      displayName?: string;
      avatarR2Key?: string;
      isVerified?: boolean;
    };
    postId?: Id<"posts">;
    commentId?: Id<"comments">;
    messageId?: Id<"messages">;
  };
  onMarkAsRead?: (id: Id<"notifications">) => void;
}

const notificationConfig: Record<
  string,
  {
    icon: React.ElementType;
    color: string;
    message: (n: NotificationItemProps["notification"]) => string;
  }
> = {
  follow: {
    icon: UserPlus,
    color: "text-info",
    message: () => "started following you",
  },
  like: {
    icon: Heart,
    color: "text-destructive",
    message: () => "liked your post",
  },
  comment: {
    icon: MessageCircle,
    color: "text-success",
    message: () => "commented on your post",
  },
  mention: {
    icon: AtSign,
    color: "text-primary",
    message: () => "mentioned you",
  },
  tip: {
    icon: Coins,
    color: "text-warning",
    message: (n) => `sent you ${n.amount ? `${n.amount} coins` : "a tip"}`,
  },
  subscription: {
    icon: Crown,
    color: "text-primary",
    message: () => "subscribed to you",
  },
  message: {
    icon: Mail,
    color: "text-info",
    message: () => "sent you a message",
  },
  vip_added: {
    icon: Star,
    color: "text-warning",
    message: () => "added you as a VIP",
  },
  mod_added: {
    icon: Shield,
    color: "text-success",
    message: () => "made you a moderator",
  },
  system: {
    icon: Bell,
    color: "text-muted-foreground",
    message: () => "",
  },
  payout_completed: {
    icon: Coins,
    color: "text-success",
    message: () => "Your payout has been processed",
  },
  payout_failed: {
    icon: Coins,
    color: "text-destructive",
    message: () => "Your payout failed",
  },
};

export function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  const config = notificationConfig[notification.type] ?? {
    icon: Bell,
    color: "text-muted-foreground",
    message: () => "",
  };

  const Icon = config.icon;
  const message = config.message(notification);

  const href = notification.postId
    ? `/post/${notification.postId}`
    : notification.messageId
      ? "/messages"
      : notification.actor
        ? `/@${notification.actor.username}`
        : "#";

  return (
    <Link
      href={href}
      className={cn(
        "flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors",
        !notification.read && "bg-primary/5"
      )}
      onClick={() => !notification.read && onMarkAsRead?.(notification._id)}
    >
      {/* Actor Avatar or Icon */}
      {notification.actor ? (
        <div className="relative">
          <UserAvatar user={notification.actor} className="size-10" />
          <div
            className={cn(
              "absolute -bottom-1 -right-1 size-5 rounded-full flex items-center justify-center bg-background border-2 border-background",
              config.color
            )}
          >
            <Icon className="size-3" />
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "size-10 rounded-full flex items-center justify-center bg-muted",
            config.color
          )}
        >
          <Icon className="size-5" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          {notification.actor && (
            <>
              <span className="font-semibold">
                {notification.actor.displayName || notification.actor.username}
              </span>
              {notification.actor.isVerified && (
                <BadgeCheck className="inline size-3.5 text-primary ml-0.5" />
              )}{" "}
            </>
          )}
          <span className="text-muted-foreground">{message}</span>
        </p>

        {/* Preview content */}
        {(notification.postPreview || notification.commentPreview) && (
          <p className="text-sm text-muted-foreground truncate mt-1">
            {notification.commentPreview || notification.postPreview}
          </p>
        )}

        {/* Tip amount badge */}
        {notification.type === "tip" && notification.amount && (
          <Badge variant="secondary" className="mt-2">
            <Coins className="size-3 mr-1 text-warning" />
            {notification.amount} coins
          </Badge>
        )}

        {/* Time */}
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </p>
      </div>

      {/* Unread indicator */}
      {!notification.read && <div className="size-2 rounded-full bg-primary flex-shrink-0 mt-2" />}
    </Link>
  );
}
