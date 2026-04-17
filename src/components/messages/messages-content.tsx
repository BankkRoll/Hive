"use client";

import { ConversationList } from "@/components/messages/conversation-list";
import { ChatView } from "@/components/messages/chat-view";
import { Mail } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

interface MessagesContentProps {
  conversationId?: Id<"conversations">;
}

export function MessagesContent({ conversationId }: MessagesContentProps) {
  return (
    <div className="flex h-[calc(100dvh-5rem)] lg:h-dvh">
      {/* Conversation List - Hidden on mobile when viewing a chat */}
      <div
        className={`${
          conversationId ? "hidden lg:flex" : "flex"
        } flex-col w-full lg:w-80 lg:border-r bg-background`}
      >
        <ConversationList activeConversationId={conversationId} />
      </div>

      {/* Chat View */}
      <div className={`${conversationId ? "flex" : "hidden lg:flex"} flex-1 flex-col`}>
        {conversationId ? <ChatView conversationId={conversationId} /> : <EmptyChat />}
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <Mail className="size-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-bold mb-2">Your Messages</h2>
      <p className="text-muted-foreground max-w-sm">
        Select a conversation from the list or start a new one by messaging a creator.
      </p>
    </div>
  );
}
