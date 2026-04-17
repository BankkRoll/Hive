"use client";

import { ReactNode, useMemo } from "react";

import { AuthDialogProvider } from "@/components/auth/auth-dialog";
import { OnboardingProvider } from "@/components/auth/onboarding-dialog";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient, useQuery } from "convex/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { PWAInstallPrompt } from "@/components/pwa/install-prompt";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePresenceHeartbeat } from "@/hooks/use-presence";
import { api } from "../../convex/_generated/api";

// Component that tracks user presence (sends heartbeats when authenticated)
function PresenceTracker() {
  const currentUser = useQuery(api.users.currentUser);

  // Only track presence when user is authenticated and onboarded
  const shouldTrack = currentUser && currentUser.onboardedAt;

  // Conditionally enable the heartbeat hook
  if (shouldTrack) {
    return <PresenceHeartbeatRunner />;
  }

  return null;
}

// Separate component to call the hook (hooks must be called unconditionally)
function PresenceHeartbeatRunner() {
  usePresenceHeartbeat();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const convex = useMemo(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!), []);

  return (
    <NuqsAdapter>
      <ConvexAuthNextjsProvider client={convex}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          <TooltipProvider>
            <AuthDialogProvider>
              <OnboardingProvider>
                <PresenceTracker />
                {children}
              </OnboardingProvider>
            </AuthDialogProvider>
          </TooltipProvider>
          <Toaster position="bottom-center" richColors closeButton />
          <PWAInstallPrompt />
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </ConvexAuthNextjsProvider>
    </NuqsAdapter>
  );
}
