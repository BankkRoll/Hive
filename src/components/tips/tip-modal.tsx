"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Coins, Sparkles, Loader2, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creator: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    isVerified?: boolean;
  };
  postId?: Id<"posts">;
}

const TIP_PRESETS = [
  { amount: 10, label: "10", multiplier: "1x" },
  { amount: 50, label: "50", multiplier: "5x" },
  { amount: 100, label: "100", multiplier: "10x" },
  { amount: 500, label: "500", multiplier: "50x" },
];

export function TipModal({ open, onOpenChange, creator, postId }: TipModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [isSending, setIsSending] = useState(false);

  const balance = useQuery(api.tips.getBalance);
  const sendTip = useMutation(api.tips.sendTip);

  const finalAmount = selectedAmount ?? (customAmount ? parseInt(customAmount, 10) : 0);
  const hasEnoughBalance = (balance ?? 0) >= finalAmount;
  const isValidAmount = finalAmount >= 1 && finalAmount <= 1000000;

  const handleSendTip = async () => {
    if (!isValidAmount || !hasEnoughBalance) return;

    setIsSending(true);
    try {
      await sendTip({
        creatorId: creator._id,
        postId,
        amount: finalAmount,
      });
      toast.success(`Sent ${finalAmount} coins to ${creator.displayName || creator.username}!`);
      onOpenChange(false);
      setSelectedAmount(null);
      setCustomAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send tip");
    } finally {
      setIsSending(false);
    }
  };

  const handlePresetClick = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount("");
  };

  const handleCustomChange = (value: string) => {
    const num = value.replace(/\D/g, "");
    setCustomAmount(num);
    setSelectedAmount(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <UserAvatar
                user={creator}
                className="size-20 ring-4 ring-primary/20 ring-offset-2 ring-offset-background"
              />
              <div className="absolute -bottom-1 -right-1 size-8 rounded-full bg-primary flex items-center justify-center">
                <Coins className="size-4 text-primary-foreground" />
              </div>
            </div>
          </div>
          <DialogTitle className="flex items-center justify-center gap-1.5">
            Tip {creator.displayName || creator.username}
            {creator.isVerified && <BadgeCheck className="size-5 text-primary" />}
          </DialogTitle>
          <DialogDescription>Show your support with coins</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Balance Display */}
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-muted">
            <Coins className="size-5 text-warning" />
            <span className="text-sm text-muted-foreground">Your balance:</span>
            <span className="font-bold">{(balance ?? 0).toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">coins</span>
          </div>

          {/* Preset Amounts */}
          <div className="grid grid-cols-4 gap-2">
            {TIP_PRESETS.map((preset) => (
              <button
                key={preset.amount}
                onClick={() => handlePresetClick(preset.amount)}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all",
                  "hover:border-primary hover:bg-primary/5",
                  selectedAmount === preset.amount
                    ? "border-primary bg-primary/10"
                    : "border-border"
                )}
              >
                <div className="flex items-center gap-1">
                  <Coins className="size-4 text-warning" />
                  <span className="font-bold">{preset.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{preset.multiplier}</span>
              </button>
            ))}
          </div>

          {/* Custom Amount */}
          <div className="relative">
            <Coins className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-warning" />
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => handleCustomChange(e.target.value)}
              className="pl-10 text-center text-lg font-medium h-12"
            />
          </div>

          {/* Validation Messages */}
          {finalAmount > 0 && !hasEnoughBalance && (
            <p className="text-sm text-destructive text-center">
              Insufficient balance. You need {finalAmount - (balance ?? 0)} more coins.
            </p>
          )}
          {finalAmount > 1000000 && (
            <p className="text-sm text-destructive text-center">Maximum tip is 1,000,000 coins</p>
          )}

          {/* Send Button */}
          <Button
            size="lg"
            className="w-full gap-2"
            disabled={!isValidAmount || !hasEnoughBalance || isSending}
            onClick={handleSendTip}
          >
            {isSending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Sparkles className="size-5" />
                Send {finalAmount > 0 ? finalAmount.toLocaleString() : ""} Coins
              </>
            )}
          </Button>

          {/* Buy More Link */}
          {!hasEnoughBalance && finalAmount > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                window.location.href = "/wallet";
              }}
            >
              Buy More Coins
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
