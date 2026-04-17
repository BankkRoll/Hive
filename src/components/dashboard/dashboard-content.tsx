"use client";

import { useQuery } from "convex/react";
import { useQueryState } from "nuqs";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Heart,
  Eye,
  Coins,
  Crown,
  MessageCircle,
  Star,
  DollarSign,
  Calendar,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { dashboardPeriodParser, type DashboardPeriod } from "@/lib/search-params";

export function DashboardContent() {
  const [period, setPeriod] = useQueryState(
    "period",
    dashboardPeriodParser.withOptions({
      history: "push",
    })
  );

  const currentPeriod = period ?? "week";
  // Map dashboard period to API period (API doesn't support "day" or "all")
  const apiPeriod = currentPeriod === "day" || currentPeriod === "all" ? "week" : currentPeriod;
  const stats = useQuery(api.analytics.getDashboardStats);
  const followerGrowth = useQuery(api.analytics.getFollowerGrowth, {
    period: apiPeriod,
  });
  const topPosts = useQuery(api.analytics.getTopPosts, { limit: 5, sortBy: "views" });
  const topSupporters = useQuery(api.analytics.getTopSupporters, { limit: 5 });
  const earningsSummary = useQuery(api.tips.getEarningsSummary);
  const currentUser = useQuery(api.users.currentUser);

  const isLoading = stats === undefined || followerGrowth === undefined || topPosts === undefined;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const periodLabel = {
    day: "Today",
    week: "This Week",
    month: "This Month",
    all: "All Time",
  }[currentPeriod];

  return (
    <div className="feed-container pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="size-6 text-primary" />
            <h1 className="text-xl font-bold">Creator Dashboard</h1>
          </div>
          {currentUser?.role === "creator" && (
            <Badge variant="secondary" className="gap-1">
              <Crown className="size-3" />
              Creator
            </Badge>
          )}
        </div>

        {/* Period Tabs */}
        <Tabs value={currentPeriod} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
          <TabsList className="w-full justify-start rounded-none bg-transparent h-auto p-0 px-4 border-b">
            <TabsTrigger
              value="day"
              className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
            >
              Today
            </TabsTrigger>
            <TabsTrigger
              value="week"
              className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
            >
              Week
            </TabsTrigger>
            <TabsTrigger
              value="month"
              className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
            >
              Month
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent py-3"
            >
              All Time
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="p-4 space-y-6">
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Views" value={stats?.totalViews ?? 0} icon={Eye} period={periodLabel} />
          <StatCard
            title="Likes"
            value={stats?.totalLikes ?? 0}
            icon={Heart}
            period={periodLabel}
          />
          <StatCard
            title="Followers"
            value={stats?.followers ?? 0}
            icon={Users}
            period={periodLabel}
          />
          <StatCard
            title="Comments"
            value={stats?.totalComments ?? 0}
            icon={MessageCircle}
            period={periodLabel}
          />
        </div>

        {/* Earnings Card */}
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="size-5 text-primary" />
              Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{periodLabel}</p>
                <p className="text-2xl font-bold">
                  {formatCoins(
                    period === "day"
                      ? (earningsSummary?.today ?? 0)
                      : period === "week"
                        ? (earningsSummary?.thisWeek ?? 0)
                        : period === "month"
                          ? (earningsSummary?.thisMonth ?? 0)
                          : (earningsSummary?.total ?? 0)
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">All Time</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCoins(earningsSummary?.total ?? 0)}
                </p>
              </div>
            </div>

            {/* Earnings breakdown */}
            <div className="mt-4 pt-4 border-t border-primary/20">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tips received</span>
                <span className="font-medium">
                  {earningsSummary?.transactionCount ?? 0} transactions
                </span>
              </div>
            </div>

            <Link
              href="/wallet"
              className={buttonVariants({ variant: "default", className: "w-full mt-4" })}
            >
              View Wallet
              <ArrowUpRight className="size-4 ml-2" />
            </Link>
          </CardContent>
        </Card>

        {/* Follower Growth Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-5 text-success" />
              Follower Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            {followerGrowth && followerGrowth.length > 0 ? (
              <div className="space-y-3">
                {followerGrowth.map((point, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16">
                      {formatDateShort(point.timestamp)}
                    </span>
                    <Progress
                      value={
                        (point.count / Math.max(...followerGrowth.map((p) => p.count || 1))) * 100
                      }
                      className="flex-1 h-2"
                    />
                    <span className="text-sm font-medium w-8 text-right">+{point.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={TrendingUp} message="No follower data yet" />
            )}
          </CardContent>
        </Card>

        {/* Top Performing Posts */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="size-5 text-warning" />
                Top Posts
              </CardTitle>
              <Link
                href={`/@${currentUser?.username}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                View All
                <ChevronRight className="size-4 ml-1" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {topPosts && topPosts.length > 0 ? (
              <div className="space-y-3">
                {topPosts.map((post, index) => (
                  <Link
                    key={post._id}
                    href={`/post/${post._id}`}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`size-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                        index === 0
                          ? "bg-warning"
                          : index === 1
                            ? "bg-muted-foreground"
                            : index === 2
                              ? "bg-accent-foreground"
                              : "bg-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{post.content || "Media post"}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="size-3" />
                          {post.viewsCount?.toLocaleString() ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="size-3" />
                          {post.likesCount?.toLocaleString() ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="size-3" />
                          {post.commentsCount?.toLocaleString() ?? 0}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Star} message="No posts yet" />
            )}
          </CardContent>
        </Card>

        {/* Top Supporters */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="size-5 text-primary" />
              Top Supporters
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSupporters && topSupporters.length > 0 ? (
              <div className="space-y-3">
                {topSupporters.map((supporter, index) => (
                  <Link
                    key={supporter._id}
                    href={`/@${supporter.username}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="relative">
                      <UserAvatar user={supporter} className="size-10" />
                      {index < 3 && (
                        <div
                          className={`absolute -top-1 -right-1 size-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${
                            index === 0
                              ? "bg-warning"
                              : index === 1
                                ? "bg-muted-foreground"
                                : "bg-accent-foreground"
                          }`}
                        >
                          {index + 1}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm truncate">
                          {supporter.displayName || supporter.username}
                        </span>
                        {supporter.isSubscribed && <BadgeCheck className="size-4 text-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground">@{supporter.username}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        {formatCoins(supporter.totalTips)}
                      </p>
                      <p className="text-xs text-muted-foreground">tipped</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Coins} message="No supporters yet" />
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/create"
            className={buttonVariants({
              variant: "outline",
              className: "h-auto py-4 flex-col gap-2",
            })}
          >
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Star className="size-5 text-primary" />
            </div>
            <span className="text-sm font-medium">Create Post</span>
          </Link>
          <Link
            href="/settings"
            className={buttonVariants({
              variant: "outline",
              className: "h-auto py-4 flex-col gap-2",
            })}
          >
            <div className="size-10 rounded-full bg-muted flex items-center justify-center">
              <Crown className="size-5 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium">Manage Tiers</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  change?: number;
  icon: React.ComponentType<{ className?: string }>;
  period: string;
}

function StatCard({ title, value, change, icon: Icon, period }: StatCardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="size-4 text-primary" />
          </div>
          {change !== undefined && change !== 0 && (
            <div
              className={`flex items-center text-xs ${
                isPositive
                  ? "text-success"
                  : isNegative
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {isPositive ? (
                <TrendingUp className="size-3 mr-1" />
              ) : (
                <TrendingDown className="size-3 mr-1" />
              )}
              {Math.abs(change)}%
            </div>
          )}
        </div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function formatCoins(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toLocaleString();
}

function formatDateShort(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DashboardSkeleton() {
  return (
    <div className="feed-container">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <Skeleton className="size-6 rounded" />
          <Skeleton className="h-7 w-48" />
        </div>
      </div>

      {/* Period tabs skeleton */}
      <div className="flex gap-4 p-4 border-b">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16" />
        ))}
      </div>

      <div className="p-4 space-y-6">
        {/* Stats grid skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Earnings card skeleton */}
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-8 w-24" />
              </div>
              <div>
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
            <Skeleton className="h-10 w-full mt-4" />
          </CardContent>
        </Card>

        {/* Lists skeleton */}
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-24 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
