"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubscriptionTiersProps {
  creatorId: Id<"users">;
  creatorUsername: string;
  isSubscribed: boolean;
  currentTierId?: Id<"subscriptionTiers"> | null;
}

const tierIcons = [Zap, Star, Crown, Sparkles, Crown];

export function SubscriptionTiers({
  creatorId,
  creatorUsername,
  isSubscribed,
  currentTierId,
}: SubscriptionTiersProps) {
  const tiers = useQuery(api.subscriptions.getTiers, { creatorId });

  if (!tiers || tiers.length === 0) {
    return null;
  }

  return (
    <div className="p-4 border-t border-border">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Crown className="size-5 text-primary" />
        Subscribe to @{creatorUsername}
      </h3>

      <div className="grid gap-4">
        {tiers.map((tier, index) => {
          const TierIcon = tierIcons[index % tierIcons.length];
          const isCurrentTier = currentTierId === tier._id;

          return (
            <Card
              key={tier._id}
              className={cn(
                "relative overflow-hidden transition-all",
                isCurrentTier && "ring-2 ring-primary"
              )}
              style={tier.ringColor ? { borderColor: tier.ringColor + "40" } : undefined}
            >
              {/* Gradient background */}
              <div
                className="absolute inset-0 opacity-5"
                style={{
                  background: `linear-gradient(135deg, ${tier.ringColor ?? "#FF006E"} 0%, transparent 50%)`,
                }}
              />

              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: tier.ringColor ?? "#FF006E" }}
                    >
                      <TierIcon className="size-4 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{tier.name}</CardTitle>
                      {isCurrentTier && (
                        <Badge variant="secondary" className="text-[10px] mt-1">
                          Current Plan
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold">
                      ${(tier.priceMonthly / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                </div>
                {tier.description && (
                  <CardDescription className="mt-2">{tier.description}</CardDescription>
                )}
              </CardHeader>

              <CardContent className="pt-0">
                {tier.benefits && tier.benefits.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {tier.benefits.map((benefit, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check
                          className="size-4 mt-0.5 flex-shrink-0"
                          style={{ color: tier.ringColor ?? "#FF006E" }}
                        />
                        <span>{benefit}</span>
                      </li>
                    ))}
                    {tier.canDM && (
                      <li className="flex items-start gap-2 text-sm">
                        <Check
                          className="size-4 mt-0.5 flex-shrink-0"
                          style={{ color: tier.ringColor ?? "#FF006E" }}
                        />
                        <span>Direct message access</span>
                      </li>
                    )}
                  </ul>
                )}

                <Button
                  className="w-full"
                  style={
                    !isCurrentTier ? { backgroundColor: tier.ringColor ?? "#FF006E" } : undefined
                  }
                  variant={isCurrentTier ? "outline" : "default"}
                  disabled={isCurrentTier}
                >
                  {isCurrentTier ? "Current Plan" : "Subscribe"}
                </Button>

                {tier.subscriberLimit && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {tier.currentSubscribers ?? 0} / {tier.subscriberLimit} spots filled
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
