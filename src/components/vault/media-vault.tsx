"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Image as ImageIcon,
  Video,
  Music,
  FolderOpen,
  Upload,
  MoreVertical,
  Trash2,
  Download,
  Copy,
  Check,
  Play,
  Pause,
  X,
  HardDrive,
  Loader2,
  FileImage,
  FileVideo,
  FileAudio,
  Grid3X3,
  LayoutList,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MediaItem {
  _id: Id<"media">;
  userId: Id<"users">;
  type: "image" | "video" | "audio";
  mimeType: string;
  filename?: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  url: string | null;
  createdAt: number;
  processingStatus?: string;
}

type MediaType = "image" | "video" | "audio" | "all";

interface MediaVaultProps {
  onSelect?: (media: MediaItem) => void;
  selectable?: boolean;
  selectedIds?: Id<"media">[];
  maxSelections?: number;
}

export function MediaVault({
  onSelect,
  selectable = false,
  selectedIds = [],
  maxSelections,
}: MediaVaultProps) {
  const [activeTab, setActiveTab] = useState<MediaType>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [deleteConfirm, setDeleteConfirm] = useState<Id<"media"> | null>(null);

  const mediaQuery = useQuery(
    api.media.getMyMedia,
    activeTab === "all" ? { limit: 50 } : { type: activeTab, limit: 50 }
  );
  const storageStats = useQuery(api.media.getStorageStats);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const saveMedia = useMutation(api.media.saveMedia);
  const deleteMedia = useMutation(api.media.remove);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const fileId = `${file.name}-${Date.now()}`;
        setUploadingFiles((prev) => new Map(prev).set(fileId, 0));

        try {
          // Determine type
          let type: "image" | "video" | "audio";
          if (file.type.startsWith("image/")) type = "image";
          else if (file.type.startsWith("video/")) type = "video";
          else if (file.type.startsWith("audio/")) type = "audio";
          else {
            toast.error(`Unsupported file type: ${file.type}`);
            setUploadingFiles((prev) => {
              const next = new Map(prev);
              next.delete(fileId);
              return next;
            });
            continue;
          }

          // Get upload URL
          const { url, key } = await generateUploadUrl({});

          // Upload to R2 with progress
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                setUploadingFiles((prev) => new Map(prev).set(fileId, progress));
              }
            });
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
              }
            });
            xhr.addEventListener("error", () => reject(new Error("Upload failed")));
            xhr.open("PUT", url);
            xhr.setRequestHeader("Content-Type", file.type);
            xhr.send(file);
          });

          // Get dimensions for images/videos
          let width: number | undefined;
          let height: number | undefined;
          let duration: number | undefined;

          if (type === "image") {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            await new Promise<void>((resolve) => {
              img.onload = () => {
                width = img.naturalWidth;
                height = img.naturalHeight;
                URL.revokeObjectURL(img.src);
                resolve();
              };
            });
          } else if (type === "video") {
            const video = document.createElement("video");
            video.src = URL.createObjectURL(file);
            await new Promise<void>((resolve) => {
              video.onloadedmetadata = () => {
                width = video.videoWidth;
                height = video.videoHeight;
                duration = video.duration;
                URL.revokeObjectURL(video.src);
                resolve();
              };
            });
          } else if (type === "audio") {
            const audio = document.createElement("audio");
            audio.src = URL.createObjectURL(file);
            await new Promise<void>((resolve) => {
              audio.onloadedmetadata = () => {
                duration = audio.duration;
                URL.revokeObjectURL(audio.src);
                resolve();
              };
            });
          }

          // Save media record
          await saveMedia({
            r2Key: key,
            type,
            mimeType: file.type,
            filename: file.name,
            size: file.size,
            width,
            height,
            duration,
          });

          toast.success(`Uploaded ${file.name}`);
        } catch (error) {
          toast.error(`Failed to upload ${file.name}`);
        } finally {
          setUploadingFiles((prev) => {
            const next = new Map(prev);
            next.delete(fileId);
            return next;
          });
        }
      }
    },
    [generateUploadUrl, saveMedia]
  );

  const handleDelete = async (mediaId: Id<"media">) => {
    try {
      await deleteMedia({ mediaId });
      toast.success("Media deleted");
      setDeleteConfirm(null);
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleSelect = (media: MediaItem) => {
    if (!selectable || !onSelect) return;
    if (maxSelections && selectedIds.length >= maxSelections && !selectedIds.includes(media._id)) {
      toast.error(`Maximum ${maxSelections} files allowed`);
      return;
    }
    onSelect(media);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (mediaQuery === undefined || storageStats === undefined) {
    return <MediaVaultSkeleton />;
  }

  const { media } = mediaQuery;

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FolderOpen className="size-5 text-primary" />
            Media Vault
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {storageStats.count} files · {formatFileSize(storageStats.totalSize)} used
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "grid" ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <Grid3X3 className="size-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "list" ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <LayoutList className="size-4" />
            </button>
          </div>

          <label>
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
            />
            <Button className="gap-2 cursor-pointer">
              <Upload className="size-4" />
              Upload
            </Button>
          </label>
        </div>
      </div>

      {/* Storage Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StorageStatCard
          icon={FileImage}
          label="Images"
          count={storageStats.byType?.image?.count ?? 0}
          size={storageStats.byType?.image?.size ?? 0}
          color="text-info"
        />
        <StorageStatCard
          icon={FileVideo}
          label="Videos"
          count={storageStats.byType?.video?.count ?? 0}
          size={storageStats.byType?.video?.size ?? 0}
          color="text-primary"
        />
        <StorageStatCard
          icon={FileAudio}
          label="Audio"
          count={storageStats.byType?.audio?.count ?? 0}
          size={storageStats.byType?.audio?.size ?? 0}
          color="text-success"
        />
      </div>

      {/* Upload Progress */}
      {uploadingFiles.size > 0 && (
        <div className="space-y-2">
          {Array.from(uploadingFiles.entries()).map(([fileId, progress]) => (
            <div key={fileId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Loader2 className="size-4 animate-spin text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileId.split("-")[0]}</p>
                <Progress value={progress} className="h-1 mt-1" />
              </div>
              <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MediaType)}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="all" className="gap-2">
            <HardDrive className="size-4" />
            All
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-2">
            <ImageIcon className="size-4" />
            Images
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-2">
            <Video className="size-4" />
            Videos
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-2">
            <Music className="size-4" />
            Audio
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {media.length === 0 ? (
            <div className="text-center py-12">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="size-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">No media yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload images, videos, or audio files to your vault
              </p>
              <label>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                />
                <Button className="gap-2 cursor-pointer">
                  <Upload className="size-4" />
                  Upload Files
                </Button>
              </label>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {media.map((item) => (
                <MediaGridItem
                  key={item._id}
                  media={item}
                  selectable={selectable}
                  selected={selectedIds.includes(item._id)}
                  onSelect={() => handleSelect(item)}
                  onPreview={() => setPreviewMedia(item)}
                  onDelete={() => setDeleteConfirm(item._id)}
                  formatDuration={formatDuration}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {media.map((item) => (
                <MediaListItem
                  key={item._id}
                  media={item}
                  selectable={selectable}
                  selected={selectedIds.includes(item._id)}
                  onSelect={() => handleSelect(item)}
                  onPreview={() => setPreviewMedia(item)}
                  onDelete={() => setDeleteConfirm(item._id)}
                  formatFileSize={formatFileSize}
                  formatDuration={formatDuration}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <MediaPreviewDialog media={previewMedia} onClose={() => setPreviewMedia(null)} />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Media?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface StorageStatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  size: number;
  color: string;
}

function StorageStatCard({ icon: Icon, label, count, size, color }: StorageStatCardProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("size-4", color)} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <p className="text-lg font-bold">{count}</p>
        <p className="text-xs text-muted-foreground">{formatSize(size)}</p>
      </CardContent>
    </Card>
  );
}

interface MediaGridItemProps {
  media: MediaItem;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onDelete: () => void;
  formatDuration: (seconds: number) => string;
}

function MediaGridItem({
  media,
  selectable,
  selected,
  onSelect,
  onPreview,
  onDelete,
  formatDuration,
}: MediaGridItemProps) {
  return (
    <div
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer group",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      onClick={selectable ? onSelect : onPreview}
    >
      {media.type === "image" && media.url && (
        <img src={media.url} alt="" className="size-full object-cover" />
      )}
      {media.type === "video" && (
        <div className="size-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20">
          {media.url ? (
            <video src={media.url} className="size-full object-cover" muted />
          ) : (
            <Video className="size-8 text-muted-foreground" />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-10 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="size-5 text-white ml-0.5" />
            </div>
          </div>
          {media.duration && (
            <Badge className="absolute bottom-1 right-1 text-xs" variant="secondary">
              {formatDuration(media.duration)}
            </Badge>
          )}
        </div>
      )}
      {media.type === "audio" && (
        <div className="size-full flex flex-col items-center justify-center bg-gradient-to-br from-green-500/20 to-emerald-500/20 p-2">
          <Music className="size-8 text-muted-foreground mb-2" />
          {media.duration && (
            <span className="text-xs text-muted-foreground">{formatDuration(media.duration)}</span>
          )}
        </div>
      )}

      {/* Selection indicator */}
      {selectable && selected && (
        <div className="absolute top-1 left-1 size-6 rounded-full bg-primary flex items-center justify-center">
          <Check className="size-4 text-primary-foreground" />
        </div>
      )}

      {/* Hover overlay with actions */}
      {!selectable && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={onPreview}>
                <ImageIcon className="size-4 mr-2" />
                Preview
              </DropdownMenuItem>
              {media.url && (
                <DropdownMenuItem asChild>
                  <a href={media.url} download={media.filename}>
                    <Download className="size-4 mr-2" />
                    Download
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

interface MediaListItemProps {
  media: MediaItem;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onDelete: () => void;
  formatFileSize: (bytes: number) => string;
  formatDuration: (seconds: number) => string;
}

function MediaListItem({
  media,
  selectable,
  selected,
  onSelect,
  onPreview,
  onDelete,
  formatFileSize,
  formatDuration,
}: MediaListItemProps) {
  const TypeIcon =
    media.type === "image" ? FileImage : media.type === "video" ? FileVideo : FileAudio;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer",
        selected && "ring-2 ring-primary"
      )}
      onClick={selectable ? onSelect : onPreview}
    >
      {/* Thumbnail */}
      <div className="size-12 rounded-lg overflow-hidden bg-muted shrink-0">
        {media.type === "image" && media.url ? (
          <img src={media.url} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full flex items-center justify-center">
            <TypeIcon className="size-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{media.filename || "Untitled"}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(media.size)}</span>
          {media.width && media.height && (
            <span>
              · {media.width}×{media.height}
            </span>
          )}
          {media.duration && <span>· {formatDuration(media.duration)}</span>}
          <span>· {format(media.createdAt, "MMM d, yyyy")}</span>
        </div>
      </div>

      {/* Selection indicator */}
      {selectable && (
        <div
          className={cn(
            "size-5 rounded-full border-2 shrink-0 flex items-center justify-center",
            selected ? "border-primary bg-primary" : "border-muted-foreground"
          )}
        >
          {selected && <Check className="size-3 text-primary-foreground" />}
        </div>
      )}

      {/* Actions */}
      {!selectable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPreview}>
              <ImageIcon className="size-4 mr-2" />
              Preview
            </DropdownMenuItem>
            {media.url && (
              <DropdownMenuItem asChild>
                <a href={media.url} download={media.filename}>
                  <Download className="size-4 mr-2" />
                  Download
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

interface MediaPreviewDialogProps {
  media: MediaItem | null;
  onClose: () => void;
}

function MediaPreviewDialog({ media, onClose }: MediaPreviewDialogProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!media) return null;

  return (
    <Dialog open={media !== null} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="truncate">{media.filename || "Preview"}</DialogTitle>
        </DialogHeader>

        <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[70vh]">
          {media.type === "image" && media.url && (
            <img src={media.url} alt="" className="max-w-full max-h-[70vh] object-contain" />
          )}
          {media.type === "video" && media.url && (
            <video src={media.url} className="max-w-full max-h-[70vh]" controls autoPlay />
          )}
          {media.type === "audio" && media.url && (
            <div className="p-8 text-center">
              <div className="size-24 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4">
                <Music className="size-12 text-white" />
              </div>
              <audio src={media.url} controls autoPlay className="w-full max-w-md" />
            </div>
          )}
        </div>

        <div className="p-4 border-t text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>
              {media.width && media.height && `${media.width}×${media.height} · `}
              {(media.size / 1024 / 1024).toFixed(2)} MB
            </span>
            <span>{format(media.createdAt, "MMM d, yyyy 'at' h:mm a")}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MediaVaultSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-6 w-8" />
              <Skeleton className="h-3 w-12 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Skeleton className="h-10 w-full" />

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {Array.from({ length: 15 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}
