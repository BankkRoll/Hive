"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        console.log("[PWA] Service worker registered:", registration.scope);

        // Check for updates on load
        registration.update();

        // Handle updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New content available
              setWaitingWorker(newWorker);
              setShowReload(true);

              toast("Update available!", {
                description: "A new version is ready. Refresh to update.",
                duration: Infinity,
                action: {
                  label: "Refresh",
                  onClick: () => reloadPage(newWorker),
                },
              });
            }
          });
        });

        // Check for waiting worker on page load
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowReload(true);
        }
      } catch (error) {
        console.error("[PWA] Service worker registration failed:", error);
      }
    };

    // Register after page load
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
      return () => window.removeEventListener("load", registerSW);
    }
  }, []);

  const reloadPage = (worker: ServiceWorker) => {
    worker.postMessage({ type: "SKIP_WAITING" });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  };

  // Update banner (optional - toast handles this too)
  if (showReload && waitingWorker) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
        <div className="bg-card border rounded-lg shadow-lg p-4 flex items-center gap-3">
          <RefreshCw className="size-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Update available</p>
            <p className="text-xs text-muted-foreground">Refresh to get the latest version</p>
          </div>
          <Button size="sm" onClick={() => reloadPage(waitingWorker)}>
            Update
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

// Hook for push notification subscription
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    const checkSupport = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }

      setIsSupported(true);

      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
          setIsSubscribed(true);
          setSubscription(existingSubscription);
        }
      } catch (error) {
        console.error("[Push] Error checking subscription:", error);
      }
    };

    checkSupport();
  }, []);

  const subscribe = async (webPushPublicKey: string) => {
    if (!isSupported) return null;

    try {
      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(webPushPublicKey).buffer as ArrayBuffer,
      });

      setIsSubscribed(true);
      setSubscription(subscription);

      return subscription;
    } catch (error) {
      console.error("[Push] Error subscribing:", error);
      return null;
    }
  };

  const unsubscribe = async () => {
    if (!subscription) return false;

    try {
      await subscription.unsubscribe();
      setIsSubscribed(false);
      setSubscription(null);
      return true;
    } catch (error) {
      console.error("[Push] Error unsubscribing:", error);
      return false;
    }
  };

  return {
    isSupported,
    isSubscribed,
    subscription,
    subscribe,
    unsubscribe,
  };
}

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
