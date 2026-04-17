"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useRef, useCallback } from "react";
import usePresenceBase from "@convex-dev/presence/react";
import type { Id } from "../../convex/_generated/dataModel";

// Online threshold: users are "online" if heartbeat within last 10 seconds
const ONLINE_THRESHOLD_MS = 10 * 1000;

// Heartbeat interval: send heartbeat every 5 seconds
const HEARTBEAT_INTERVAL_MS = 5 * 1000;

// ============================================
// ROOM-BASED PRESENCE (via @convex-dev/presence)
// Use this for specific rooms like chat, streams, etc.
// ============================================

export function useRoomPresence(roomId: string, userId: string | undefined) {
  // Only enable if we have both roomId and userId
  const presenceState = usePresenceBase(api.presence, roomId, userId ?? "");

  return presenceState;
}

// ============================================
// GLOBAL USER PRESENCE (via custom userPresence table)
// Use this for showing online status app-wide
// ============================================

// Hook to send heartbeats to update user's global presence
export function usePresenceHeartbeat() {
  const updatePresence = useMutation(api.presence.updateUserPresence);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Send initial heartbeat
    updatePresence().catch(console.error);

    // Set up interval
    intervalRef.current = setInterval(() => {
      updatePresence().catch(console.error);
    }, HEARTBEAT_INTERVAL_MS);

    // Handle visibility change (send heartbeat when tab becomes visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updatePresence().catch(console.error);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle beforeunload (optional: could send disconnect beacon)
    const handleBeforeUnload = () => {
      // The @convex-dev/presence hook handles sendBeacon for room presence
      // For global presence, we just let the heartbeat expire naturally
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [updatePresence]);
}

// Hook to get a single user's presence with privacy check
export function useUserPresence(userId: Id<"users"> | undefined) {
  const presence = useQuery(api.presence.getPresenceWithPrivacy, userId ? { userId } : "skip");

  // Compute online status client-side
  const isOnline = presence?.lastHeartbeatAt
    ? Date.now() - presence.lastHeartbeatAt < ONLINE_THRESHOLD_MS
    : false;

  return {
    isOnline,
    lastActiveAt: presence?.lastActiveAt,
    lastHeartbeatAt: presence?.lastHeartbeatAt,
  };
}

// Hook to get multiple users' presence (for conversation list)
export function useUsersPresence(userIds: Id<"users">[] | undefined) {
  const presenceData = useQuery(
    api.presence.getPresenceForUsersWithPrivacy,
    userIds && userIds.length > 0 ? { userIds } : "skip"
  );

  // Return a function to check online status for any user
  const getPresence = useCallback(
    (userId: Id<"users">) => {
      if (!presenceData) return { isOnline: false, lastActiveAt: undefined };

      const presence = presenceData[userId];
      if (!presence) return { isOnline: false, lastActiveAt: undefined };

      const isOnline = presence.lastHeartbeatAt
        ? Date.now() - presence.lastHeartbeatAt < ONLINE_THRESHOLD_MS
        : false;

      return {
        isOnline,
        lastActiveAt: presence.lastActiveAt,
      };
    },
    [presenceData]
  );

  return { getPresence, presenceData };
}

// Helper to format "last active" time
export function formatLastActive(lastActiveAt: number | undefined): string {
  if (!lastActiveAt) return "";

  const now = Date.now();
  const diff = now - lastActiveAt;

  // Less than a minute
  if (diff < 60 * 1000) {
    return "Active now";
  }

  // Less than an hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `Active ${minutes}m ago`;
  }

  // Less than a day
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `Active ${hours}h ago`;
  }

  // More than a day
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 1) {
    return "Active yesterday";
  }
  return `Active ${days}d ago`;
}
