"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 text-center">
      <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <WifiOff className="size-10 text-muted-foreground" />
      </div>

      <h1 className="text-2xl font-bold mb-2">You&apos;re Offline</h1>
      <p className="text-muted-foreground mb-6 max-w-sm">
        It looks like you&apos;ve lost your internet connection. Check your connection and try
        again.
      </p>

      <Button onClick={() => window.location.reload()} className="gap-2">
        <RefreshCw className="size-4" />
        Try Again
      </Button>

      <p className="text-xs text-muted-foreground mt-8">Some features may still work offline</p>
    </div>
  );
}
