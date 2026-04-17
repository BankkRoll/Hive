"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useRef } from "react";

import { cn } from "@/lib/utils";
import { flushSync } from "react-dom";

type AnimatedThemeTogglerProps = {
  className?: string;
};

export const AnimatedThemeToggler = ({ className }: AnimatedThemeTogglerProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const onToggle = useCallback(async () => {
    if (!buttonRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");
    const toggled = !isDark;

    // Check if View Transitions API is supported
    if (!document.startViewTransition) {
      // Fallback for browsers without View Transitions
      document.documentElement.classList.toggle("dark", toggled);
      localStorage.setItem("theme", toggled ? "dark" : "light");
      return;
    }

    await document.startViewTransition(() => {
      flushSync(() => {
        document.documentElement.classList.toggle("dark", toggled);
        localStorage.setItem("theme", toggled ? "dark" : "light");
      });
    }).ready;

    const { left, top, width, height } = buttonRef.current.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const maxDistance = Math.hypot(
      Math.max(centerX, window.innerWidth - centerX),
      Math.max(centerY, window.innerHeight - centerY)
    );

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${centerX}px ${centerY}px)`,
          `circle(${maxDistance}px at ${centerX}px ${centerY}px)`,
        ],
      },
      {
        duration: 700,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  }, []);

  // Use CSS to show/hide icons based on dark class - no hydration mismatch
  return (
    <button
      ref={buttonRef}
      onClick={onToggle}
      aria-label="Switch theme"
      className={cn(
        "flex items-center justify-center p-2 rounded-full outline-none focus:outline-none active:outline-none focus:ring-0 cursor-pointer hover:bg-muted transition-colors",
        className
      )}
      type="button"
    >
      {/* Sun icon - visible in dark mode */}
      <Sun className="size-5 text-foreground hidden dark:block" />
      {/* Moon icon - visible in light mode */}
      <Moon className="size-5 text-foreground block dark:hidden" />
    </button>
  );
};
