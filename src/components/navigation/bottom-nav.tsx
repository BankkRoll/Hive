"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Search, PlusSquare, Bell, User } from "lucide-react";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/create", icon: PlusSquare, label: "Create", isCreate: true },
  { href: "/notifications", icon: Bell, label: "Notifications" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      {/* Glass background */}
      <div className="absolute inset-0 glass border-t border-border" />

      {/* Nav content */}
      <div className="relative flex items-center justify-around h-16 pb-safe px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;

          if (item.isCreate) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-center",
                  "w-12 h-12 rounded-xl",
                  "bg-primary text-primary-foreground",
                  "shadow-lg hover:shadow-xl",
                  "transition-all duration-200",
                  "press-scale"
                )}
                aria-label={item.label}
              >
                <Icon className="w-6 h-6" strokeWidth={2} />
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center",
                "w-16 h-14 rounded-xl",
                "transition-all duration-200",
                "press-scale",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={item.label}
            >
              <Icon
                className={cn("w-6 h-6 transition-transform duration-200", isActive && "scale-110")}
                strokeWidth={isActive ? 2.5 : 2}
                fill={isActive ? "currentColor" : "none"}
              />
              <span className="text-[10px] font-medium mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
