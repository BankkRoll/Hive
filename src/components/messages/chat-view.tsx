"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { TipModal } from "@/components/tips/tip-modal";
import { DmPaywall } from "./dm-paywall";
import {
  ArrowLeft,
  BadgeCheck,
  Coins,
  Image,
  Loader2,
  MoreVertical,
  Send,
  Smile,
  Mic,
} from "lucide-react";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { VoicePlayer } from "@/components/voice/voice-player";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserPresence, formatLastActive } from "@/hooks/use-presence";
import { OnlineStatusText } from "@/components/ui/online-indicator";

interface ChatViewProps {
  conversationId: Id<"conversations">;
}

export function ChatView({ conversationId }: ChatViewProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUser = useQuery(api.users.currentUser);
  const messagesData = useQuery(api.messages.getMessages, {
    conversationId,
    limit: 100,
  });
  const conversations = useQuery(api.messages.getConversations, { limit: 50 });
  const sendMessage = useMutation(api.messages.send);
  const markAsRead = useMutation(api.messages.markAsRead);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const saveMedia = useMutation(api.media.saveMedia);

  const conversation = conversations?.find((c) => c._id === conversationId);
  const messages = messagesData?.messages ?? [];

  // Get online presence for the other user
  const { isOnline, lastActiveAt } = useUserPresence(conversation?.otherUser._id);

  // Check if user can DM this person
  const canDmCheck = useQuery(
    api.messages.canDmUser,
    conversation?.otherUser._id ? { userId: conversation.otherUser._id } : "skip"
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark as read
  useEffect(() => {
    if (conversation && conversation.unreadCount > 0) {
      markAsRead({ conversationId }).catch(console.error);
    }
  }, [conversationId, conversation?.unreadCount, markAsRead]);

  const handleSend = async () => {
    if (!message.trim() || !conversation || isSending) return;

    setIsSending(true);
    try {
      await sendMessage({
        recipientId: conversation.otherUser._id,
        content: message.trim(),
      });
      setMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceNoteComplete = async (voiceNoteId: string) => {
    if (!conversation) return;

    setIsSending(true);
    try {
      await sendMessage({
        recipientId: conversation.otherUser._id,
        content: "",
        voiceNoteId: voiceNoteId as Id<"voiceNotes">,
      });
      setShowVoiceRecorder(false);
      toast.success("Voice note sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send voice note");
    } finally {
      setIsSending(false);
    }
  };

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !conversation || isUploadingMedia) return;

    setIsUploadingMedia(true);
    try {
      const mediaIds: Id<"media">[] = [];

      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          toast.error("Only images and videos are supported");
          continue;
        }

        // Check file size (20MB for images, 500MB for videos)
        const maxSize = isImage ? 20 * 1024 * 1024 : 500 * 1024 * 1024;
        if (file.size > maxSize) {
          toast.error(`File too large. Max ${isImage ? "20MB" : "500MB"}`);
          continue;
        }

        // Get upload URL
        const uploadData = await generateUploadUrl();
        const uploadUrl = typeof uploadData === "string" ? uploadData : uploadData.url;

        // Upload file to storage
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error("Failed to upload file");
        }

        const { storageId } = await result.json();

        // Save media metadata
        const mediaId = await saveMedia({
          r2Key: storageId,
          type: isImage ? "image" : "video",
          mimeType: file.type,
          filename: file.name,
          size: file.size,
        });

        mediaIds.push(mediaId);
      }

      // Send message with media
      if (mediaIds.length > 0) {
        await sendMessage({
          recipientId: conversation.otherUser._id,
          content: message.trim() || "",
          mediaIds,
        });
        setMessage("");
        toast.success("Media sent");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload media");
    } finally {
      setIsUploadingMedia(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (messagesData === undefined || !currentUser) {
    return <ChatSkeleton />;
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground">Conversation not found</p>
      </div>
    );
  }

  // Show paywall if subscription is required
  if (
    canDmCheck &&
    !canDmCheck.canDm &&
    canDmCheck.reason === "SUBSCRIPTION_REQUIRED" &&
    canDmCheck.creator
  ) {
    return <DmPaywall creator={canDmCheck.creator} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background/95 backdrop-blur">
        <Link
          href="/messages"
          className={buttonVariants({ variant: "ghost", size: "icon", className: "lg:hidden" })}
        >
          <ArrowLeft className="size-5" />
        </Link>

        <Link
          href={`/@${conversation.otherUser.username}`}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <UserAvatar
            user={conversation.otherUser}
            className="size-10"
            showOnlineIndicator
            isOnline={isOnline}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold truncate">
                {conversation.otherUser.displayName || conversation.otherUser.username}
              </span>
              {conversation.otherUser.isVerified && (
                <BadgeCheck className="size-4 text-primary flex-shrink-0" />
              )}
            </div>
            <OnlineStatusText isOnline={isOnline} lastActiveText={formatLastActive(lastActiveAt)} />
          </div>
        </Link>

        <Button variant="ghost" size="icon">
          <MoreVertical className="size-5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <UserAvatar user={conversation.otherUser} className="size-16 mb-4" />
            <h3 className="font-semibold text-lg">
              {conversation.otherUser.displayName || conversation.otherUser.username}
            </h3>
            <p className="text-muted-foreground text-sm">
              Start your conversation with @{conversation.otherUser.username}
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = msg.senderId === currentUser._id;
            const showAvatar =
              !isOwn && (index === 0 || messages[index - 1]?.senderId !== msg.senderId);

            return (
              <div
                key={msg._id}
                className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}
              >
                {!isOwn && (
                  <div className="w-8">
                    {showAvatar && <UserAvatar user={msg.sender} className="size-8" />}
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-4 py-2",
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  )}
                >
                  {msg.content && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                  {msg.voiceNoteUrl && (
                    <VoicePlayer
                      audioUrl={msg.voiceNoteUrl}
                      duration={msg.voiceNoteDuration ?? undefined}
                      compact
                      className={cn("mt-1", isOwn && "[&_*]:text-primary-foreground")}
                    />
                  )}
                  {msg.tipAmount && (
                    <div
                      className={cn(
                        "flex items-center gap-1 text-xs mt-1 pt-1 border-t",
                        isOwn ? "border-primary-foreground/20" : "border-border"
                      )}
                    >
                      <Coins className="size-3 text-warning" />
                      <span>{msg.tipAmount} coins</span>
                    </div>
                  )}
                  <p
                    className={cn(
                      "text-[10px] mt-1",
                      isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    {formatDistanceToNow(new Date(msg.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        {showVoiceRecorder ? (
          <VoiceRecorder
            onComplete={handleVoiceNoteComplete}
            onCancel={() => setShowVoiceRecorder(false)}
            className="w-full"
          />
        ) : (
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingMedia}
            >
              {isUploadingMedia ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Image className="size-5" />
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => handleMediaUpload(e.target.files)}
            />
            <Button variant="ghost" size="icon" className="shrink-0">
              <Smile className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setShowTipModal(true)}
            >
              <Coins className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setShowVoiceRecorder(true)}
            >
              <Mic className="size-5" />
            </Button>
            <div className="flex-1 relative">
              <Textarea
                placeholder="Type a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                className="min-h-11 max-h-32 resize-none pr-12"
              />
            </div>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              className="shrink-0"
            >
              <Send className="size-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Tip Modal */}
      {conversation && (
        <TipModal
          open={showTipModal}
          onOpenChange={setShowTipModal}
          creator={{
            _id: conversation.otherUser._id,
            username: conversation.otherUser.username,
            displayName: conversation.otherUser.displayName,
            avatarR2Key: conversation.otherUser.avatarR2Key,
            isVerified: conversation.otherUser.isVerified,
          }}
        />
      )}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b">
        <Skeleton className="size-10 rounded-full" />
        <div>
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
            <Skeleton className={cn("h-12 rounded-2xl", i % 2 === 0 ? "w-48" : "w-32")} />
          </div>
        ))}
      </div>
    </div>
  );
}
