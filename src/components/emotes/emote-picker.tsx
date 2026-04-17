"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Smile, Search, Clock, Star, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmotePickerProps {
  onSelect: (emote: { id: string; url: string; name: string }) => void;
  creatorId?: Id<"users">;
  triggerClassName?: string;
}

// Default emoji categories
const EMOJI_CATEGORIES = {
  recent: ["😀", "😂", "❤️", "🔥", "💯", "✨", "🎉", "👏"],
  smileys: [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "🤣",
    "😂",
    "🙂",
    "😊",
    "😇",
    "🥰",
    "😍",
    "🤩",
    "😘",
    "😗",
  ],
  hearts: [
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "🤍",
    "🤎",
    "💔",
    "❤️‍🔥",
    "❤️‍🩹",
    "💖",
    "💗",
    "💓",
    "💕",
  ],
  gestures: [
    "👍",
    "👎",
    "👏",
    "🙌",
    "🤝",
    "🙏",
    "✌️",
    "🤟",
    "🤘",
    "🤙",
    "👋",
    "🖐️",
    "✋",
    "🖖",
    "👌",
    "🤌",
  ],
  celebration: [
    "🎉",
    "🎊",
    "🎁",
    "🎂",
    "🎈",
    "🪅",
    "🎆",
    "🎇",
    "✨",
    "🌟",
    "⭐",
    "💫",
    "🔥",
    "💥",
    "💯",
    "🏆",
  ],
};

export function EmotePicker({ onSelect, creatorId, triggerClassName }: EmotePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("recent");

  // Fetch custom emotes if creatorId is provided
  const customEmotes = useQuery(api.emotes.getEmotes, creatorId ? { creatorId } : "skip");

  const handleEmojiSelect = (emoji: string) => {
    onSelect({ id: emoji, url: "", name: emoji });
    setOpen(false);
  };

  const handleCustomEmoteSelect = (emote: {
    _id: Id<"emotes">;
    imageUrl: string | null;
    name: string;
  }) => {
    onSelect({ id: emote._id, url: emote.imageUrl ?? "", name: emote.name });
    setOpen(false);
  };

  const filteredEmojis = search
    ? Object.values(EMOJI_CATEGORIES)
        .flat()
        .filter((emoji) => emoji.includes(search))
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("size-9", triggerClassName)}>
          <Smile className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emotes..."
              className="pl-9"
            />
          </div>
        </div>

        {search ? (
          <ScrollArea className="h-64 p-2">
            <div className="grid grid-cols-8 gap-1">
              {filteredEmojis?.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  onClick={() => handleEmojiSelect(emoji)}
                  className="size-8 flex items-center justify-center text-xl hover:bg-muted rounded transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
            {filteredEmojis?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">No emotes found</div>
            )}
          </ScrollArea>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start rounded-none border-b h-auto p-0 bg-transparent">
              <TabsTrigger
                value="recent"
                className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-3 py-2"
              >
                <Clock className="size-4" />
              </TabsTrigger>
              {creatorId && customEmotes && customEmotes.length > 0 && (
                <TabsTrigger
                  value="custom"
                  className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-3 py-2"
                >
                  <Star className="size-4" />
                </TabsTrigger>
              )}
              <TabsTrigger
                value="smileys"
                className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-3 py-2"
              >
                <Smile className="size-4" />
              </TabsTrigger>
              <TabsTrigger
                value="hearts"
                className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-3 py-2"
              >
                <Heart className="size-4" />
              </TabsTrigger>
              <TabsTrigger
                value="celebration"
                className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent px-3 py-2"
              >
                <Sparkles className="size-4" />
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-48">
              {/* Recent */}
              <TabsContent value="recent" className="p-2 m-0">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJI_CATEGORIES.recent.map((emoji, index) => (
                    <button
                      key={`recent-${index}`}
                      onClick={() => handleEmojiSelect(emoji)}
                      className="size-8 flex items-center justify-center text-xl hover:bg-muted rounded transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </TabsContent>

              {/* Custom Emotes */}
              {creatorId && (
                <TabsContent value="custom" className="p-2 m-0">
                  {customEmotes === undefined ? (
                    <div className="grid grid-cols-8 gap-1">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="size-8 rounded" />
                      ))}
                    </div>
                  ) : customEmotes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No custom emotes
                    </div>
                  ) : (
                    <div className="grid grid-cols-8 gap-1">
                      {customEmotes.map((emote) => (
                        <button
                          key={emote._id}
                          onClick={() => handleCustomEmoteSelect(emote)}
                          className="size-8 flex items-center justify-center hover:bg-muted rounded transition-colors"
                          title={emote.name}
                        >
                          <img
                            src={emote.imageUrl ?? ""}
                            alt={emote.name}
                            className="size-6 object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              )}

              {/* Emoji Categories */}
              {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => {
                if (category === "recent") return null;
                return (
                  <TabsContent key={category} value={category} className="p-2 m-0">
                    <div className="grid grid-cols-8 gap-1">
                      {emojis.map((emoji, index) => (
                        <button
                          key={`${category}-${index}`}
                          onClick={() => handleEmojiSelect(emoji)}
                          className="size-8 flex items-center justify-center text-xl hover:bg-muted rounded transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </TabsContent>
                );
              })}
            </ScrollArea>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}
