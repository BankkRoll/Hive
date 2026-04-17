"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Award,
  Crown,
  Star,
  Users,
  TrendingUp,
  Calendar,
  MoreVertical,
  Sparkles,
  Shield,
  Clock,
  UserCheck,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BadgeData {
  _id: Id<"subscriberBadges">;
  subscriptionId: Id<"subscriptions">;
  fanId: Id<"users">;
  creatorId: Id<"users">;
  tierId: Id<"subscriptionTiers">;
  months: number;
  isFounding?: boolean;
  tenure: number;
  firstSubscribedAt: number;
  lastUpgradedAt: number;
  createdAt: number;
  label: string;
  color: string;
  fan: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
  };
  tier: {
    _id: Id<"subscriptionTiers">;
    name: string;
  } | null;
}

interface BadgeStats {
  total: number;
  founding: number;
  new: number;
  oneToThree: number;
  threeToSix: number;
  sixToTwelve: number;
  oneYear: number;
  twoYearsPlus: number;
  averageMonths: number;
  longestTenure: number;
}

export function SubscriberBadgesManager() {
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [showFoundingDialog, setShowFoundingDialog] = useState(false);
  const [actionType, setActionType] = useState<"add" | "remove">("add");

  // Fetch badges with different filters
  const allBadges = useQuery(api.subscriberBadges.getCreatorBadges, { limit: 100 });
  const foundingBadges = useQuery(api.subscriberBadges.getCreatorBadges, {
    foundingOnly: true,
    limit: 100,
  });
  const milestones = useQuery(api.subscriberBadges.getMilestones, {});

  const markAsFounding = useMutation(api.subscriberBadges.markAsFounding);
  const removeFounding = useMutation(api.subscriberBadges.removeFounding);

  const handleFoundingAction = async () => {
    if (!selectedBadge) return;

    try {
      if (actionType === "add") {
        await markAsFounding({ fanId: selectedBadge.fanId });
        toast.success("Subscriber marked as Founding Member!");
      } else {
        await removeFounding({ fanId: selectedBadge.fanId });
        toast.success("Founding Member status removed");
      }
      setShowFoundingDialog(false);
      setSelectedBadge(null);
    } catch {
      toast.error("Failed to update founding status");
    }
  };

  const openFoundingDialog = (badge: BadgeData, action: "add" | "remove") => {
    setSelectedBadge(badge);
    setActionType(action);
    setShowFoundingDialog(true);
  };

  // Filter badges based on selection
  const getFilteredBadges = () => {
    if (!allBadges) return [];

    switch (selectedFilter) {
      case "founding":
        return foundingBadges?.badges ?? [];
      case "new":
        return allBadges.badges.filter((b) => b.months === 0);
      case "1-3":
        return allBadges.badges.filter((b) => b.months >= 1 && b.months < 3);
      case "3-6":
        return allBadges.badges.filter((b) => b.months >= 3 && b.months < 6);
      case "6-12":
        return allBadges.badges.filter((b) => b.months >= 6 && b.months < 12);
      case "1year+":
        return allBadges.badges.filter((b) => b.months >= 12);
      default:
        return allBadges.badges;
    }
  };

  const filteredBadges = getFilteredBadges();
  const stats = allBadges?.stats as BadgeStats | undefined;

  if (!allBadges || !milestones) {
    return <SubscriberBadgesManagerSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Award className="size-6 text-primary" />
          Subscriber Badges
        </h2>
        <p className="text-muted-foreground mt-1">
          View and manage your subscribers&apos; loyalty badges
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard icon={Users} label="Total Badges" value={stats?.total ?? 0} color="text-info" />
        <StatsCard
          icon={Crown}
          label="Founding Members"
          value={stats?.founding ?? 0}
          color="text-warning"
        />
        <StatsCard
          icon={TrendingUp}
          label="Avg. Tenure"
          value={`${stats?.averageMonths ?? 0}mo`}
          color="text-success"
        />
        <StatsCard
          icon={Star}
          label="Longest Tenure"
          value={`${stats?.longestTenure ?? 0}mo`}
          color="text-primary"
        />
      </div>

      {/* Badge Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Badge Distribution</CardTitle>
          <CardDescription>
            How your subscribers are distributed across badge levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <BadgeDistributionBar
              label="New"
              count={stats?.new ?? 0}
              total={stats?.total ?? 1}
              color="#94A3B8"
            />
            <BadgeDistributionBar
              label="1-3 Months"
              count={stats?.oneToThree ?? 0}
              total={stats?.total ?? 1}
              color="#F59E0B"
            />
            <BadgeDistributionBar
              label="3-6 Months"
              count={stats?.threeToSix ?? 0}
              total={stats?.total ?? 1}
              color="#10B981"
            />
            <BadgeDistributionBar
              label="6-12 Months"
              count={stats?.sixToTwelve ?? 0}
              total={stats?.total ?? 1}
              color="#3B82F6"
            />
            <BadgeDistributionBar
              label="1+ Year"
              count={stats?.oneYear ?? 0}
              total={stats?.total ?? 1}
              color="#8B5CF6"
            />
            <BadgeDistributionBar
              label="2+ Years"
              count={stats?.twoYearsPlus ?? 0}
              total={stats?.total ?? 1}
              color="#EC4899"
            />
          </div>
        </CardContent>
      </Card>

      {/* Badge Milestones Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="size-5" />
            Badge Milestones
          </CardTitle>
          <CardDescription>
            Badge colors evolve automatically as subscribers stay longer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {milestones.milestones.map((milestone) => (
              <div
                key={milestone.months}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50"
              >
                <div className="size-3 rounded-full" style={{ backgroundColor: milestone.color }} />
                <span className="text-sm font-medium">{milestone.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border-2 border-warning/30">
              <Crown className="size-3 text-warning" />
              <span className="text-sm font-medium">{milestones.founding.label}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{milestones.note}</p>
        </CardContent>
      </Card>

      {/* Subscriber List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subscribers</CardTitle>
          <CardDescription>View and manage individual subscriber badges</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={selectedFilter} onValueChange={setSelectedFilter}>
            <div className="px-6 border-b">
              <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0 py-2">
                <TabsTrigger value="all" className="data-active:bg-muted">
                  All ({stats?.total ?? 0})
                </TabsTrigger>
                <TabsTrigger value="founding" className="data-active:bg-muted">
                  <Crown className="size-3 mr-1 text-warning" />
                  Founding ({stats?.founding ?? 0})
                </TabsTrigger>
                <TabsTrigger value="new" className="data-active:bg-muted">
                  New ({stats?.new ?? 0})
                </TabsTrigger>
                <TabsTrigger value="1-3" className="data-active:bg-muted">
                  1-3mo ({stats?.oneToThree ?? 0})
                </TabsTrigger>
                <TabsTrigger value="3-6" className="data-active:bg-muted">
                  3-6mo ({stats?.threeToSix ?? 0})
                </TabsTrigger>
                <TabsTrigger value="6-12" className="data-active:bg-muted">
                  6-12mo ({stats?.sixToTwelve ?? 0})
                </TabsTrigger>
                <TabsTrigger value="1year+" className="data-active:bg-muted">
                  1yr+ ({(stats?.oneYear ?? 0) + (stats?.twoYearsPlus ?? 0)})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={selectedFilter} className="mt-0">
              <ScrollArea className="h-[400px]">
                {filteredBadges.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="size-12 mb-3 opacity-50" />
                    <p>No subscribers in this category</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredBadges.map((badge) => (
                      <SubscriberBadgeRow
                        key={badge._id}
                        badge={badge}
                        onFoundingAction={openFoundingDialog}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Founding Member Dialog */}
      <Dialog open={showFoundingDialog} onOpenChange={setShowFoundingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === "add" ? (
                <>
                  <Crown className="size-5 text-warning" />
                  Grant Founding Member Status
                </>
              ) : (
                <>
                  <Shield className="size-5 text-muted-foreground" />
                  Remove Founding Member Status
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {actionType === "add" ? (
                <>
                  This will grant <strong>@{selectedBadge?.fan.username}</strong> the special
                  Founding Member badge. This badge signifies they are an early supporter.
                </>
              ) : (
                <>
                  This will remove the Founding Member status from{" "}
                  <strong>@{selectedBadge?.fan.username}</strong>. They will keep their regular
                  tenure badge.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedBadge && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <SubscriberAvatar fan={selectedBadge.fan} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {selectedBadge.fan.displayName || selectedBadge.fan.username}
                </p>
                <p className="text-sm text-muted-foreground">@{selectedBadge.fan.username}</p>
              </div>
              <Badge
                style={{ backgroundColor: selectedBadge.color }}
                className="text-white shrink-0"
              >
                {selectedBadge.label}
              </Badge>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFoundingDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleFoundingAction}
              variant={actionType === "add" ? "default" : "destructive"}
            >
              {actionType === "add" ? "Grant Status" : "Remove Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Stats Card Component
function StatsCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
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
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Badge Distribution Bar
function BadgeDistributionBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <div className="size-3 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="text-muted-foreground">
          {count} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

// Subscriber Avatar Component
function SubscriberAvatar({ fan }: { fan: BadgeData["fan"] }) {
  return <UserAvatar user={fan} className="size-10" />;
}

// Subscriber Badge Row
function SubscriberBadgeRow({
  badge,
  onFoundingAction,
}: {
  badge: BadgeData;
  onFoundingAction: (badge: BadgeData, action: "add" | "remove") => void;
}) {
  const subscribedDate = new Date(badge.firstSubscribedAt);

  return (
    <div className="flex items-center gap-3 px-6 py-4 hover:bg-muted/50 transition-colors">
      <SubscriberAvatar fan={badge.fan} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{badge.fan.displayName || badge.fan.username}</p>
          {badge.isFounding && <Crown className="size-4 text-warning shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>@{badge.fan.username}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            Since {subscribedDate.toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {badge.tier && (
          <Badge variant="outline" className="hidden sm:flex">
            {badge.tier.name}
          </Badge>
        )}

        <Badge style={{ backgroundColor: badge.color }} className="text-white shrink-0">
          {badge.label}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2">
              <UserCheck className="size-4" />
              View Profile
              <ChevronRight className="size-4 ml-auto" />
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Clock className="size-4" />
              {badge.tenure} days subscribed
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {badge.isFounding ? (
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onClick={() => onFoundingAction(badge, "remove")}
              >
                <Crown className="size-4" />
                Remove Founding Status
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="gap-2" onClick={() => onFoundingAction(badge, "add")}>
                <Crown className="size-4 text-warning" />
                Grant Founding Status
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Loading Skeleton
function SubscriberBadgesManagerSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64 mt-2" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div>
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-20 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
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
    </div>
  );
}

// My Badges component for fans to view their badges
export function MyBadges() {
  const badges = useQuery(api.subscriberBadges.getMyBadges, {});

  if (badges === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24 mt-1" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (badges.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Award className="size-12 mb-3 opacity-50" />
          <p className="font-medium">No Badges Yet</p>
          <p className="text-sm">Subscribe to creators to earn loyalty badges!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Award className="size-5 text-primary" />
        My Subscriber Badges
      </h3>
      <div className="grid gap-4">
        {badges.map((badge) => (
          <MyBadgeCard key={badge._id} badge={badge} />
        ))}
      </div>
    </div>
  );
}

function MyBadgeCard({
  badge,
}: {
  badge: NonNullable<ReturnType<typeof useQuery<typeof api.subscriberBadges.getMyBadges>>>[number];
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <UserAvatar user={badge.creator} className="size-12" />

          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {badge.creator.displayName || badge.creator.username}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />
              {badge.tenure} days subscribed
            </p>
          </div>

          <div className="flex items-center gap-2">
            {badge.isFounding && <Crown className="size-5 text-warning" />}
            <Badge style={{ backgroundColor: badge.color }} className="text-white">
              {badge.label}
            </Badge>
          </div>
        </div>

        {badge.tier && (
          <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
            Current tier: <span className="font-medium text-foreground">{badge.tier.name}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
