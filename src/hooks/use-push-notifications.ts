"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

// Convert URL-safe base64 to Uint8Array for applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushNotificationStatus = "unsupported" | "denied" | "prompt" | "granted" | "subscribed";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushNotificationStatus>("prompt");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  const registerToken = useMutation(api.push.registerToken);
  const unregisterToken = useMutation(api.push.unregisterToken);

  // Check support and current status on mount
  useEffect(() => {
    async function checkStatus() {
      // Check if push is supported
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }

      // Check current permission
      const permission = Notification.permission;
      if (permission === "denied") {
        setStatus("denied");
        return;
      }

      // Check if already subscribed
      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
          setSubscription(existingSubscription);
          setStatus("subscribed");
        } else if (permission === "granted") {
          setStatus("granted");
        } else {
          setStatus("prompt");
        }
      } catch (err) {
        console.error("Error checking push subscription:", err);
        setStatus("prompt");
      }
    }

    checkStatus();
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (status === "unsupported" || status === "denied") {
      setError(
        status === "unsupported"
          ? "Push notifications are not supported in this browser"
          : "Push notification permission was denied"
      );
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request permission if not already granted
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setStatus("denied");
        setError("Push notification permission was denied");
        return false;
      }

      // Get the public key from environment
      const publicKey = process.env.NEXT_PUBLIC_WEBPUSH_PUBLIC_KEY;
      if (!publicKey) {
        setError("Push notification configuration error");
        console.error("NEXT_PUBLIC_WEBPUSH_PUBLIC_KEY not set");
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      // Save subscription to server
      await registerToken({
        token: JSON.stringify(pushSubscription.toJSON()),
        platform: "web",
        deviceId: undefined,
      });

      setSubscription(pushSubscription);
      setStatus("subscribed");
      return true;
    } catch (err) {
      console.error("Error subscribing to push:", err);
      setError(err instanceof Error ? err.message : "Failed to enable push notifications");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [status, registerToken]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!subscription) {
      return true;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Unsubscribe from push
      await subscription.unsubscribe();

      // Remove from server
      await unregisterToken({
        token: JSON.stringify(subscription.toJSON()),
      });

      setSubscription(null);
      setStatus("granted");
      return true;
    } catch (err) {
      console.error("Error unsubscribing from push:", err);
      setError(err instanceof Error ? err.message : "Failed to disable push notifications");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [subscription, unregisterToken]);

  return {
    status,
    isLoading,
    error,
    isSupported: status !== "unsupported",
    isSubscribed: status === "subscribed",
    canSubscribe: status === "prompt" || status === "granted",
    subscribe,
    unsubscribe,
  };
}
