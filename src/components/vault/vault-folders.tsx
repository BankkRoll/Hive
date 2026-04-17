"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id, Doc } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Pencil,
  Trash2,
  MoveRight,
  Star,
  Home,
  Image as ImageIcon,
  Video,
  Music,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Folder colors for visual organization
const FOLDER_COLORS = [
  { name: "Default", value: undefined },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

// Folder icons
const FOLDER_ICONS = [
  { name: "Default", value: undefined, icon: Folder },
  { name: "Images", value: "image", icon: ImageIcon },
  { name: "Videos", value: "video", icon: Video },
  { name: "Audio", value: "audio", icon: Music },
  { name: "Favorites", value: "star", icon: Star },
];

type FolderWithChildren = Doc<"mediaFolders"> & {
  children: FolderWithChildren[];
};

interface VaultFoldersProps {
  selectedFolderId?: Id<"mediaFolders">;
  onSelectFolder: (folderId?: Id<"mediaFolders">) => void;
  showFavorites?: boolean;
  onShowFavorites?: () => void;
  isFavoritesActive?: boolean;
}

export function VaultFolders({
  selectedFolderId,
  onSelectFolder,
  showFavorites = true,
  onShowFavorites,
  isFavoritesActive = false,
}: VaultFoldersProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Doc<"mediaFolders"> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Id<"mediaFolders"> | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const folderTree = useQuery(api.vaultFolders.getFolderTree);
  const createFolder = useMutation(api.vaultFolders.create);
  const updateFolder = useMutation(api.vaultFolders.update);
  const removeFolder = useMutation(api.vaultFolders.remove);

  const toggleExpanded = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await removeFolder({ folderId: deleteConfirm });
      toast.success("Folder deleted");
      setDeleteConfirm(null);
      if (selectedFolderId === deleteConfirm) {
        onSelectFolder(undefined);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete folder");
    }
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Folders</h3>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <FolderPlus className="size-4" />
            </Button>
          </DialogTrigger>
          <FolderDialog
            onClose={() => setIsCreating(false)}
            onSubmit={async (data) => {
              await createFolder(data);
              setIsCreating(false);
            }}
          />
        </Dialog>
      </div>

      <ScrollArea className="h-[300px]">
        <div className="space-y-1">
          {/* All Files */}
          <FolderButton
            icon={<Home className="size-4" />}
            name="All Files"
            isActive={selectedFolderId === undefined && !isFavoritesActive}
            onClick={() => onSelectFolder(undefined)}
          />

          {/* Favorites */}
          {showFavorites && onShowFavorites && (
            <FolderButton
              icon={<Star className="size-4 text-warning" />}
              name="Favorites"
              isActive={isFavoritesActive}
              onClick={onShowFavorites}
            />
          )}

          {/* Folder Tree */}
          {folderTree?.map((folder) => (
            <FolderTreeItem
              key={folder._id}
              folder={folder}
              level={0}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              onSelect={onSelectFolder}
              onToggleExpand={toggleExpanded}
              onEdit={setEditingFolder}
              onDelete={setDeleteConfirm}
            />
          ))}

          {folderTree?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No folders yet</p>
          )}
        </div>
      </ScrollArea>

      {/* Edit Dialog */}
      <Dialog open={editingFolder !== null} onOpenChange={() => setEditingFolder(null)}>
        {editingFolder && (
          <FolderDialog
            folder={editingFolder}
            onClose={() => setEditingFolder(null)}
            onSubmit={async (data) => {
              await updateFolder({
                folderId: editingFolder._id,
                ...data,
              });
              setEditingFolder(null);
            }}
          />
        )}
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Media files in this folder will be moved to &quot;All Files&quot;. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FolderButtonProps {
  icon: React.ReactNode;
  name: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
  color?: string;
}

function FolderButton({ icon, name, count, isActive, onClick, color }: FolderButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors",
        isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
      )}
    >
      <span style={{ color }}>{icon}</span>
      <span className="truncate flex-1 text-left">{name}</span>
      {count !== undefined && (
        <Badge variant="secondary" className="text-xs h-5">
          {count}
        </Badge>
      )}
    </button>
  );
}

interface FolderTreeItemProps {
  folder: FolderWithChildren;
  level: number;
  selectedFolderId?: Id<"mediaFolders">;
  expandedFolders: Set<string>;
  onSelect: (folderId: Id<"mediaFolders">) => void;
  onToggleExpand: (folderId: string) => void;
  onEdit: (folder: Doc<"mediaFolders">) => void;
  onDelete: (folderId: Id<"mediaFolders">) => void;
}

function FolderTreeItem({
  folder,
  level,
  selectedFolderId,
  expandedFolders,
  onSelect,
  onToggleExpand,
  onEdit,
  onDelete,
}: FolderTreeItemProps) {
  const isExpanded = expandedFolders.has(folder._id);
  const hasChildren = folder.children.length > 0;
  const isActive = selectedFolderId === folder._id;

  const IconComponent =
    FOLDER_ICONS.find((i) => i.value === folder.icon)?.icon ?? (isExpanded ? FolderOpen : Folder);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 py-1 rounded-lg transition-colors",
          isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => hasChildren && onToggleExpand(folder._id)}
          className={cn(
            "size-5 flex items-center justify-center rounded",
            hasChildren ? "hover:bg-muted-foreground/20" : "invisible"
          )}
        >
          {hasChildren &&
            (isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)}
        </button>

        {/* Folder button */}
        <button
          onClick={() => onSelect(folder._id)}
          className="flex-1 flex items-center gap-2 py-0.5 text-sm min-w-0"
        >
          <IconComponent className="size-4 shrink-0" style={{ color: folder.color }} />
          <span className="truncate">{folder.name}</span>
          {folder.mediaCount !== undefined && folder.mediaCount > 0 && (
            <Badge variant="secondary" className="text-xs h-5 shrink-0">
              {folder.mediaCount}
            </Badge>
          )}
        </button>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="size-6 flex items-center justify-center rounded hover:bg-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(folder)}>
              <Pencil className="size-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(folder._id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child._id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FolderDialogProps {
  folder?: Doc<"mediaFolders">;
  parentId?: Id<"mediaFolders">;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    color?: string;
    icon?: string;
    parentId?: Id<"mediaFolders">;
  }) => Promise<void>;
}

function FolderDialog({ folder, parentId, onClose, onSubmit }: FolderDialogProps) {
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState<string | undefined>(folder?.color);
  const [icon, setIcon] = useState<string | undefined>(folder?.icon);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Folder name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        color,
        icon,
        parentId,
      });
      toast.success(folder ? "Folder updated" : "Folder created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save folder");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>{folder ? "Edit Folder" : "Create Folder"}</DialogTitle>
          <DialogDescription>Organize your media with folders</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Folder Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              maxLength={50}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "size-8 rounded-lg border-2 transition-all",
                    color === c.value
                      ? "border-primary scale-110"
                      : "border-transparent hover:border-muted-foreground/50"
                  )}
                  style={{ backgroundColor: c.value ?? "var(--muted)" }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex gap-2">
              {FOLDER_ICONS.map((i) => (
                <button
                  key={i.name}
                  type="button"
                  onClick={() => setIcon(i.value)}
                  className={cn(
                    "size-10 rounded-lg border-2 flex items-center justify-center transition-all",
                    icon === i.value
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-muted-foreground/50"
                  )}
                  title={i.name}
                >
                  <i.icon className="size-5" style={{ color }} />
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50">
              {(() => {
                const IconComp = FOLDER_ICONS.find((i) => i.value === icon)?.icon ?? Folder;
                return <IconComp className="size-5" style={{ color }} />;
              })()}
              <span className="font-medium">{name || "Folder Name"}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? "Saving..." : folder ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ============================================
// Move Media Dialog Component
// ============================================

interface MoveMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaIds: Id<"media">[];
  currentFolderId?: Id<"mediaFolders">;
  onMove: (folderId?: Id<"mediaFolders">) => Promise<void>;
}

export function MoveMediaDialog({
  open,
  onOpenChange,
  mediaIds,
  currentFolderId,
  onMove,
}: MoveMediaDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<Id<"mediaFolders"> | undefined>(
    currentFolderId
  );
  const [isMoving, setIsMoving] = useState(false);

  const folderTree = useQuery(api.vaultFolders.getFolderTree);

  const handleMove = async () => {
    setIsMoving(true);
    try {
      await onMove(selectedFolderId);
      onOpenChange(false);
      toast.success(`Moved ${mediaIds.length} file${mediaIds.length > 1 ? "s" : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move files");
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to Folder</DialogTitle>
          <DialogDescription>
            Select a destination folder for {mediaIds.length} file{mediaIds.length > 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[300px] border rounded-lg p-2">
          <div className="space-y-1">
            {/* Root / All Files */}
            <button
              onClick={() => setSelectedFolderId(undefined)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                selectedFolderId === undefined
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted"
              )}
            >
              <Home className="size-4" />
              <span>All Files (No Folder)</span>
            </button>

            {/* Folder list */}
            {folderTree?.map((folder) => (
              <MoveDialogFolderItem
                key={folder._id}
                folder={folder}
                level={0}
                selectedFolderId={selectedFolderId}
                currentFolderId={currentFolderId}
                onSelect={setSelectedFolderId}
              />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={isMoving}>
            {isMoving ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MoveDialogFolderItemProps {
  folder: FolderWithChildren;
  level: number;
  selectedFolderId?: Id<"mediaFolders">;
  currentFolderId?: Id<"mediaFolders">;
  onSelect: (folderId: Id<"mediaFolders">) => void;
}

function MoveDialogFolderItem({
  folder,
  level,
  selectedFolderId,
  currentFolderId,
  onSelect,
}: MoveDialogFolderItemProps) {
  const isActive = selectedFolderId === folder._id;
  const isCurrent = currentFolderId === folder._id;

  return (
    <div>
      <button
        onClick={() => onSelect(folder._id)}
        disabled={isCurrent}
        className={cn(
          "w-full flex items-center gap-2 py-2 rounded-lg text-sm transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : isCurrent
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        <Folder className="size-4" style={{ color: folder.color }} />
        <span className="truncate">{folder.name}</span>
        {isCurrent && (
          <Badge variant="secondary" className="text-xs">
            Current
          </Badge>
        )}
      </button>

      {folder.children.map((child) => (
        <MoveDialogFolderItem
          key={child._id}
          folder={child}
          level={level + 1}
          selectedFolderId={selectedFolderId}
          currentFolderId={currentFolderId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
