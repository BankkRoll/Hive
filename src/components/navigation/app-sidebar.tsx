"use client";

import * as React from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Bell,
  ChevronsUpDown,
  Home,
  Images,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { useAuthDialog } from "@/components/auth/auth-dialog";
import { HiveLogo } from "@/components/logos/hive-logo";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/gallery", icon: Images, label: "Gallery" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
  { href: "/messages", icon: MessageSquare, label: "Messages" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    _id?: string;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    dicebearSeed?: string;
    dicebearBgColor?: string;
    dicebearEyes?: string;
    dicebearMouth?: string;
  } | null;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { theme, setTheme } = useTheme();
  const { openAuthDialog } = useAuthDialog();
  const { isMobile } = useSidebar();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Header with Logo */}
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-3">
        <Link href="/" className="text-primary flex items-center justify-center">
          <HiveLogo className="h-8 w-auto group-data-[collapsible=icon]:h-7 transition-all duration-200" />
        </Link>
      </SidebarHeader>

      {/* Main Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.label}
                      size="lg"
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Create Post Button */}
        {user && (
          <SidebarGroup className="mt-auto">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/create" />}
                  tooltip="Create Post"
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                >
                  <Plus />
                  <span>Create Post</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Sign In Card (when not logged in) - fade when collapsed */}
        {!user && (
          <SidebarGroup className="mt-auto transition-all duration-200 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:scale-95 group-data-[collapsible=icon]:pointer-events-none">
            <div className="mx-2 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
              <p className="text-sm font-medium mb-1">Join Hive</p>
              <p className="text-xs text-muted-foreground mb-3">
                Sign in to follow creators and unlock exclusive content.
              </p>
              <Button className="w-full" size="sm" onClick={() => openAuthDialog()}>
                Get Started
              </Button>
            </div>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer with User Menu - only show when logged in */}
      {user && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <SidebarMenuButton
                  render={<DropdownMenuTrigger />}
                  size="lg"
                  tooltip={user.displayName || "Profile"}
                >
                  <UserAvatar user={user} className="size-6 rounded-md shrink-0" />
                  <span className="truncate">{user.displayName || "User"}</span>
                  <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="p-0 font-normal">
                      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                        <UserAvatar user={user} className="h-8 w-8 rounded-lg" />
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-semibold">
                            {user.displayName || "User"}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            @{user.username || "user"}
                          </span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link href={`/@${user.username}`}>
                        <User className="mr-2 size-4" />
                        View Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings">
                        <Settings className="mr-2 size-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                    {theme === "dark" ? (
                      <>
                        <Sun className="mr-2 size-4" />
                        Light mode
                      </>
                    ) : (
                      <>
                        <Moon className="mr-2 size-4" />
                        Dark mode
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
