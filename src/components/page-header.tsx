"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, backHref, children, className }: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 h-14 sm:h-16">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0 -ml-2">
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground truncate hidden sm:block">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </header>
  );
}
