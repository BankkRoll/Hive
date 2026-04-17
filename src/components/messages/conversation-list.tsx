"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCheck, Mail, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUsersPresence } from "@/hooks/use-presence";

interface ConversationListProps {
  activeConversationId?: Id<"conversations">;
}

export function ConversationList({ activeConversationId }: ConversationListProps) {
  const [search, setSearch] = useState("");
  const conversations = useQuery(api.messages.getConversations, { limit: 50 });

  // Get all user IDs from conversations for presence lookup
  const userIds = useMemo(() => {
    if (!conversations) return undefined;
    return conversations.map((conv) => conv.otherUser._id);
  }, [conversations]);

  // Fetch presence for all conversation users
  const { getPresence } = useUsersPresence(userIds);

  const filteredConversations = conversations?.filter((conv) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      conv.otherUser.username?.toLowerCase().includes(searchLower) ||
      conv.otherUser.displayName?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold mb-4">Messages</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/50 border-0"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations === undefined ? (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <ConversationSkeleton key={i} />
            ))}
          </div>
        ) : filteredConversations && filteredConversations.length > 0 ? (
          <div className="divide-y">
            {filteredConversations.map((conv) => (
              <Link
                key={conv._id}
                href={`/messages/${conv._id}`}
                className={cn(
                  "flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors",
                  activeConversationId === conv._id && "bg-muted"
                )}
              >
                <UserAvatar
                  user={conv.otherUser}
                  className="size-12"
                  showOnlineIndicator
                  isOnline={getPresence(conv.otherUser._id).isOnline}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-semibold truncate">
                        {conv.otherUser.displayName || conv.otherUser.username}
                      </span>
                      {conv.otherUser.isVerified && (
                        <BadgeCheck className="size-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                    {conv.lastMessage && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(conv.lastMessage.createdAt), {
                          addSuffix: false,
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.lastMessage ? conv.lastMessage.content : "No messages yet"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <Badge
                        variant="default"
                        className="size-5 p-0 flex items-center justify-center text-[10px]"
                      >
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Mail className="size-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">
              {search ? "No conversations found" : "No messages yet"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {search
                ? `No conversations matching "${search}"`
                : "Start a conversation by messaging someone"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}
