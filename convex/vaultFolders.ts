/**
 * @fileoverview Vault Folders Management
 *
 * Manages hierarchical media folders (vault) for organizing user content.
 * Provides folder CRUD operations, media organization, favorites, and tagging.
 *
 * Features:
 *   - Hierarchical folder structure with configurable depth limit
 *   - Folder customization (name, color, icon)
 *   - Media organization with move and batch operations
 *   - Favorites system for quick access
 *   - Tag-based media search and organization
 *
 * Security:
 *   - All operations require authentication
 *   - Users can only access their own folders and media
 *   - Default folders are protected from modification/deletion
 *
 * Limits:
 *   - MAX_FOLDER_NAME_LENGTH: 50 characters
 *   - MAX_FOLDERS_PER_USER: 50 folders
 *   - MAX_FOLDER_DEPTH: 3 levels of nesting
 *   - MAX_TAGS_PER_MEDIA: 10 tags (30 chars each)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_FOLDER_NAME_LENGTH = 50;
const MAX_FOLDERS_PER_USER = 50;
const MAX_FOLDER_DEPTH = 3;

// ===== QUERIES =====

/** Retrieves all folders for the current user, optionally filtered by parent */
export const getMyFolders = query({
  args: {
    parentId: v.optional(v.id("mediaFolders")), // null for root folders
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const folders = await ctx.db
      .query("mediaFolders")
      .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", args.parentId))
      .take(100);

    // Sort by order, then by name
    return folders.sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order ?? 0) - (b.order ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  },
});

/** Retrieves all folders as a tree structure with hierarchy */
export const getFolderTree = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const allFolders = await ctx.db
      .query("mediaFolders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_FOLDERS_PER_USER);

    // Build tree structure
    type FolderWithChildren = Doc<"mediaFolders"> & {
      children: FolderWithChildren[];
    };

    const folderMap = new Map<Id<"mediaFolders">, FolderWithChildren>();

    // Initialize all folders with empty children arrays
    for (const folder of allFolders) {
      folderMap.set(folder._id, { ...folder, children: [] });
    }

    // Build the tree
    const rootFolders: FolderWithChildren[] = [];

    for (const folder of allFolders) {
      const folderWithChildren = folderMap.get(folder._id)!;

      if (folder.parentId) {
        const parent = folderMap.get(folder.parentId);
        if (parent) {
          parent.children.push(folderWithChildren);
        } else {
          // Orphaned folder, add to root
          rootFolders.push(folderWithChildren);
        }
      } else {
        rootFolders.push(folderWithChildren);
      }
    }

    // Sort at each level
    const sortFolders = (folders: FolderWithChildren[]): FolderWithChildren[] => {
      return folders
        .sort((a, b) => {
          if (a.order !== b.order) {
            return (a.order ?? 0) - (b.order ?? 0);
          }
          return a.name.localeCompare(b.name);
        })
        .map((f) => ({
          ...f,
          children: sortFolders(f.children),
        }));
    };

    return sortFolders(rootFolders);
  },
});

/** Retrieves a single folder with media count, subfolder count, and breadcrumb path */
export const getById = query({
  args: { folderId: v.id("mediaFolders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== userId) {
      return null;
    }

    // Get media count
    const media = await ctx.db
      .query("media")
      .withIndex("by_folder", (q) => q.eq("userId", userId).eq("folderId", args.folderId))
      .take(1000);

    // Get subfolder count
    const subfolders = await ctx.db
      .query("mediaFolders")
      .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", args.folderId))
      .take(100);

    // Get parent folder path (breadcrumb)
    const path: Array<{ _id: Id<"mediaFolders">; name: string }> = [];
    let currentFolder: Doc<"mediaFolders"> | null = folder;

    while (currentFolder?.parentId) {
      const parent: Doc<"mediaFolders"> | null = await ctx.db.get(currentFolder.parentId);
      if (parent && parent.userId === userId) {
        path.unshift({ _id: parent._id, name: parent.name });
        currentFolder = parent;
      } else {
        break;
      }
    }

    return {
      ...folder,
      mediaCount: media.length,
      subfolderCount: subfolders.length,
      path,
    };
  },
});

/** Retrieves paginated media within a folder, with optional type filtering */
export const getMediaInFolder = query({
  args: {
    folderId: v.optional(v.id("mediaFolders")), // null for unfiled media
    type: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("audio"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { media: [], hasMore: false };
    }

    const limit = args.limit ?? 50;

    // Verify folder ownership if specified
    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder || folder.userId !== userId) {
        return { media: [], hasMore: false };
      }
    }

    const media = await ctx.db
      .query("media")
      .withIndex("by_folder", (q) => q.eq("userId", userId).eq("folderId", args.folderId))
      .order("desc")
      .take(limit + 1);

    // Filter by type if specified
    const filtered = args.type ? media.filter((m) => m.type === args.type) : media;

    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    return {
      media: items,
      hasMore,
      cursor: hasMore ? items[items.length - 1]._id : undefined,
    };
  },
});

// ===== MUTATIONS =====

/** Creates a new folder with optional parent, color, and icon */
export const create = mutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("mediaFolders")),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Validate name
    const name = args.name.trim();
    if (!name) {
      throw new Error("Folder name cannot be empty");
    }
    if (name.length > MAX_FOLDER_NAME_LENGTH) {
      throw new Error(`Folder name must be at most ${MAX_FOLDER_NAME_LENGTH} characters`);
    }

    // Check folder limit
    const existingFolders = await ctx.db
      .query("mediaFolders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_FOLDERS_PER_USER + 1);

    if (existingFolders.length >= MAX_FOLDERS_PER_USER) {
      throw new Error(`Maximum of ${MAX_FOLDERS_PER_USER} folders allowed`);
    }

    // Check for duplicate name in same parent
    const existingWithName = await ctx.db
      .query("mediaFolders")
      .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", args.parentId))
      .filter((q) => q.eq(q.field("name"), name))
      .first();

    if (existingWithName) {
      throw new Error("A folder with this name already exists in this location");
    }

    // Validate parent and check depth
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.userId !== userId) {
        throw new Error("Parent folder not found");
      }

      // Check depth limit
      let depth = 1;
      let currentFolder: Doc<"mediaFolders"> | null = parent;
      while (currentFolder?.parentId && depth < MAX_FOLDER_DEPTH) {
        currentFolder = await ctx.db.get(currentFolder.parentId);
        depth++;
      }
      if (depth >= MAX_FOLDER_DEPTH) {
        throw new Error(`Maximum folder depth of ${MAX_FOLDER_DEPTH} levels reached`);
      }
    }

    // Get max order in parent
    const siblings = await ctx.db
      .query("mediaFolders")
      .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", args.parentId))
      .take(100);

    const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order ?? 0), 0);

    const folderId = await ctx.db.insert("mediaFolders", {
      userId,
      name,
      parentId: args.parentId,
      color: args.color,
      icon: args.icon,
      mediaCount: 0,
      order: maxOrder + 1,
      isDefault: false,
      createdAt: Date.now(),
    });

    return folderId;
  },
});

/** Updates folder properties (name, color, icon) */
export const update = mutation({
  args: {
    folderId: v.id("mediaFolders"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== userId) {
      throw new Error("Folder not found");
    }

    if (folder.isDefault) {
      throw new Error("Cannot modify default folders");
    }

    const updates: Partial<Doc<"mediaFolders">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new Error("Folder name cannot be empty");
      }
      if (name.length > MAX_FOLDER_NAME_LENGTH) {
        throw new Error(`Folder name must be at most ${MAX_FOLDER_NAME_LENGTH} characters`);
      }

      // Check for duplicate name in same parent
      const existingWithName = await ctx.db
        .query("mediaFolders")
        .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", folder.parentId))
        .filter((q) => q.and(q.eq(q.field("name"), name), q.neq(q.field("_id"), args.folderId)))
        .first();

      if (existingWithName) {
        throw new Error("A folder with this name already exists in this location");
      }

      updates.name = name;
    }

    if (args.color !== undefined) {
      updates.color = args.color;
    }

    if (args.icon !== undefined) {
      updates.icon = args.icon;
    }

    await ctx.db.patch(args.folderId, updates);
    return await ctx.db.get(args.folderId);
  },
});

/** Moves a folder to a new parent with circular reference protection */
export const move = mutation({
  args: {
    folderId: v.id("mediaFolders"),
    newParentId: v.optional(v.id("mediaFolders")), // null for root
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== userId) {
      throw new Error("Folder not found");
    }

    if (folder.isDefault) {
      throw new Error("Cannot move default folders");
    }

    // Can't move to self
    if (args.newParentId === args.folderId) {
      throw new Error("Cannot move a folder into itself");
    }

    // Validate new parent
    if (args.newParentId) {
      const newParent = await ctx.db.get(args.newParentId);
      if (!newParent || newParent.userId !== userId) {
        throw new Error("Target folder not found");
      }

      // Check that new parent is not a descendant of this folder
      let currentFolder: Doc<"mediaFolders"> | null = newParent;
      while (currentFolder?.parentId) {
        if (currentFolder.parentId === args.folderId) {
          throw new Error("Cannot move a folder into its own subfolder");
        }
        currentFolder = await ctx.db.get(currentFolder.parentId);
      }

      // Check depth limit
      let depth = 1;
      currentFolder = newParent;
      while (currentFolder?.parentId && depth < MAX_FOLDER_DEPTH) {
        currentFolder = await ctx.db.get(currentFolder.parentId);
        depth++;
      }
      if (depth >= MAX_FOLDER_DEPTH) {
        throw new Error(`Maximum folder depth of ${MAX_FOLDER_DEPTH} levels reached`);
      }
    }

    // Check for duplicate name in new parent
    const existingWithName = await ctx.db
      .query("mediaFolders")
      .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", args.newParentId))
      .filter((q) =>
        q.and(q.eq(q.field("name"), folder.name), q.neq(q.field("_id"), args.folderId))
      )
      .first();

    if (existingWithName) {
      throw new Error("A folder with this name already exists in the target location");
    }

    // Get max order in new parent
    const siblings = await ctx.db
      .query("mediaFolders")
      .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", args.newParentId))
      .take(100);

    const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order ?? 0), 0);

    await ctx.db.patch(args.folderId, {
      parentId: args.newParentId,
      order: maxOrder + 1,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/** Deletes a folder and optionally moves contained media to another folder */
export const remove = mutation({
  args: {
    folderId: v.id("mediaFolders"),
    moveMediaTo: v.optional(v.id("mediaFolders")), // Where to move contained media (null = unfile)
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.userId !== userId) {
      throw new Error("Folder not found");
    }

    if (folder.isDefault) {
      throw new Error("Cannot delete default folders");
    }

    // Check for subfolders
    const subfolders = await ctx.db
      .query("mediaFolders")
      .withIndex("by_parent", (q) => q.eq("userId", userId).eq("parentId", args.folderId))
      .first();

    if (subfolders) {
      throw new Error(
        "Cannot delete a folder that contains subfolders. Move or delete them first."
      );
    }

    // Move media to new folder or unfile
    const media = await ctx.db
      .query("media")
      .withIndex("by_folder", (q) => q.eq("userId", userId).eq("folderId", args.folderId))
      .take(1000);

    for (const m of media) {
      await ctx.db.patch(m._id, {
        folderId: args.moveMediaTo,
      });
    }

    // Update target folder media count if applicable
    if (args.moveMediaTo) {
      const targetFolder = await ctx.db.get(args.moveMediaTo);
      if (targetFolder && targetFolder.userId === userId) {
        await ctx.db.patch(args.moveMediaTo, {
          mediaCount: (targetFolder.mediaCount ?? 0) + media.length,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.folderId);
    return { success: true, movedMedia: media.length };
  },
});

/** Moves multiple media items to a target folder (batch operation) */
export const moveMedia = mutation({
  args: {
    mediaIds: v.array(v.id("media")),
    folderId: v.optional(v.id("mediaFolders")), // null to unfile
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Validate target folder
    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder || folder.userId !== userId) {
        throw new Error("Target folder not found");
      }
    }

    // Track old folders to update counts
    const oldFolderCounts = new Map<Id<"mediaFolders">, number>();

    // Move each media item
    for (const mediaId of args.mediaIds) {
      const media = await ctx.db.get(mediaId);
      if (!media || media.userId !== userId) {
        continue; // Skip invalid media
      }

      // Track old folder
      if (media.folderId) {
        oldFolderCounts.set(media.folderId, (oldFolderCounts.get(media.folderId) ?? 0) + 1);
      }

      await ctx.db.patch(mediaId, {
        folderId: args.folderId,
      });
    }

    // Update old folder counts
    for (const [folderId, count] of oldFolderCounts) {
      const folder = await ctx.db.get(folderId);
      if (folder) {
        await ctx.db.patch(folderId, {
          mediaCount: Math.max(0, (folder.mediaCount ?? 0) - count),
          updatedAt: Date.now(),
        });
      }
    }

    // Update new folder count
    if (args.folderId) {
      const newFolder = await ctx.db.get(args.folderId);
      if (newFolder) {
        await ctx.db.patch(args.folderId, {
          mediaCount: (newFolder.mediaCount ?? 0) + args.mediaIds.length,
          updatedAt: Date.now(),
        });
      }
    }

    return { success: true, moved: args.mediaIds.length };
  },
});

/** Toggles the favorite status on a media item */
export const toggleFavorite = mutation({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media || media.userId !== userId) {
      throw new Error("Media not found");
    }

    await ctx.db.patch(args.mediaId, {
      isFavorite: !media.isFavorite,
    });

    return { isFavorite: !media.isFavorite };
  },
});

/** Updates tags on a media item with normalization and limits */
export const updateTags = mutation({
  args: {
    mediaId: v.id("media"),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const media = await ctx.db.get(args.mediaId);
    if (!media || media.userId !== userId) {
      throw new Error("Media not found");
    }

    // Normalize tags
    const normalizedTags = [
      ...new Set(
        args.tags
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0 && t.length <= 30)
          .slice(0, 10) // Max 10 tags
      ),
    ];

    await ctx.db.patch(args.mediaId, {
      tags: normalizedTags,
    });

    return { tags: normalizedTags };
  },
});

/** Retrieves favorited media with optional type filtering */
export const getFavorites = query({
  args: {
    type: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("audio"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { media: [], hasMore: false };
    }

    const limit = args.limit ?? 50;

    const media = await ctx.db
      .query("media")
      .withIndex("by_favorite", (q) => q.eq("userId", userId).eq("isFavorite", true))
      .order("desc")
      .take(limit + 1);

    const filtered = args.type ? media.filter((m) => m.type === args.type) : media;

    const hasMore = filtered.length > limit;
    const items = filtered.slice(0, limit);

    return {
      media: items,
      hasMore,
    };
  },
});

/** Searches user's media by tag names */
export const searchByTags = query({
  args: {
    tags: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }

    const limit = args.limit ?? 50;
    const searchTags = args.tags.map((t) => t.toLowerCase().trim());

    if (searchTags.length === 0) {
      return [];
    }

    // Get all user's media with tags
    const allMedia = await ctx.db
      .query("media")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);

    // Filter by tags
    const matches = allMedia.filter((m) => {
      if (!m.tags || m.tags.length === 0) return false;
      return searchTags.some((tag) => m.tags!.includes(tag));
    });

    return matches.slice(0, limit);
  },
});

// ===== INTERNAL MUTATIONS =====

/** Updates folder media count when media is uploaded or deleted */
export const updateFolderCount = internalMutation({
  args: {
    folderId: v.id("mediaFolders"),
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) return;

    await ctx.db.patch(args.folderId, {
      mediaCount: Math.max(0, (folder.mediaCount ?? 0) + args.delta),
      updatedAt: Date.now(),
    });
  },
});
