"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Image as ImageIcon,
  Video,
  Lock,
  Globe,
  Users,
  Star,
  Crown,
  X,
  Loader2,
  Eye,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const MAX_CHARS = 5000;

type Visibility = "public" | "followers" | "subscribers" | "vip";

interface MediaPreview {
  id: string;
  file: File;
  preview: string;
  type: "image" | "video";
  uploading: boolean;
  mediaId?: Id<"media">;
}

const visibilityOptions: {
  value: Visibility;
  label: string;
  description: string;
  icon: typeof Globe;
}[] = [
  {
    value: "public",
    label: "Public",
    description: "Visible to everyone",
    icon: Globe,
  },
  {
    value: "followers",
    label: "Followers",
    description: "Only followers can see",
    icon: Users,
  },
  {
    value: "subscribers",
    label: "Subscribers",
    description: "Paid subscribers only",
    icon: Star,
  },
  {
    value: "vip",
    label: "VIP",
    description: "VIP tier subscribers",
    icon: Crown,
  },
];

export function PostComposer() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [isLocked, setIsLocked] = useState(false);
  const [unlockPrice, setUnlockPrice] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaPreview[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const createPost = useMutation(api.posts.create);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const saveMedia = useMutation(api.media.saveMedia);

  // Get current user for avatar display
  const currentUser = useQuery(api.users.currentUser);

  const charsRemaining = MAX_CHARS - content.length;
  const isOverLimit = charsRemaining < 0;
  const charPercentage = Math.min((content.length / MAX_CHARS) * 100, 100);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleFileSelect = useCallback(async (files: FileList | null, type: "image" | "video") => {
    if (!files) return;

    const newPreviews: MediaPreview[] = [];

    for (const file of Array.from(files)) {
      // Validate file type
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (type === "image" && !isImage) {
        toast.error("Please select an image file");
        continue;
      }
      if (type === "video" && !isVideo) {
        toast.error("Please select a video file");
        continue;
      }

      // Create preview
      const preview = URL.createObjectURL(file);
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      newPreviews.push({
        id,
        file,
        preview,
        type,
        uploading: false,
      });
    }

    setMediaFiles((prev) => [...prev, ...newPreviews]);
  }, []);

  const removeMedia = useCallback((id: string) => {
    setMediaFiles((prev) => {
      const toRemove = prev.find((m) => m.id === id);
      if (toRemove) {
        URL.revokeObjectURL(toRemove.preview);
      }
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const uploadMedia = async (media: MediaPreview): Promise<Id<"media"> | null> => {
    try {
      // Get upload URL
      const uploadData = await generateUploadUrl();
      const uploadUrl = typeof uploadData === "string" ? uploadData : uploadData.url;

      // Upload file
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": media.file.type },
        body: media.file,
      });

      if (!result.ok) {
        throw new Error("Failed to upload file");
      }

      const { storageId } = await result.json();

      // Get dimensions for images
      let width: number | undefined;
      let height: number | undefined;

      if (media.type === "image") {
        const img = new Image();
        img.src = media.preview;
        await new Promise((resolve) => {
          img.onload = resolve;
        });
        width = img.naturalWidth;
        height = img.naturalHeight;
      }

      // Save media metadata
      const mediaId = await saveMedia({
        r2Key: storageId,
        type: media.type,
        mimeType: media.file.type,
        filename: media.file.name,
        size: media.file.size,
        width,
        height,
      });

      return mediaId;
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(`Failed to upload ${media.file.name}`);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && mediaFiles.length === 0) {
      toast.error("Please add some content or media");
      return;
    }

    if (isOverLimit) {
      toast.error("Your post exceeds the character limit");
      return;
    }

    if (isLocked && (!unlockPrice || parseFloat(unlockPrice) < 1)) {
      toast.error("Please set a minimum unlock price of $1.00");
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload media files
      const uploadedMediaIds: Id<"media">[] = [];

      for (const media of mediaFiles) {
        setMediaFiles((prev) =>
          prev.map((m) => (m.id === media.id ? { ...m, uploading: true } : m))
        );

        const mediaId = await uploadMedia(media);
        if (mediaId) {
          uploadedMediaIds.push(mediaId);
        }

        setMediaFiles((prev) =>
          prev.map((m) =>
            m.id === media.id ? { ...m, uploading: false, mediaId: mediaId ?? undefined } : m
          )
        );
      }

      // Create post
      const postId = await createPost({
        content: content.trim(),
        visibility,
        mediaIds: uploadedMediaIds.length > 0 ? uploadedMediaIds : undefined,
        isLocked,
        unlockPrice: isLocked ? Math.round(parseFloat(unlockPrice) * 100) : undefined,
      });

      toast.success("Post created successfully!");

      // Redirect to the new post
      router.push(`/post/${postId}`);
    } catch (error) {
      console.error("Failed to create post:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create post");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedVisibility = visibilityOptions.find((v) => v.value === visibility);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 lg:px-6 lg:h-16">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-muted-foreground"
          >
            Cancel
          </Button>

          <div className="hidden lg:block">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "compose" | "preview")}>
              <TabsList className="h-9">
                <TabsTrigger value="compose" className="h-7 px-3 text-sm">
                  Compose
                </TabsTrigger>
                <TabsTrigger value="preview" className="h-7 px-3 text-sm">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || isOverLimit || (!content.trim() && mediaFiles.length === 0)}
            className="min-w-[80px]"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-1.5" />
                Post
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 lg:px-6">
          {/* Compose view */}
          {activeTab === "compose" && (
            <div className="space-y-6">
              {/* Main editor */}
              <div className="flex gap-3">
                <UserAvatar
                  user={currentUser}
                  className="w-10 h-10 ring-2 ring-offset-2 ring-offset-background ring-primary/20"
                />

                <div className="flex-1 space-y-4">
                  <Textarea
                    value={content}
                    onChange={handleContentChange}
                    placeholder="What's on your mind?"
                    className={cn(
                      "min-h-[150px] resize-none text-base border-none shadow-none p-0 focus-visible:ring-0 focus-visible:border-transparent bg-transparent",
                      isOverLimit && "text-destructive"
                    )}
                  />

                  {/* Media previews */}
                  {mediaFiles.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {mediaFiles.map((media) => (
                        <div
                          key={media.id}
                          className="relative rounded-xl overflow-hidden aspect-square bg-muted"
                        >
                          {media.type === "image" ? (
                            <img
                              src={media.preview}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video
                              src={media.preview}
                              className="w-full h-full object-cover"
                              controls
                            />
                          )}

                          {/* Loading overlay */}
                          {media.uploading && (
                            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                              <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            </div>
                          )}

                          {/* Remove button */}
                          {!media.uploading && (
                            <Button
                              variant="secondary"
                              size="icon"
                              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
                              onClick={() => removeMedia(media.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Character counter */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Media buttons */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-9 h-9 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isSubmitting}
                              />
                            }
                          >
                            <ImageIcon className="w-5 h-5" />
                          </TooltipTrigger>
                          <TooltipContent>Add photo</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-9 h-9 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => videoInputRef.current?.click()}
                                disabled={isSubmitting}
                              />
                            }
                          >
                            <Video className="w-5 h-5" />
                          </TooltipTrigger>
                          <TooltipContent>Add video</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {/* Hidden file inputs */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files, "image")}
                      />
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files, "video")}
                      />
                    </div>

                    {/* Character counter */}
                    <div className="flex items-center gap-3">
                      {content.length > 0 && (
                        <>
                          {/* Circular progress */}
                          <div className="relative w-6 h-6">
                            <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                fill="none"
                                className="stroke-muted"
                                strokeWidth="2"
                              />
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                fill="none"
                                className={cn(
                                  "transition-colors",
                                  charsRemaining <= 0
                                    ? "stroke-destructive"
                                    : charsRemaining <= 100
                                      ? "stroke-warning"
                                      : "stroke-primary"
                                )}
                                strokeWidth="2"
                                strokeDasharray={`${charPercentage * 0.628} 62.8`}
                              />
                            </svg>
                          </div>

                          {charsRemaining <= 100 && (
                            <span
                              className={cn(
                                "text-xs font-medium",
                                charsRemaining <= 0
                                  ? "text-destructive"
                                  : charsRemaining <= 100
                                    ? "text-warning"
                                    : "text-muted-foreground"
                              )}
                            >
                              {charsRemaining}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Post settings */}
              <div className="space-y-5">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Post Settings
                </h3>

                {/* Visibility selector */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Visibility</Label>
                    <p className="text-xs text-muted-foreground">
                      {selectedVisibility?.description}
                    </p>
                  </div>

                  <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visibilityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <option.icon className="w-4 h-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Lock content toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Lock Content
                    </Label>
                    <p className="text-xs text-muted-foreground">Require payment to unlock</p>
                  </div>

                  <Switch checked={isLocked} onCheckedChange={setIsLocked} />
                </div>

                {/* Unlock price input */}
                {isLocked && (
                  <div className="pl-6 space-y-2 animate-in slide-in-from-top-2 duration-200">
                    <Label htmlFor="unlock-price" className="text-sm">
                      Unlock Price (USD)
                    </Label>
                    <div className="relative w-[160px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="unlock-price"
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="0.00"
                        value={unlockPrice}
                        onChange={(e) => setUnlockPrice(e.target.value)}
                        className="pl-7"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Minimum $1.00</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview view */}
          {activeTab === "preview" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border overflow-hidden">
                <article className="p-4">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <UserAvatar
                      user={currentUser}
                      className="w-10 h-10 ring-2 ring-offset-2 ring-offset-background ring-primary/20"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm truncate">
                          {currentUser?.displayName || "Your Name"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>@{currentUser?.username || "username"}</span>
                        <span>·</span>
                        <span>Just now</span>
                        {visibility !== "public" && (
                          <>
                            <span>·</span>
                            <span className="capitalize">{visibility}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="mb-3">
                    {isLocked ? (
                      <div className="relative rounded-xl overflow-hidden">
                        <div className="blur-xl select-none pointer-events-none p-4 bg-muted/50">
                          <p className="text-sm line-clamp-3">
                            {content || "Your content preview will appear here..."}
                          </p>
                        </div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                            <Lock className="w-6 h-6 text-primary" />
                          </div>
                          <p className="text-sm font-medium mb-1">Locked Content</p>
                          <p className="text-xs text-muted-foreground">
                            {unlockPrice
                              ? `Unlock for $${parseFloat(unlockPrice).toFixed(2)}`
                              : "Set price to unlock"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {content || "Your content will appear here..."}
                      </p>
                    )}
                  </div>

                  {/* Media preview */}
                  {mediaFiles.length > 0 && !isLocked && (
                    <div
                      className={cn(
                        "grid gap-2 mb-3",
                        mediaFiles.length === 1 ? "grid-cols-1" : "grid-cols-2"
                      )}
                    >
                      {mediaFiles.map((media) => (
                        <div
                          key={media.id}
                          className="rounded-xl overflow-hidden aspect-square bg-muted"
                        >
                          {media.type === "image" ? (
                            <img
                              src={media.preview}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video src={media.preview} className="w-full h-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                This is a preview of how your post will appear
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div className="lg:hidden sticky bottom-0 glass border-t border-border p-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "compose" | "preview")}
          className="w-full"
        >
          <TabsList className="w-full h-10">
            <TabsTrigger value="compose" className="flex-1 h-8">
              Compose
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex-1 h-8">
              <Eye className="w-4 h-4 mr-1.5" />
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
