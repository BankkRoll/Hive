"use client";

import { useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wallet,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  DollarSign,
  CreditCard,
  ExternalLink,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Building2,
  Users,
  Banknote,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MIN_PAYOUT_CENTS = 5000; // $50 minimum

export function PayoutSettings() {
  const currentUser = useQuery(api.users.currentUser);
  const earnings = useQuery(api.payouts.getEarningsSummary);
  const payoutHistory = useQuery(api.payouts.getPayoutHistory, { limit: 10 });

  const createConnectAccount = useAction(api.stripe.createConnectAccount);
  const getConnectStatus = useAction(api.stripe.getConnectAccountStatus);
  const getConnectDashboard = useAction(api.stripe.getConnectDashboardLink);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [connectStatus, setConnectStatus] = useState<{
    hasAccount: boolean;
    isOnboarded: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null>(null);

  // Check connect status on mount
  useState(() => {
    checkConnectStatus();
  });

  const checkConnectStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const status = await getConnectStatus({});
      setConnectStatus(status);
    } catch {
      // User may not have an account yet
      setConnectStatus({
        hasAccount: false,
        isOnboarded: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSetupConnect = async () => {
    setIsConnecting(true);
    try {
      const result = await createConnectAccount({
        returnUrl: `${window.location.origin}/settings/payouts?success=true`,
        refreshUrl: `${window.location.origin}/settings/payouts?refresh=true`,
      });
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to setup payouts");
      setIsConnecting(false);
    }
  };

  const handleOpenDashboard = async () => {
    try {
      const result = await getConnectDashboard({});
      window.open(result.url, "_blank");
    } catch {
      toast.error("Failed to open dashboard");
    }
  };

  if (currentUser === undefined || earnings === undefined) {
    return <PayoutSettingsSkeleton />;
  }

  if (currentUser?.role !== "creator") {
    return (
      <div className="feed-container">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            Payout Settings
          </h1>
        </div>
        <div className="p-8 text-center">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="size-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Creator Account Required</h2>
          <p className="text-muted-foreground">
            You need to be a creator to access payout settings.
          </p>
        </div>
      </div>
    );
  }

  const isSetup = connectStatus?.hasAccount && connectStatus?.payoutsEnabled;

  return (
    <div className="feed-container">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            Payout Settings
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={checkConnectStatus}
            disabled={isCheckingStatus}
          >
            <RefreshCw className={cn("size-4", isCheckingStatus && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Stripe Connect Setup Card */}
        <Card className={cn("overflow-hidden", !isSetup && "border-primary/50 bg-primary/5")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="size-5" />
              Stripe Connect
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isCheckingStatus ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking account status...
              </div>
            ) : isSetup ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="size-5" />
                  <span className="font-medium">Payouts enabled</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your Stripe account is connected and ready to receive payouts.
                </p>
                <Button variant="outline" onClick={handleOpenDashboard} className="gap-2">
                  <ExternalLink className="size-4" />
                  Open Stripe Dashboard
                </Button>
              </div>
            ) : connectStatus?.hasAccount && !connectStatus?.payoutsEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-warning">
                  <Clock className="size-5" />
                  <span className="font-medium">Setup incomplete</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Please complete your Stripe onboarding to receive payouts.
                </p>
                <Button onClick={handleSetupConnect} disabled={isConnecting} className="gap-2">
                  {isConnecting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpRight className="size-4" />
                  )}
                  Continue Setup
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your bank account through Stripe to receive payouts from your earnings.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    Secure bank transfers
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    Fast payouts (1-3 business days)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    Available in 40+ countries
                  </li>
                </ul>
                <Button
                  onClick={handleSetupConnect}
                  disabled={isConnecting}
                  className="w-full gap-2"
                >
                  {isConnecting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                  {isConnecting ? "Redirecting..." : "Setup Stripe Connect"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Earnings Summary */}
        {earnings && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <EarningsCard
                icon={DollarSign}
                label="Available"
                value={earnings.availableBalance}
                highlight
              />
              <EarningsCard icon={TrendingUp} label="Total Earned" value={earnings.netEarnings} />
              <EarningsCard
                icon={Users}
                label="Subscribers"
                value={earnings.activeSubscribers}
                isCurrency={false}
              />
              <EarningsCard
                icon={Banknote}
                label="Monthly Recurring"
                value={earnings.monthlyRecurring}
              />
            </div>

            <Separator />

            {/* Earnings Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Earnings Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tips received</span>
                  <span className="font-medium">${(earnings.totalTips / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Content unlocks</span>
                  <span className="font-medium">${(earnings.totalUnlocks / 100).toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross earnings</span>
                  <span className="font-medium">${(earnings.grossEarnings / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform fee (10%)</span>
                  <span className="font-medium text-destructive">
                    -${(earnings.platformFee / 100).toFixed(2)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-medium">Net earnings</span>
                  <span className="font-bold text-primary">
                    ${(earnings.netEarnings / 100).toFixed(2)}
                  </span>
                </div>
                {earnings.pendingPayouts > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pending payouts</span>
                    <span className="text-warning">
                      -${(earnings.pendingPayouts / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paid out</span>
                  <span className="text-success">
                    ${(earnings.completedPayouts / 100).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Request Payout */}
            {isSetup && <RequestPayoutDialog availableBalance={earnings.availableBalance} />}
          </>
        )}

        {/* Payout History */}
        {payoutHistory && payoutHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Payout History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payoutHistory.map((payout) => (
                <PayoutHistoryItem key={payout._id} payout={payout} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

interface EarningsCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  highlight?: boolean;
  isCurrency?: boolean;
}

function EarningsCard({
  icon: Icon,
  label,
  value,
  highlight,
  isCurrency = true,
}: EarningsCardProps) {
  return (
    <Card className={cn(highlight && "border-primary/50 bg-primary/5")}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("size-4", highlight ? "text-primary" : "text-muted-foreground")} />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className={cn("text-2xl font-bold", highlight && "text-primary")}>
          {isCurrency ? `$${(value / 100).toFixed(2)}` : value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

interface RequestPayoutDialogProps {
  availableBalance: number;
}

function RequestPayoutDialog({ availableBalance }: RequestPayoutDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const requestPayout = useMutation(api.payouts.requestPayout);

  const amountCents = Math.floor(parseFloat(amount || "0") * 100);
  const isValidAmount = amountCents >= MIN_PAYOUT_CENTS && amountCents <= availableBalance;

  const handleRequest = async () => {
    if (!isValidAmount) return;

    setIsRequesting(true);
    try {
      await requestPayout({ amount: amountCents });
      toast.success("Payout requested successfully!");
      setOpen(false);
      setShowConfirm(false);
      setAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request payout");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRequestClick = () => {
    if (isValidAmount) {
      setShowConfirm(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full gap-2" size="lg" disabled={availableBalance < MIN_PAYOUT_CENTS}>
            <Banknote className="size-5" />
            Request Payout
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Payout</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-1">Available balance</p>
              <p className="text-2xl font-bold text-primary">
                ${(availableBalance / 100).toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Payout amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="amount"
                  type="number"
                  min={MIN_PAYOUT_CENTS / 100}
                  max={availableBalance / 100}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum payout: ${(MIN_PAYOUT_CENTS / 100).toFixed(2)}
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setAmount((availableBalance / 100).toFixed(2))}
            >
              Request full balance
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequestClick} disabled={!isValidAmount || isRequesting}>
              {isRequesting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                `Request $${amount || "0.00"}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payout Request</AlertDialogTitle>
            <AlertDialogDescription>
              You are requesting a payout of <strong>${amount}</strong> to your connected bank
              account. This typically takes 1-3 business days to process.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRequest} disabled={isRequesting}>
              {isRequesting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Confirm Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface PayoutHistoryItemProps {
  payout: {
    _id: string;
    amount: number;
    status: string;
    requestedAt: number;
    completedAt?: number;
    failureReason?: string;
  };
}

function PayoutHistoryItem({ payout }: PayoutHistoryItemProps) {
  const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> =
    {
      pending: { icon: Clock, color: "text-warning", label: "Pending" },
      processing: { icon: Loader2, color: "text-info", label: "Processing" },
      completed: { icon: CheckCircle2, color: "text-success", label: "Completed" },
      failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
      canceled: { icon: XCircle, color: "text-muted-foreground", label: "Canceled" },
    };

  const config = statusConfig[payout.status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-8 rounded-full flex items-center justify-center bg-muted",
            config.color
          )}
        >
          <Icon className={cn("size-4", payout.status === "processing" && "animate-spin")} />
        </div>
        <div>
          <p className="font-medium">${(payout.amount / 100).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {format(payout.requestedAt, "MMM d, yyyy")}
          </p>
        </div>
      </div>
      <div className="text-right">
        <Badge
          variant={payout.status === "completed" ? "default" : "secondary"}
          className={cn(
            payout.status === "completed" && "bg-success/10 text-success border-success/20",
            payout.status === "failed" && "bg-destructive/10 text-destructive border-destructive/20"
          )}
        >
          {config.label}
        </Badge>
        {payout.failureReason && (
          <p className="text-xs text-destructive mt-1">{payout.failureReason}</p>
        )}
      </div>
    </div>
  );
}

function PayoutSettingsSkeleton() {
  return (
    <div className="feed-container">
      <div className="p-4 border-b">
        <Skeleton className="h-7 w-40" />
      </div>

      <div className="p-4 space-y-6">
        {/* Connect Card Skeleton */}
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-40" />
          </CardContent>
        </Card>

        {/* Earnings Grid Skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Breakdown Skeleton */}
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
