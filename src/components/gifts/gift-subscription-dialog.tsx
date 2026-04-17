"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Gift, Loader2, Mail, User, Check, Sparkles, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface GiftSubscriptionDialogProps {
  creator: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
  };
  children?: React.ReactNode;
}

// Default duration options - discount calculated from tier's annual price if available
const DURATION_OPTIONS = [
  { value: 1, label: "1 Month", baseDiscount: 0 },
  { value: 3, label: "3 Months", baseDiscount: 5 },
  { value: 6, label: "6 Months", baseDiscount: 10 },
  { value: 12, label: "12 Months", baseDiscount: 15 },
];

export function GiftSubscriptionDialog({ creator, children }: GiftSubscriptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [recipientType, setRecipientType] = useState<"user" | "email">("user");
  const [recipientUsername, setRecipientUsername] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [selectedTierId, setSelectedTierId] = useState<string>("");
  const [duration, setDuration] = useState(1);
  const [giftMessage, setGiftMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createGift = useMutation(api.giftSubscriptions.create);
  const tiers = useQuery(api.subscriptions.getTiers, { creatorId: creator._id });
  const searchedUsers = useQuery(
    api.users.search,
    recipientUsername.length >= 3 ? { query: recipientUsername, limit: 5 } : "skip"
  );

  // Get the first matching user from search results
  const searchedUser = searchedUsers?.[0];
  const selectedTier = tiers?.find((t) => t._id === selectedTierId);
  const pricePerMonth = selectedTier?.priceMonthly || 0;

  // Calculate discount - use annual price if available, otherwise use base discount
  const calculatedDiscount = useMemo(() => {
    if (!selectedTier) return 0;
    const durationOption = DURATION_OPTIONS.find((d) => d.value === duration);

    // If tier has annual pricing and we're looking at 12 months, calculate real discount
    if (duration === 12 && selectedTier.priceAnnual) {
      const monthlyTotal = selectedTier.priceMonthly * 12;
      const annualSavings = monthlyTotal - selectedTier.priceAnnual;
      return Math.round((annualSavings / monthlyTotal) * 100);
    }

    // Otherwise use base discount from duration options
    return durationOption?.baseDiscount || 0;
  }, [selectedTier, duration]);

  const totalPrice = useMemo(() => {
    if (!selectedTier) return 0;

    // For 12 months, use annual price if available
    if (duration === 12 && selectedTier.priceAnnual) {
      return selectedTier.priceAnnual;
    }

    // Otherwise calculate with base discount
    return Math.round(pricePerMonth * duration * (1 - calculatedDiscount / 100));
  }, [selectedTier, duration, pricePerMonth, calculatedDiscount]);

  const handleSubmit = async () => {
    if (!selectedTierId) {
      toast.error("Please select a subscription tier");
      return;
    }

    if (recipientType === "user" && !searchedUser) {
      toast.error("Please select a valid recipient");
      return;
    }

    if (recipientType === "email" && !recipientEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createGift({
        creatorId: creator._id,
        tierId: selectedTierId as Id<"subscriptionTiers">,
        durationMonths: duration,
        recipientId: recipientType === "user" && searchedUser ? searchedUser._id : undefined,
        recipientEmail: recipientType === "email" ? recipientEmail : undefined,
        giftMessage: giftMessage.trim() || undefined,
      });

      if (result.success) {
        toast.success("Gift subscription created! Proceed to payment.");
        setOpen(false);
        // TODO: Redirect to Stripe checkout
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create gift");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {children || (
          <Button variant="outline">
            <Gift className="mr-2 h-4 w-4" />
            Gift Subscription
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Gift a Subscription
          </DialogTitle>
          <DialogDescription>Send a subscription gift to someone special</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Creator Info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <UserAvatar user={creator} className="size-12" />
            <div>
              <p className="font-medium">{creator.displayName || creator.username}</p>
              <p className="text-sm text-muted-foreground">@{creator.username}</p>
            </div>
          </div>

          {/* Recipient Type */}
          <div className="space-y-3">
            <Label>Send gift to</Label>
            <RadioGroup
              value={recipientType}
              onValueChange={(v) => setRecipientType(v as "user" | "email")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="user" id="user" />
                <Label htmlFor="user" className="flex items-center gap-1 cursor-pointer">
                  <User className="h-4 w-4" />
                  Existing User
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="email" id="email" />
                <Label htmlFor="email" className="flex items-center gap-1 cursor-pointer">
                  <Mail className="h-4 w-4" />
                  Email Address
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Recipient Input */}
          {recipientType === "user" ? (
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={recipientUsername}
                onChange={(e) => setRecipientUsername(e.target.value)}
                placeholder="@username"
              />
              {searchedUser && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-sm">
                    {searchedUser.displayName || searchedUser.username}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="friend@example.com"
              />
            </div>
          )}

          {/* Tier Selection */}
          <div className="space-y-2">
            <Label>Subscription Tier</Label>
            <Select
              value={selectedTierId}
              onValueChange={(value) => setSelectedTierId(value ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a tier" />
              </SelectTrigger>
              <SelectContent>
                {tiers?.map((tier) => (
                  <SelectItem key={tier._id} value={tier._id}>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full ring-2 ring-offset-1"
                        style={{ backgroundColor: tier.ringColor || "#FF006E" }}
                      />
                      <div className="flex items-center gap-2">
                        <Crown
                          className="h-3.5 w-3.5"
                          style={{ color: tier.ringColor || "#FF006E" }}
                        />
                        <span className="font-medium">{tier.name}</span>
                      </div>
                      <span className="ml-auto text-muted-foreground">
                        ${(tier.priceMonthly / 100).toFixed(2)}/mo
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTier?.benefits && selectedTier.benefits.length > 0 && (
              <div className="mt-2 space-y-1">
                {selectedTier.benefits.slice(0, 3).map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-green-500" />
                    <span>{benefit}</span>
                  </div>
                ))}
                {selectedTier.benefits.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{selectedTier.benefits.length - 3} more benefits
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Duration Selection */}
          <div className="space-y-2">
            <Label>Gift Duration</Label>
            <div className="grid grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((option) => {
                // Calculate discount for this duration option
                let optionDiscount = option.baseDiscount;
                if (option.value === 12 && selectedTier?.priceAnnual) {
                  const monthlyTotal = (selectedTier.priceMonthly || 0) * 12;
                  const annualSavings = monthlyTotal - selectedTier.priceAnnual;
                  optionDiscount = Math.round((annualSavings / monthlyTotal) * 100);
                }

                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={duration === option.value ? "default" : "outline"}
                    onClick={() => setDuration(option.value)}
                    className={cn(
                      "flex-col h-auto py-3 relative",
                      duration === option.value && selectedTier?.ringColor
                        ? "ring-2 ring-offset-2"
                        : ""
                    )}
                    style={
                      duration === option.value && selectedTier?.ringColor
                        ? { borderColor: selectedTier.ringColor }
                        : undefined
                    }
                  >
                    <span className="font-medium">{option.label}</span>
                    {optionDiscount > 0 && (
                      <Badge
                        variant="secondary"
                        className="mt-1 text-xs bg-green-500/10 text-green-600"
                      >
                        Save {optionDiscount}%
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Gift Message */}
          <div className="space-y-2">
            <Label>Gift Message (optional)</Label>
            <Textarea
              value={giftMessage}
              onChange={(e) => setGiftMessage(e.target.value)}
              placeholder="Write a message to include with your gift..."
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Price Summary */}
          {selectedTier && (
            <div
              className="p-4 rounded-lg space-y-2 border"
              style={{
                backgroundColor: selectedTier.ringColor
                  ? `${selectedTier.ringColor}08`
                  : "var(--primary-5)",
                borderColor: selectedTier.ringColor
                  ? `${selectedTier.ringColor}20`
                  : "var(--primary-10)",
              }}
            >
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedTier.name} × {duration} month{duration > 1 ? "s" : ""}
                </span>
                <span
                  className={calculatedDiscount > 0 ? "line-through text-muted-foreground" : ""}
                >
                  ${((pricePerMonth * duration) / 100).toFixed(2)}
                </span>
              </div>
              {calculatedDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Savings ({calculatedDiscount}%)
                  </span>
                  <span>-${((pricePerMonth * duration - totalPrice) / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-2 border-t border-border/50">
                <span>Total Gift Value</span>
                <span
                  className="flex items-center gap-1"
                  style={{ color: selectedTier.ringColor || "var(--primary)" }}
                >
                  <Crown className="h-4 w-4" />${(totalPrice / 100).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !selectedTierId}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Gift className="mr-2 h-4 w-4" />
            )}
            Continue to Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
