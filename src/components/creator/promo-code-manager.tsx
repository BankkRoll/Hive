"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Ticket, Plus, Copy, Trash2, Loader2, Calendar, Percent, Users } from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PromoCodeManager() {
  const [isCreating, setIsCreating] = useState(false);

  const promoCodes = useQuery(api.promoCodes.getMyCodes, { includeExpired: true });
  const createPromoCode = useMutation(api.promoCodes.create);
  const deletePromoCode = useMutation(api.promoCodes.remove);

  if (promoCodes === undefined) {
    return <PromoCodeSkeleton />;
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Ticket className="size-5 text-primary" />
            Promo Codes
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create discount codes for your subscriptions
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              Create Code
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Promo Code</DialogTitle>
            </DialogHeader>
            <PromoCodeForm
              onSubmit={async (data) => {
                try {
                  await createPromoCode(data);
                  toast.success("Promo code created!");
                  setIsCreating(false);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to create");
                }
              }}
              onCancel={() => setIsCreating(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Promo Codes List */}
      {promoCodes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Ticket className="size-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-1">No promo codes yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Create discount codes to attract new subscribers
            </p>
            <Button onClick={() => setIsCreating(true)} className="gap-2">
              <Plus className="size-4" />
              Create Your First Code
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {promoCodes.map((code) => {
            const isExpired = code.isExpired;
            const isUsedUp = code.isExhausted;
            const isActive = code.isActive && !isExpired && !isUsedUp;

            return (
              <Card key={code._id} className={cn(!isActive && "opacity-60")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="font-mono font-bold text-lg">{code.code}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => copyCode(code.code)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        {!isActive && (
                          <Badge variant="secondary">
                            {isExpired ? "Expired" : isUsedUp ? "Used up" : "Inactive"}
                          </Badge>
                        )}
                        {isActive && (
                          <Badge className="bg-success/10 text-success border-success/20">
                            Active
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Percent className="size-4" />
                          {code.discountType === "percent"
                            ? `${code.discountValue}% off`
                            : code.discountType === "fixed"
                              ? `$${(code.discountValue / 100).toFixed(2)} off`
                              : `${code.discountValue} day trial`}
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="size-4" />
                          {code.usageCount}
                          {code.usageLimit && ` / ${code.usageLimit}`} uses
                        </div>
                        {code.expiresAt && (
                          <div className="flex items-center gap-1">
                            <Calendar className="size-4" />
                            Expires {format(code.expiresAt, "MMM d, yyyy")}
                          </div>
                        )}
                      </div>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Promo Code?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the code "{code.code}". Users who already
                            used it won't be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                              try {
                                await deletePromoCode({ promoCodeId: code._id });
                                toast.success("Promo code deleted");
                              } catch (error) {
                                toast.error("Failed to delete");
                              }
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PromoCodeFormProps {
  onSubmit: (data: {
    code: string;
    discountType: "percent" | "fixed" | "trial";
    discountValue: number;
    usageLimit?: number;
    expiresAt?: number;
  }) => Promise<void>;
  onCancel: () => void;
}

function PromoCodeForm({ onSubmit, onCancel }: PromoCodeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed" | "trial">("percent");
  const [discountValue, setDiscountValue] = useState("20");
  const [usageLimit, setUsageLimit] = useState("");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState("30");

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(result);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!code.trim()) {
      toast.error("Please enter a code");
      return;
    }

    const value = parseInt(discountValue, 10);
    if (discountType === "percent" && (isNaN(value) || value < 1 || value > 100)) {
      toast.error("Percentage discount must be between 1% and 100%");
      return;
    }
    if (discountType === "fixed" && (isNaN(value) || value < 1)) {
      toast.error("Fixed discount must be at least $1");
      return;
    }
    if (discountType === "trial" && (isNaN(value) || value < 1 || value > 30)) {
      toast.error("Trial period must be between 1 and 30 days");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: discountType === "fixed" ? value * 100 : value, // Convert dollars to cents for fixed
        usageLimit: usageLimit ? parseInt(usageLimit, 10) : undefined,
        expiresAt: hasExpiry ? addDays(new Date(), parseInt(expiryDays, 10)).getTime() : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Promo Code</Label>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SUMMER20"
            maxLength={20}
            className="font-mono uppercase"
          />
          <Button type="button" variant="outline" onClick={generateCode}>
            Generate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Discount Type</Label>
          <Select
            value={discountType}
            onValueChange={(value) =>
              setDiscountType((value ?? "percent") as "percent" | "fixed" | "trial")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percentage</SelectItem>
              <SelectItem value="fixed">Fixed Amount</SelectItem>
              <SelectItem value="trial">Free Trial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>
            {discountType === "percent"
              ? "Discount (%)"
              : discountType === "fixed"
                ? "Amount ($)"
                : "Trial Days"}
          </Label>
          <Select value={discountValue} onValueChange={(value) => setDiscountValue(value ?? "20")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {discountType === "percent"
                ? [10, 15, 20, 25, 30, 40, 50, 75, 100].map((percent) => (
                    <SelectItem key={percent} value={percent.toString()}>
                      {percent}% off
                    </SelectItem>
                  ))
                : discountType === "fixed"
                  ? [1, 2, 5, 10, 15, 20, 25, 50].map((amount) => (
                      <SelectItem key={amount} value={amount.toString()}>
                        ${amount} off
                      </SelectItem>
                    ))
                  : [3, 7, 14, 30].map((days) => (
                      <SelectItem key={days} value={days.toString()}>
                        {days} days
                      </SelectItem>
                    ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Usage Limit (optional)</Label>
        <Input
          type="number"
          min="1"
          value={usageLimit}
          onChange={(e) => setUsageLimit(e.target.value)}
          placeholder="Unlimited"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} id="has-expiry" />
          <Label htmlFor="has-expiry">Set expiration</Label>
        </div>
        {hasExpiry && (
          <Select value={expiryDays} onValueChange={(value) => setExpiryDays(value ?? "30")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Create Code"}
        </Button>
      </div>
    </form>
  );
}

function PromoCodeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <Skeleton className="h-6 w-24 mb-2" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <Skeleton className="size-9" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
