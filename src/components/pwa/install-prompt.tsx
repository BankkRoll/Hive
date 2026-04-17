"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, X, Smartphone, Share, Plus } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Check if user dismissed before
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show prompt after a delay if not recently dismissed
      if (daysSinceDismissed > 7 || !dismissed) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);

    // For iOS, show prompt after delay if not dismissed recently
    if (iOS && !standalone && (daysSinceDismissed > 7 || !dismissed)) {
      setTimeout(() => setShowPrompt(true), 5000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
  };

  // Don't show if already installed
  if (isStandalone) return null;

  return (
    <Dialog open={showPrompt} onOpenChange={setShowPrompt}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="size-16 rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-lg">
              <Smartphone className="size-8 text-white" />
            </div>
          </div>
          <DialogTitle className="text-center">Install Hive App</DialogTitle>
          <DialogDescription className="text-center">
            Get the full experience with quick access from your home screen
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <Feature icon="lightning" text="Faster loading times" />
          <Feature icon="bell" text="Push notifications" />
          <Feature icon="offline" text="Works offline" />
          <Feature icon="fullscreen" text="Full screen experience" />
        </div>

        {isIOS ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">To install on iOS:</p>
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="flex items-center gap-1">
                1. Tap <Share className="size-4" />
              </span>
              <span className="flex items-center gap-1">
                2. Select <Plus className="size-4" /> Add to Home
              </span>
            </div>
            <Button variant="outline" className="w-full" onClick={handleDismiss}>
              Got it
            </Button>
          </div>
        ) : (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full gap-2" onClick={handleInstall}>
              <Download className="size-4" />
              Install App
            </Button>
            <Button variant="ghost" className="w-full" onClick={handleDismiss}>
              Not now
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  const icons: Record<string, React.ReactNode> = {
    lightning: (
      <svg className="size-5 text-warning" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
          clipRule="evenodd"
        />
      </svg>
    ),
    bell: (
      <svg className="size-5 text-info" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    ),
    offline: (
      <svg className="size-5 text-success" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
    fullscreen: (
      <svg className="size-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M3 4a1 1 0 011-1h4a1 1 0 010 2H5v3a1 1 0 01-2 0V4zm12 0a1 1 0 011 1v3a1 1 0 11-2 0V5h-3a1 1 0 110-2h4zM3 16a1 1 0 001 1h4a1 1 0 100-2H5v-3a1 1 0 10-2 0v4zm12 1a1 1 0 001-1v-4a1 1 0 10-2 0v3h-3a1 1 0 100 2h4z"
          clipRule="evenodd"
        />
      </svg>
    ),
  };

  return (
    <div className="flex items-center gap-3 px-2">
      {icons[icon]}
      <span className="text-sm">{text}</span>
    </div>
  );
}

// Hook to use install prompt elsewhere
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstallable(false);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return { isInstallable, isInstalled, install };
}
