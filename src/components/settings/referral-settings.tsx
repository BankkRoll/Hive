"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { toast } from "sonner";
import {
  Gift,
  Copy,
  Check,
  Share2,
  RefreshCw,
  Loader2,
  Users,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

// Custom hook for copy with feedback
function useCopyToClipboard(resetDelay = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string, key: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        toast.success(`${label} copied!`);
        setTimeout(() => setCopiedKey(null), resetDelay);
      } catch (error) {
        toast.error("Failed to copy");
      }
    },
    [resetDelay]
  );

  const isCopied = useCallback((key: string) => copiedKey === key, [copiedKey]);

  return { copy, isCopied };
}

export function ReferralSettings() {
  const referralInfo = useQuery(api.referrals.getMyReferralInfo);
  const referrals = useQuery(api.referrals.getMyReferrals, { limit: 10 });
  const generateCode = useMutation(api.referrals.generateReferralCode);
  const [isGenerating, setIsGenerating] = useState(false);
  const { copy, isCopied } = useCopyToClipboard();

  // Generate the full referral link using the browser's origin
  const fullReferralLink = useMemo(() => {
    if (!referralInfo?.referralCode) return null;
    if (typeof window === "undefined") return referralInfo.referralLink;
    return `${window.location.origin}/signup?ref=${referralInfo.referralCode}`;
  }, [referralInfo?.referralCode, referralInfo?.referralLink]);

  const handleGenerateCode = async () => {
    setIsGenerating(true);
    try {
      await generateCode();
      toast.success("Referral code generated!");
    } catch (error) {
      toast.error("Failed to generate referral code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!fullReferralLink) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Hive!",
          text: "Sign up with my referral link and we both earn rewards!",
          url: fullReferralLink,
        });
      } catch (error) {
        // User cancelled or share failed, copy to clipboard as fallback
        copy(fullReferralLink, "link", "Referral link");
      }
    } else {
      copy(fullReferralLink, "link", "Referral link");
    }
  };

  if (referralInfo === undefined) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Referrals"
          description="Your referral code and earnings"
          backHref="/settings"
        />
        <div className="p-4 space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // No referral info available (user not logged in)
  if (referralInfo === null) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Referrals"
          description="Your referral code and earnings"
          backHref="/settings"
        />
        <div className="p-4">
          <Card>
            <CardContent className="py-8 text-center">
              <Gift className="size-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Please sign in to view your referral information
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <PageHeader
        title="Referrals"
        description="Your referral code and earnings"
        backHref="/settings"
      />
      <div className="p-4 space-y-4">
        {/* Referral Code & Link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="size-5 text-primary" />
              Your Referral Code
            </CardTitle>
            <CardDescription>
              Share your code with friends. When they sign up and make a purchase, you both earn
              rewards!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {referralInfo?.referralCode ? (
              <>
                {/* Referral Code */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Code</label>
                  <div className="flex gap-2">
                    <Input
                      value={referralInfo.referralCode}
                      readOnly
                      className="font-mono text-lg tracking-widest text-center font-bold"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copy(referralInfo.referralCode!, "code", "Referral code")}
                      className="shrink-0 transition-colors"
                    >
                      {isCopied("code") ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Referral Link */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Link</label>
                  <div className="flex gap-2">
                    <Input value={fullReferralLink || ""} readOnly className="text-sm" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        fullReferralLink && copy(fullReferralLink, "link", "Referral link")
                      }
                      className="shrink-0 transition-colors"
                    >
                      {isCopied("link") ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Share Button */}
                <Button onClick={handleShare} className="w-full gap-2">
                  <Share2 className="size-4" />
                  Share Referral Link
                </Button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">
                  Generate your unique referral code to start earning rewards
                </p>
                <Button onClick={handleGenerateCode} disabled={isGenerating} className="gap-2">
                  {isGenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Generate Referral Code
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Referral Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold">{referralInfo?.stats?.totalReferrals ?? 0}</p>
                <p className="text-sm text-muted-foreground">Total Referrals</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <p className="text-2xl font-bold text-primary">
                  {referralInfo?.stats?.totalEarnings ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Coins Earned</p>
              </div>
              <div className="p-4 rounded-lg bg-warning/10 text-center">
                <p className="text-2xl font-bold text-warning">
                  {referralInfo?.stats?.pendingReferrals ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
              <div className="p-4 rounded-lg bg-success/10 text-center">
                <p className="text-2xl font-bold text-success">
                  {referralInfo?.stats?.rewardedReferrals ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Rewarded</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Referrals */}
        {referrals && referrals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-5" />
                Recent Referrals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {referrals.map((referral) => (
                  <div
                    key={referral._id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar user={referral.referredUser} className="size-10" />
                      <div>
                        <p className="font-medium">
                          {referral.referredUser?.displayName ||
                            referral.referredUser?.username ||
                            "User"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          @{referral.referredUser?.username || "unknown"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {referral.status === "pending" && (
                        <span className="text-xs px-2 py-1 rounded-full bg-warning/10 text-warning">
                          Pending
                        </span>
                      )}
                      {referral.status === "qualified" && (
                        <span className="text-xs px-2 py-1 rounded-full bg-info/10 text-info">
                          Qualified
                        </span>
                      )}
                      {referral.status === "rewarded" && (
                        <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success flex items-center gap-1">
                          <CheckCircle2 className="size-3" />
                          Rewarded
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle>How Referrals Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <div>
                  <p className="font-medium">Share your code</p>
                  <p className="text-sm text-muted-foreground">
                    Share your unique referral code or link with friends
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <div>
                  <p className="font-medium">They sign up</p>
                  <p className="text-sm text-muted-foreground">
                    When they create an account using your code, they're linked to you
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <div>
                  <p className="font-medium">Earn rewards</p>
                  <p className="text-sm text-muted-foreground">
                    Once they make a qualifying purchase, you both earn 500 coins!
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
