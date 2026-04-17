"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Share2,
  TrendingUp,
  BarChart3,
  Link2,
  Hash,
  Globe,
  Briefcase,
  MessageCircle,
  Mail,
  Copy,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Minus,
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Platform types
type SharePlatform =
  | "twitter"
  | "facebook"
  | "linkedin"
  | "whatsapp"
  | "telegram"
  | "email"
  | "copy_link"
  | "native_share"
  | "other";

// Platform icons and colors
const platformConfig: Record<SharePlatform, { icon: typeof Share2; color: string; name: string }> =
  {
    twitter: { icon: Hash, color: "#1DA1F2", name: "Twitter/X" },
    facebook: { icon: Globe, color: "#1877F2", name: "Facebook" },
    linkedin: { icon: Briefcase, color: "#0A66C2", name: "LinkedIn" },
    whatsapp: { icon: MessageCircle, color: "#25D366", name: "WhatsApp" },
    telegram: { icon: MessageCircle, color: "#0088CC", name: "Telegram" },
    email: { icon: Mail, color: "#EA4335", name: "Email" },
    copy_link: { icon: Copy, color: "#6B7280", name: "Copy Link" },
    native_share: { icon: Share2, color: "#8B5CF6", name: "Native Share" },
    other: { icon: ExternalLink, color: "#9CA3AF", name: "Other" },
  };

// ============================================
// SHARE BUTTON WITH TRACKING
// ============================================

interface ShareButtonProps {
  postId: Id<"posts">;
  postUrl?: string;
  postTitle?: string;
}

export function ShareButton({ postId, postUrl, postTitle }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const trackShare = useMutation(api.shares.track);

  const url =
    postUrl || (typeof window !== "undefined" ? `${window.location.origin}/post/${postId}` : "");
  const title = postTitle || "Check out this post";

  const handleShare = async (platform: SharePlatform) => {
    // Track the share
    try {
      await trackShare({
        postId,
        platform,
        referrer: typeof window !== "undefined" ? document.referrer : undefined,
      });
    } catch {
      // Silent fail for analytics
    }

    // Execute the share action
    switch (platform) {
      case "twitter":
        window.open(
          `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
          "_blank"
        );
        break;
      case "facebook":
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
          "_blank"
        );
        break;
      case "linkedin":
        window.open(
          `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
          "_blank"
        );
        break;
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, "_blank");
        break;
      case "telegram":
        window.open(
          `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
          "_blank"
        );
        break;
      case "email":
        window.open(
          `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
          "_blank"
        );
        break;
      case "copy_link":
        navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
        break;
      case "native_share":
        if (navigator.share) {
          navigator.share({ title, url });
        }
        break;
    }

    setOpen(false);
  };

  const hasNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Share2 className="size-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5" />
            Share Post
          </DialogTitle>
          <DialogDescription>Share this post to your favorite platforms</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-4">
          {(Object.keys(platformConfig) as SharePlatform[])
            .filter((key) => key !== "native_share" || hasNativeShare)
            .map((platform) => {
              const config = platformConfig[platform];
              const Icon = config.icon;
              return (
                <button
                  key={platform}
                  onClick={() => handleShare(platform)}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div
                    className="size-12 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    <Icon className="size-6" style={{ color: config.color }} />
                  </div>
                  <span className="text-xs font-medium">{config.name}</span>
                </button>
              );
            })}
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
          <input
            type="text"
            value={url}
            readOnly
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <Button variant="ghost" size="sm" onClick={() => handleShare("copy_link")}>
            <Copy className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// CREATOR SHARE ANALYTICS DASHBOARD
// ============================================

export function ShareAnalyticsDashboard() {
  const [period, setPeriod] = useState("30");
  const analytics = useQuery(api.shares.getCreatorAnalytics, {
    days: parseInt(period),
  });

  if (analytics === undefined) {
    return <ShareAnalyticsSkeleton />;
  }

  if (analytics === null) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Share2 className="size-12 mb-3 opacity-50" />
          <p className="font-medium">Not Available</p>
          <p className="text-sm">Share analytics are only available for creators</p>
        </CardContent>
      </Card>
    );
  }

  const dailyData = Object.entries(analytics.byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14);

  const maxDaily = Math.max(...dailyData.map(([, count]) => count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="size-6 text-primary" />
            Share Analytics
          </h2>
          <p className="text-muted-foreground mt-1">Track how your content is being shared</p>
        </div>

        <Select value={period} onValueChange={(value) => setPeriod(value ?? "30")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          icon={Share2}
          label="Total Shares"
          value={analytics.totalShares}
          subLabel={`${period} days`}
          color="text-primary"
        />
        <StatsCard
          icon={TrendingUp}
          label="All Time"
          value={analytics.totalSharesAllTime}
          subLabel="shares"
          color="text-success"
        />
        <StatsCard
          icon={FileText}
          label="Posts Analyzed"
          value={analytics.postsAnalyzed}
          subLabel="posts"
          color="text-info"
        />
        <StatsCard
          icon={BarChart3}
          label="Avg per Post"
          value={
            analytics.postsAnalyzed > 0
              ? Math.round(analytics.totalShares / analytics.postsAnalyzed)
              : 0
          }
          subLabel="shares"
          color="text-primary"
        />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Platform Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Platform Breakdown</CardTitle>
            <CardDescription>Where your content is being shared</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(analytics.byPlatform).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Share2 className="size-8 mb-2 opacity-50" />
                <p className="text-sm">No shares yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(analytics.byPlatform)
                  .sort(([, a], [, b]) => b - a)
                  .map(([platform, count]) => {
                    const config =
                      platformConfig[platform as SharePlatform] ?? platformConfig.other;
                    const Icon = config.icon;
                    const percentage =
                      analytics.totalShares > 0
                        ? Math.round((count / analytics.totalShares) * 100)
                        : 0;

                    return (
                      <div key={platform} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4" style={{ color: config.color }} />
                            <span>{config.name}</span>
                          </div>
                          <span className="text-muted-foreground">
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: config.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Activity</CardTitle>
            <CardDescription>Share activity over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Calendar className="size-8 mb-2 opacity-50" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {dailyData.map(([date, count]) => {
                  const height = (count / maxDaily) * 100;
                  const dayLabel = new Date(date).toLocaleDateString("en-US", {
                    weekday: "short",
                  });

                  return (
                    <div key={date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-primary/20 rounded-t-sm relative group cursor-help"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      >
                        <div
                          className="absolute inset-0 bg-primary rounded-t-sm transition-all"
                          style={{ height: `${Math.min(100, (count / maxDaily) * 100)}%` }}
                        />
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover px-2 py-1 rounded text-xs shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {count} shares
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {dayLabel.slice(0, 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Shared Posts */}
      {analytics.topPosts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Shared Posts</CardTitle>
            <CardDescription>Your most shared content in this period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.topPosts.map((post, index) => (
                <div key={post._id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {index + 1}
                  </div>
                  <p className="flex-1 text-sm truncate">{post.content}</p>
                  <Badge variant="secondary" className="gap-1">
                    <Share2 className="size-3" />
                    {post.shares}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// POST SHARE ANALYTICS (for individual posts)
// ============================================

interface PostShareAnalyticsProps {
  postId: Id<"posts">;
}

export function PostShareAnalytics({ postId }: PostShareAnalyticsProps) {
  const analytics = useQuery(api.shares.getPostAnalytics, { postId });

  if (analytics === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (analytics === null) {
    return null;
  }

  if (analytics.total === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6 text-muted-foreground">
          <Share2 className="size-4 mr-2" />
          <span className="text-sm">No shares yet</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Share2 className="size-4" />
          Share Analytics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className="text-2xl font-bold">{analytics.total}</div>
          <span className="text-muted-foreground text-sm">total shares</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(analytics.byPlatform).map(([platform, count]) => {
            const config = platformConfig[platform as SharePlatform] ?? platformConfig.other;
            const Icon = config.icon;

            return (
              <Badge
                key={platform}
                variant="secondary"
                className="gap-1"
                style={{ borderColor: config.color }}
              >
                <Icon className="size-3" style={{ color: config.color }} />
                {count}
              </Badge>
            );
          })}
        </div>

        {analytics.recentShares.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">Recent shares</p>
            <div className="space-y-1">
              {analytics.recentShares.slice(0, 3).map((share, i) => {
                const config =
                  platformConfig[share.platform as SharePlatform] ?? platformConfig.other;
                const Icon = config.icon;
                const date = new Date(share.createdAt);

                return (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="size-3" style={{ color: config.color }} />
                    <span>{config.name}</span>
                    <span>·</span>
                    <span>{date.toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function StatsCard({
  icon: Icon,
  label,
  value,
  subLabel,
  color,
}: {
  icon: typeof Share2;
  label: string;
  value: number;
  subLabel: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-muted", color)}>
            <Icon className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {label} <span className="opacity-70">({subLabel})</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ShareAnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div>
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-3 w-24 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
