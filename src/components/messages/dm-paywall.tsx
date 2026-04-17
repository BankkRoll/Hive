"use client";

import { UserAvatar } from "@/components/ui/user-avatar";
import { buttonVariants } from "@/components/ui/button";
import { Lock, BadgeCheck } from "lucide-react";
import Link from "next/link";
import type { Id } from "../../../convex/_generated/dataModel";

interface DmPaywallProps {
  creator: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    isVerified?: boolean;
  };
}

export function DmPaywall({ creator }: DmPaywallProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="relative mb-6">
        <UserAvatar user={creator} className="size-20" />
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-muted flex items-center justify-center border-2 border-background">
          <Lock className="size-4 text-muted-foreground" />
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <h2 className="text-xl font-semibold">{creator.displayName || creator.username}</h2>
        {creator.isVerified && <BadgeCheck className="size-5 text-primary" />}
      </div>

      <p className="text-muted-foreground mb-6 max-w-sm">
        Subscribe to @{creator.username} to unlock direct messaging and get access to exclusive
        content.
      </p>

      <div className="space-y-3 w-full max-w-xs">
        <Link href={`/@${creator.username}`} className={buttonVariants({ className: "w-full" })}>
          View Profile & Subscribe
        </Link>
        <Link
          href="/messages"
          className={buttonVariants({ variant: "outline", className: "w-full" })}
        >
          Back to Messages
        </Link>
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Subscribers get direct access to message their favorite creators
      </p>
    </div>
  );
}
