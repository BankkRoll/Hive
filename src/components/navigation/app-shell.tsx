"use client";

import * as React from "react";
import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

interface AppShellProps {
  children: ReactNode;
  header?: ReactNode;
  title?: string;
}

export function AppShell({ children, header, title }: AppShellProps) {
  const user = useQuery(api.users.currentUser);

  return (
    <SidebarProvider>
      <AppSidebar
        user={
          user
            ? {
                _id: user._id,
                username: user.username,
                displayName: user.displayName,
                avatarR2Key: user.avatarR2Key,
                dicebearSeed: user.dicebearSeed,
                dicebearBgColor: user.dicebearBgColor,
                dicebearEyes: user.dicebearEyes,
                dicebearMouth: user.dicebearMouth,
              }
            : null
        }
      />
      <SidebarInset>
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 bg-background/80 backdrop-blur-sm border-b">
          <div className="flex items-center gap-2 px-4 w-full">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex-1">
              {header || <h1 className="text-lg font-semibold">{title || "Hive"}</h1>}
            </div>
            <AnimatedThemeToggler />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-1 flex-col pb-20 lg:pb-0">{children}</main>
      </SidebarInset>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </SidebarProvider>
  );
}
