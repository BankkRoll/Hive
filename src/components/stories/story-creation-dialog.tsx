"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Image as ImageIcon,
  Video,
  Upload,
  X,
  Loader2,
  Globe,
  Users,
  Star,
  Crown,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";

type Visibility = "public" | "followers" | "subscribers" | "vip";

interface MediaPreview {
  file: File;
  preview: string;
  type: "image" | "video";
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

interface StoryCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoryCreationDialog({ open, onOpenChange }: StoryCreationDialogProps) {
  const [media, setMedia] = useState<MediaPreview | null>(null);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("followers");
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const saveMedia = useMutation(api.media.saveMedia);
  const createStory = useMutation(api.stories.create);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const file = files[0];
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");

      if (!isImage && !isVideo) {
        toast.error("Please select an image or video file");
        return;
      }

      // Revoke old preview URL if exists
      if (media) {
        URL.revokeObjectURL(media.preview);
      }

      const preview = URL.createObjectURL(file);
      setMedia({
        file,
        preview,
        type: isImage ? "image" : "video",
      });
    },
    [media]
  );

  const removeMedia = useCallback(() => {
    if (media) {
      URL.revokeObjectURL(media.preview);
      setMedia(null);
    }
  }, [media]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const uploadMedia = async (): Promise<Id<"media"> | null> => {
    if (!media) return null;

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
      let duration: number | undefined;

      if (media.type === "image") {
        const img = new Image();
        img.src = media.preview;
        await new Promise((resolve) => {
          img.onload = resolve;
        });
        width = img.naturalWidth;
        height = img.naturalHeight;
      } else if (media.type === "video") {
        // Get video dimensions and duration
        const video = document.createElement("video");
        video.src = media.preview;
        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });
        width = video.videoWidth;
        height = video.videoHeight;
        duration = video.duration;
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
        duration,
      });

      return mediaId;
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload media");
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!media) {
      toast.error("Please add an image or video");
      return;
    }

    setIsUploading(true);

    try {
      // Upload media first
      const mediaId = await uploadMedia();
      if (!mediaId) {
        throw new Error("Failed to upload media");
      }

      // Create story
      await createStory({
        mediaId,
        caption: caption.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        visibility,
      });

      toast.success("Story created!");

      // Reset form
      removeMedia();
      setCaption("");
      setLinkUrl("");
      setVisibility("followers");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create story:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create story");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      removeMedia();
      setCaption("");
      setLinkUrl("");
      setVisibility("followers");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Story</DialogTitle>
          <DialogDescription>
            Share a moment with your audience. Stories disappear after 24 hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Media upload area */}
          {!media ? (
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 rounded-full bg-muted">
                  <Upload className="size-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Drop your media here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ImageIcon className="size-4" />
                  <span>Images</span>
                  <span className="mx-1">·</span>
                  <Video className="size-4" />
                  <span>Videos</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden aspect-[9/16] max-h-[400px] bg-muted">
              {media.type === "image" ? (
                <img src={media.preview} alt="Preview" className="w-full h-full object-contain" />
              ) : (
                <video
                  src={media.preview}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  muted
                  loop
                />
              )}

              {/* Remove button */}
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 size-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
                onClick={removeMedia}
                disabled={isUploading}
              >
                <X className="size-4" />
              </Button>

              {/* Loading overlay */}
              {isUploading && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Uploading...</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {/* Caption */}
          <div className="space-y-2">
            <Label htmlFor="caption">Caption (optional)</Label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption..."
              className="resize-none"
              rows={2}
              maxLength={500}
              disabled={isUploading}
            />
            <p className="text-xs text-muted-foreground text-right">{caption.length}/500</p>
          </div>

          {/* Link URL */}
          <div className="space-y-2">
            <Label htmlFor="link" className="flex items-center gap-2">
              <LinkIcon className="size-4" />
              Link (optional)
            </Label>
            <Input
              id="link"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              disabled={isUploading}
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label>Who can see this?</Label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as Visibility)}
              disabled={isUploading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibilityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <option.icon className="size-4" />
                      <span>{option.label}</span>
                      <span className="text-muted-foreground">- {option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit button */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!media || isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Story"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
