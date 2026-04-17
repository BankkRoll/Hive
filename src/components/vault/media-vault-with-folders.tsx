"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenuSeparator,
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
  Check,
  Play,
  HardDrive,
  Loader2,
  FileImage,
  FileVideo,
  FileAudio,
  Grid3X3,
  LayoutList,
  Star,
  StarOff,
  FolderInput,
  ChevronRight,
  Home,
  Folder,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VaultFolders, MoveMediaDialog } from "./vault-folders";

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
  url?: string | null;
  createdAt: number;
  processingStatus?: string;
  folderId?: Id<"mediaFolders">;
  isFavorite?: boolean;
  tags?: string[];
}

type MediaType = "image" | "video" | "audio" | "all";
type ViewMode = "all" | "folder" | "favorites";

export function MediaVaultWithFolders() {
  const [activeTab, setActiveTab] = useState<MediaType>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [deleteConfirm, setDeleteConfirm] = useState<Id<"media"> | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<Id<"mediaFolders"> | undefined>();
  const [showFavorites, setShowFavorites] = useState(false);
  const [moveDialogMedia, setMoveDialogMedia] = useState<Id<"media">[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);

  // Queries
  const storageStats = useQuery(api.media.getStorageStats);
  const currentFolder = useQuery(
    api.vaultFolders.getById,
    selectedFolderId ? { folderId: selectedFolderId } : "skip"
  );

  // Get media based on current view
  const mediaInFolder = useQuery(
    api.vaultFolders.getMediaInFolder,
    !showFavorites
      ? {
          folderId: selectedFolderId,
          type: activeTab === "all" ? undefined : activeTab,
          limit: 50,
        }
      : "skip"
  );

  const favorites = useQuery(
    api.vaultFolders.getFavorites,
    showFavorites
      ? {
          type: activeTab === "all" ? undefined : activeTab,
          limit: 50,
        }
      : "skip"
  );

  // Mutations
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const saveMedia = useMutation(api.media.saveMedia);
  const deleteMedia = useMutation(api.media.remove);
  const toggleFavorite = useMutation(api.vaultFolders.toggleFavorite);
  const moveMedia = useMutation(api.vaultFolders.moveMedia);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const fileId = `${file.name}-${Date.now()}`;
        setUploadingFiles((prev) => new Map(prev).set(fileId, 0));

        try {
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

          const { url, key } = await generateUploadUrl({});

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (e) => {
              if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                setUploadingFiles((prev) => new Map(prev).set(fileId, progress));
              }
            });
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`Upload failed: ${xhr.status}`));
            });
            xhr.addEventListener("error", () => reject(new Error("Upload failed")));
            xhr.open("PUT", url);
            xhr.setRequestHeader("Content-Type", file.type);
            xhr.send(file);
          });

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
        } catch {
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

  const handleToggleFavorite = async (mediaId: Id<"media">) => {
    try {
      const result = await toggleFavorite({ mediaId });
      toast.success(result.isFavorite ? "Added to favorites" : "Removed from favorites");
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  const handleMoveMedia = async (folderId?: Id<"mediaFolders">) => {
    try {
      await moveMedia({ mediaIds: moveDialogMedia, folderId });
      setMoveDialogMedia([]);
    } catch (error) {
      throw error;
    }
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

  // Get media based on current view
  const media = showFavorites ? favorites?.media : mediaInFolder?.media;
  const isLoading =
    storageStats === undefined ||
    (showFavorites ? favorites === undefined : mediaInFolder === undefined);

  if (isLoading) {
    return <MediaVaultSkeleton />;
  }

  // Build breadcrumb
  const breadcrumb = [
    {
      name: "All Files",
      onClick: () => {
        setSelectedFolderId(undefined);
        setShowFavorites(false);
      },
    },
  ];
  if (showFavorites) {
    breadcrumb.push({ name: "Favorites", onClick: () => {} });
  } else if (currentFolder) {
    currentFolder.path?.forEach((p) => {
      breadcrumb.push({ name: p.name, onClick: () => setSelectedFolderId(p._id) });
    });
    breadcrumb.push({ name: currentFolder.name, onClick: () => {} });
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-64 shrink-0 hidden lg:block">
          <Card className="sticky top-4">
            <CardContent className="p-4">
              <VaultFolders
                selectedFolderId={selectedFolderId}
                onSelectFolder={(id) => {
                  setSelectedFolderId(id);
                  setShowFavorites(false);
                }}
                showFavorites
                onShowFavorites={() => {
                  setShowFavorites(true);
                  setSelectedFolderId(undefined);
                }}
                isFavoritesActive={showFavorites}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
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

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm">
          {breadcrumb.map((item, index) => (
            <div key={index} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-4 text-muted-foreground" />}
              <button
                onClick={item.onClick}
                className={cn(
                  "hover:underline",
                  index === breadcrumb.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {index === 0 ? (
                  <span className="flex items-center gap-1">
                    <Home className="size-3" />
                    {item.name}
                  </span>
                ) : index === 1 && showFavorites ? (
                  <span className="flex items-center gap-1">
                    <Star className="size-3 text-warning" />
                    {item.name}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Folder className="size-3" />
                    {item.name}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Storage Stats - Mobile folder toggle */}
        <div className="flex items-center gap-3 lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setShowSidebar(!showSidebar)}>
            <Folder className="size-4 mr-2" />
            Folders
          </Button>
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

        {/* Type Filter Tabs */}
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
            {!media || media.length === 0 ? (
              <div className="text-center py-12">
                <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  {showFavorites ? (
                    <Star className="size-8 text-muted-foreground" />
                  ) : (
                    <FolderOpen className="size-8 text-muted-foreground" />
                  )}
                </div>
                <h3 className="font-semibold text-lg mb-1">
                  {showFavorites ? "No favorites yet" : "No media yet"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {showFavorites
                    ? "Star your favorite files to find them quickly"
                    : "Upload images, videos, or audio files to your vault"}
                </p>
                {!showFavorites && (
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
                )}
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {media.map((item) => (
                  <MediaGridItem
                    key={item._id}
                    media={item as MediaItem}
                    onPreview={() => setPreviewMedia(item as MediaItem)}
                    onDelete={() => setDeleteConfirm(item._id)}
                    onToggleFavorite={() => handleToggleFavorite(item._id)}
                    onMoveToFolder={() => setMoveDialogMedia([item._id])}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {media.map((item) => (
                  <MediaListItem
                    key={item._id}
                    media={item as MediaItem}
                    onPreview={() => setPreviewMedia(item as MediaItem)}
                    onDelete={() => setDeleteConfirm(item._id)}
                    onToggleFavorite={() => handleToggleFavorite(item._id)}
                    onMoveToFolder={() => setMoveDialogMedia([item._id])}
                    formatFileSize={formatFileSize}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Preview Dialog */}
        <MediaPreviewDialog
          media={previewMedia}
          onClose={() => setPreviewMedia(null)}
          onToggleFavorite={() => previewMedia && handleToggleFavorite(previewMedia._id)}
          onMoveToFolder={() => previewMedia && setMoveDialogMedia([previewMedia._id])}
        />

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

        {/* Move Media Dialog */}
        <MoveMediaDialog
          open={moveDialogMedia.length > 0}
          onOpenChange={(open) => !open && setMoveDialogMedia([])}
          mediaIds={moveDialogMedia}
          currentFolderId={selectedFolderId}
          onMove={handleMoveMedia}
        />
      </div>
    </div>
  );
}

interface MediaGridItemProps {
  media: MediaItem;
  onPreview: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onMoveToFolder: () => void;
  formatDuration: (seconds: number) => string;
}

function MediaGridItem({
  media,
  onPreview,
  onDelete,
  onToggleFavorite,
  onMoveToFolder,
  formatDuration,
}: MediaGridItemProps) {
  return (
    <div
      className="relative aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer group"
      onClick={onPreview}
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

      {/* Favorite indicator */}
      {media.isFavorite && (
        <div className="absolute top-1 left-1">
          <Star className="size-4 text-warning fill-warning" />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onPreview();
              }}
            >
              <ImageIcon className="size-4 mr-2" />
              Preview
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              {media.isFavorite ? (
                <>
                  <StarOff className="size-4 mr-2" />
                  Remove from favorites
                </>
              ) : (
                <>
                  <Star className="size-4 mr-2" />
                  Add to favorites
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onMoveToFolder();
              }}
            >
              <FolderInput className="size-4 mr-2" />
              Move to folder
            </DropdownMenuItem>
            {media.url && (
              <DropdownMenuItem asChild onClick={(e) => e.stopPropagation()}>
                <a href={media.url} download={media.filename}>
                  <Download className="size-4 mr-2" />
                  Download
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface MediaListItemProps {
  media: MediaItem;
  onPreview: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onMoveToFolder: () => void;
  formatFileSize: (bytes: number) => string;
  formatDuration: (seconds: number) => string;
}

function MediaListItem({
  media,
  onPreview,
  onDelete,
  onToggleFavorite,
  onMoveToFolder,
  formatFileSize,
  formatDuration,
}: MediaListItemProps) {
  const TypeIcon =
    media.type === "image" ? FileImage : media.type === "video" ? FileVideo : FileAudio;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
      onClick={onPreview}
    >
      <div className="size-12 rounded-lg overflow-hidden bg-muted shrink-0 relative">
        {media.type === "image" && media.url ? (
          <img src={media.url} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full flex items-center justify-center">
            <TypeIcon className="size-6 text-muted-foreground" />
          </div>
        )}
        {media.isFavorite && (
          <div className="absolute top-0.5 left-0.5">
            <Star className="size-3 text-warning fill-warning" />
          </div>
        )}
      </div>

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon">
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
          >
            <ImageIcon className="size-4 mr-2" />
            Preview
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            {media.isFavorite ? (
              <>
                <StarOff className="size-4 mr-2" />
                Remove from favorites
              </>
            ) : (
              <>
                <Star className="size-4 mr-2" />
                Add to favorites
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onMoveToFolder();
            }}
          >
            <FolderInput className="size-4 mr-2" />
            Move to folder
          </DropdownMenuItem>
          {media.url && (
            <DropdownMenuItem asChild onClick={(e) => e.stopPropagation()}>
              <a href={media.url} download={media.filename}>
                <Download className="size-4 mr-2" />
                Download
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface MediaPreviewDialogProps {
  media: MediaItem | null;
  onClose: () => void;
  onToggleFavorite: () => void;
  onMoveToFolder: () => void;
}

function MediaPreviewDialog({
  media,
  onClose,
  onToggleFavorite,
  onMoveToFolder,
}: MediaPreviewDialogProps) {
  if (!media) return null;

  return (
    <Dialog open={media !== null} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate flex-1">{media.filename || "Preview"}</DialogTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={onToggleFavorite}>
                {media.isFavorite ? (
                  <Star className="size-4 text-warning fill-warning" />
                ) : (
                  <Star className="size-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={onMoveToFolder}>
                <FolderInput className="size-4" />
              </Button>
              {media.url && (
                <a
                  href={media.url}
                  download={media.filename}
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                >
                  <Download className="size-4" />
                </a>
              )}
            </div>
          </div>
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
    <div className="flex gap-6">
      <div className="w-64 shrink-0 hidden lg:block">
        <Card>
          <CardContent className="p-4">
            <Skeleton className="h-5 w-16 mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>

        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
