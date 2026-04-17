"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  Wallet,
  Plus,
  TrendingUp,
  Gift,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const coinPackages = [
  { coins: 200, price: 1.99, popular: false },
  { coins: 500, price: 4.99, popular: false },
  { coins: 1000, price: 9.99, popular: true },
  { coins: 2500, price: 22.99, popular: false },
  { coins: 5000, price: 44.99, popular: false },
  { coins: 10000, price: 84.99, popular: false },
];

export function WalletContent() {
  const currentUser = useQuery(api.users.currentUser);
  const transactions = useQuery(api.tips.getTransactions, { limit: 50 });

  if (currentUser === undefined) {
    return <WalletSkeleton />;
  }

  const balance = currentUser?.coinsBalance ?? 0;

  return (
    <div className="feed-container">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="p-4">
          <h1 className="text-xl font-bold">Wallet</h1>
        </div>
      </div>

      {/* Balance Card */}
      <div className="p-4">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Coins className="size-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Your Balance</p>
                  <p className="text-3xl font-bold">{balance.toLocaleString()}</p>
                </div>
              </div>
              <Button>
                <Plus className="size-4 mr-2" />
                Buy Coins
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-background/80 backdrop-blur">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-10 rounded-full bg-success/10 flex items-center justify-center">
                    <ArrowDownLeft className="size-5 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Received</p>
                    <p className="font-semibold">
                      {transactions
                        ?.filter((t) => t.amount > 0)
                        .reduce((sum, t) => sum + t.amount, 0)
                        .toLocaleString() ?? 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-background/80 backdrop-blur">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center">
                    <ArrowUpRight className="size-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sent</p>
                    <p className="font-semibold">
                      {Math.abs(
                        transactions
                          ?.filter((t) => t.amount < 0)
                          .reduce((sum, t) => sum + t.amount, 0) ?? 0
                      ).toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="buy" className="px-4">
        <TabsList className="w-full">
          <TabsTrigger value="buy" className="flex-1">
            <CreditCard className="size-4 mr-2" />
            Buy Coins
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            <History className="size-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {coinPackages.map((pkg) => (
              <Card
                key={pkg.coins}
                className={cn(
                  "cursor-pointer transition-all hover:border-primary hover:shadow-lg",
                  pkg.popular && "border-primary ring-1 ring-primary"
                )}
              >
                <CardContent className="p-4 text-center relative">
                  {pkg.popular && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px]">
                      Popular
                    </Badge>
                  )}
                  <div className="flex items-center justify-center gap-1 mb-2 mt-1">
                    <Coins className="size-5 text-warning" />
                    <span className="text-2xl font-bold">{pkg.coins}</span>
                  </div>
                  <p className="text-lg font-semibold text-primary">${pkg.price.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    ${((pkg.price / pkg.coins) * 100).toFixed(2)} per 100
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Gift className="size-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Have a promo code?</p>
                  <p className="text-sm text-muted-foreground">Redeem your code for free coins</p>
                </div>
                <Button variant="outline" size="sm">
                  Redeem
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {transactions === undefined ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <History className="size-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">No transactions yet</h3>
              <p className="text-muted-foreground text-sm">
                Your coin transactions will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <TransactionItem key={tx._id} transaction={tx} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface TransactionItemProps {
  transaction: {
    _id: string;
    type: string;
    amount: number;
    createdAt: number;
    relatedUser?: {
      username?: string;
      displayName?: string;
    } | null;
  };
}

const transactionLabels: Record<string, string> = {
  purchase: "Purchased coins",
  tip_sent: "Sent tip",
  tip_received: "Received tip",
  unlock: "Unlocked content",
  subscription: "Subscription payment",
  payout: "Payout",
  refund: "Refund",
};

function TransactionItem({ transaction }: TransactionItemProps) {
  const isPositive = transaction.amount > 0;
  const label = transactionLabels[transaction.type] ?? transaction.type;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50">
      <div
        className={cn(
          "size-10 rounded-full flex items-center justify-center",
          isPositive ? "bg-success/10" : "bg-destructive/10"
        )}
      >
        {isPositive ? (
          <ArrowDownLeft className="size-5 text-success" />
        ) : (
          <ArrowUpRight className="size-5 text-destructive" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {transaction.relatedUser && (
          <p className="text-xs text-muted-foreground truncate">
            {isPositive ? "From" : "To"} @
            {transaction.relatedUser.username || transaction.relatedUser.displayName}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(transaction.createdAt), {
            addSuffix: true,
          })}
        </p>
      </div>

      <div className={cn("font-semibold", isPositive ? "text-success" : "text-destructive")}>
        {isPositive ? "+" : ""}
        {transaction.amount.toLocaleString()}
      </div>
    </div>
  );
}

function WalletSkeleton() {
  return (
    <div className="feed-container">
      <div className="p-4">
        <Skeleton className="h-7 w-20 mb-4" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <div className="px-4">
        <Skeleton className="h-10 w-full mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
