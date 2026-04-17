/**
 * @fileoverview Voice Notes Management
 *
 * Handles audio recording storage and retrieval for voice messages.
 * Voice notes are stored in Convex file storage with metadata tracking.
 *
 * Features:
 *   - Secure upload URL generation
 *   - Voice note creation with waveform data
 *   - User voice note library
 *   - Transcription support (via external service)
 *
 * Security:
 *   - Only authenticated users can upload
 *   - Users can only delete their own recordings
 *
 * Limits:
 *   - Maximum duration: 5 minutes (300 seconds)
 *   - Maximum file size: 10 MB
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ===== MUTATIONS =====

/** Generates a secure upload URL for voice note file upload */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

/** Creates a voice note record after file upload */
export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    durationSeconds: v.number(),
    waveform: v.optional(v.array(v.number())),
    mimeType: v.string(),
    fileSizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.durationSeconds > 300) {
      throw new Error("Voice note cannot exceed 5 minutes");
    }

    if (args.fileSizeBytes > 10 * 1024 * 1024) {
      throw new Error("Voice note file too large");
    }

    const voiceNoteId = await ctx.db.insert("voiceNotes", {
      userId,
      storageId: args.storageId,
      durationSeconds: args.durationSeconds,
      waveform: args.waveform,
      mimeType: args.mimeType,
      fileSizeBytes: args.fileSizeBytes,
      createdAt: Date.now(),
    });

    return { voiceNoteId };
  },
});

/** Deletes a voice note and its associated storage file */
export const remove = mutation({
  args: { voiceNoteId: v.id("voiceNotes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const voiceNote = await ctx.db.get(args.voiceNoteId);
    if (!voiceNote) throw new Error("Voice note not found");

    if (voiceNote.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.storage.delete(voiceNote.storageId);
    await ctx.db.delete(args.voiceNoteId);

    return { success: true };
  },
});

// ===== QUERIES =====

/** Retrieves a voice note by ID with its storage URL */
export const getById = query({
  args: { voiceNoteId: v.id("voiceNotes") },
  handler: async (ctx, args) => {
    const voiceNote = await ctx.db.get(args.voiceNoteId);
    if (!voiceNote) return null;

    const url = await ctx.storage.getUrl(voiceNote.storageId);

    return {
      ...voiceNote,
      url,
    };
  },
});

/** Gets the current user's voice notes with storage URLs */
export const getMyVoiceNotes = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const limit = args.limit ?? 20;
    const voiceNotes = await ctx.db
      .query("voiceNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    const enriched = await Promise.all(
      voiceNotes.map(async (note) => {
        const url = await ctx.storage.getUrl(note.storageId);
        return { ...note, url };
      })
    );

    return enriched;
  },
});

// ===== INTERNAL MUTATIONS =====

/** Adds transcription text to a voice note (called by transcription service) */
export const addTranscription = internalMutation({
  args: {
    voiceNoteId: v.id("voiceNotes"),
    transcription: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.voiceNoteId, {
      transcription: args.transcription,
    });

    return { success: true };
  },
});
