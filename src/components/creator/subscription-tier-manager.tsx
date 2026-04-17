"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  Star,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  GripVertical,
  Users,
  DollarSign,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Tier {
  _id: Id<"subscriptionTiers">;
  name: string;
  description?: string;
  priceMonthly: number;
  priceAnnual?: number;
  ringColor?: string;
  subscriberLimit?: number;
  benefits?: string[];
  order: number;
  isActive: boolean;
  currentSubscribers?: number;
}

const DEFAULT_COLORS = [
  "#ff006e", // Pink
  "#8338ec", // Purple
  "#3b82f6", // Blue
  "#10b981", // Green
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ffd700", // Gold
];

export function SubscriptionTierManager() {
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const tiers = useQuery(api.subscriptions.getMyTiers);
  const createTier = useMutation(api.subscriptions.createTier);
  const updateTier = useMutation(api.subscriptions.updateTier);
  const deleteTier = useMutation(api.subscriptions.deleteTier);

  if (tiers === undefined) {
    return <TierManagerSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Crown className="size-5 text-primary" />
            Subscription Tiers
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage your subscription tiers
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" />
              Add Tier
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Subscription Tier</DialogTitle>
            </DialogHeader>
            <TierForm
              onSubmit={async (data) => {
                try {
                  await createTier(data);
                  toast.success("Tier created!");
                  setIsCreating(false);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to create tier");
                }
              }}
              onCancel={() => setIsCreating(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Tiers List */}
      {tiers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Star className="size-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">No tiers yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Create subscription tiers to start earning from your content
            </p>
            <Button onClick={() => setIsCreating(true)} className="gap-2">
              <Plus className="size-4" />
              Create Your First Tier
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tiers.map((tier, index) => (
            <Card
              key={tier._id}
              className={cn(
                "relative overflow-hidden transition-all",
                !tier.isActive && "opacity-60"
              )}
            >
              {/* Color indicator */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: tier.ringColor }}
              />

              <CardContent className="p-4 pl-5">
                <div className="flex items-start gap-4">
                  <div className="hidden sm:block cursor-grab text-muted-foreground">
                    <GripVertical className="size-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{tier.name}</h3>
                      <div
                        className="size-4 rounded-full ring-2 ring-offset-2 ring-offset-background"
                        style={{
                          backgroundColor: tier.ringColor,
                          ["--tw-ring-color" as string]: tier.ringColor,
                        }}
                      />
                      {!tier.isActive && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">Inactive</span>
                      )}
                    </div>
                    {tier.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {tier.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="size-4 text-success" />
                        <span className="font-medium">
                          ${(tier.priceMonthly / 100).toFixed(2)}/mo
                        </span>
                        {tier.priceAnnual && (
                          <span className="text-muted-foreground">
                            (${(tier.priceAnnual / 100 / 12).toFixed(2)}/mo annually)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="size-4" />
                        <span>
                          {tier.currentSubscribers ?? 0}
                          {tier.subscriberLimit && ` / ${tier.subscriberLimit}`} subscribers
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Dialog
                      open={editingTier?._id === tier._id}
                      onOpenChange={(open) => !open && setEditingTier(null)}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setEditingTier({
                              _id: tier._id,
                              name: tier.name,
                              description: tier.description,
                              priceMonthly: tier.priceMonthly,
                              priceAnnual: tier.priceAnnual,
                              ringColor: tier.ringColor,
                              subscriberLimit: tier.subscriberLimit,
                              benefits: tier.benefits,
                              order: tier.order,
                              isActive: tier.isActive,
                              currentSubscribers: tier.currentSubscribers,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Edit Tier</DialogTitle>
                        </DialogHeader>
                        {editingTier && (
                          <TierForm
                            initialData={editingTier}
                            onSubmit={async (data) => {
                              try {
                                await updateTier({
                                  tierId: editingTier._id,
                                  ...data,
                                });
                                toast.success("Tier updated!");
                                setEditingTier(null);
                              } catch (error) {
                                toast.error(
                                  error instanceof Error ? error.message : "Failed to update"
                                );
                              }
                            }}
                            onCancel={() => setEditingTier(null)}
                          />
                        )}
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Tier?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the "{tier.name}" tier. Existing
                            subscribers will be notified.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                              try {
                                await deleteTier({ tierId: tier._id });
                                toast.success("Tier deleted");
                              } catch (error) {
                                toast.error("Failed to delete tier");
                              }
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface TierFormProps {
  initialData?: Partial<Tier>;
  onSubmit: (data: {
    name: string;
    description?: string;
    priceMonthly: number;
    priceAnnual?: number;
    ringColor: string;
    subscriberLimit?: number;
    benefits: string[];
    isActive: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}

function TierForm({ initialData, onSubmit, onCancel }: TierFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [priceMonthly, setPriceMonthly] = useState(
    initialData?.priceMonthly ? (initialData.priceMonthly / 100).toString() : ""
  );
  const [priceAnnual, setPriceAnnual] = useState(
    initialData?.priceAnnual ? (initialData.priceAnnual / 100).toString() : ""
  );
  const [ringColor, setRingColor] = useState(initialData?.ringColor ?? "#ff006e");
  const [subscriberLimit, setSubscriberLimit] = useState(
    initialData?.subscriberLimit?.toString() ?? ""
  );
  const [benefits, setBenefits] = useState(initialData?.benefits?.join("\n") ?? "");
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a tier name");
      return;
    }

    const monthlyPrice = parseFloat(priceMonthly);
    if (isNaN(monthlyPrice) || monthlyPrice < 1) {
      toast.error("Monthly price must be at least $1");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        priceMonthly: Math.round(monthlyPrice * 100),
        priceAnnual: priceAnnual ? Math.round(parseFloat(priceAnnual) * 100) : undefined,
        ringColor,
        subscriberLimit: subscriberLimit ? parseInt(subscriberLimit, 10) : undefined,
        benefits: benefits
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean),
        isActive,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Tier Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Supporter, Premium, VIP"
          maxLength={50}
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what subscribers get..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Monthly Price ($)</Label>
          <Input
            type="number"
            min="1"
            step="0.01"
            value={priceMonthly}
            onChange={(e) => setPriceMonthly(e.target.value)}
            placeholder="9.99"
          />
        </div>
        <div className="space-y-2">
          <Label>Annual Price ($) (optional)</Label>
          <Input
            type="number"
            min="1"
            step="0.01"
            value={priceAnnual}
            onChange={(e) => setPriceAnnual(e.target.value)}
            placeholder="99.99"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Palette className="size-4" />
          Ring Color
        </Label>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {DEFAULT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setRingColor(color)}
                className={cn(
                  "size-8 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                  ringColor === color ? "ring-foreground scale-110" : "ring-transparent"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <Input
            type="color"
            value={ringColor}
            onChange={(e) => setRingColor(e.target.value)}
            className="w-12 h-8 p-0 border-0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Subscriber Limit (optional)</Label>
        <Input
          type="number"
          min="1"
          value={subscriberLimit}
          onChange={(e) => setSubscriberLimit(e.target.value)}
          placeholder="Leave empty for unlimited"
        />
      </div>

      <div className="space-y-2">
        <Label>Benefits (one per line)</Label>
        <Textarea
          value={benefits}
          onChange={(e) => setBenefits(e.target.value)}
          placeholder="Access to exclusive posts&#10;Custom emotes&#10;DM access"
          rows={4}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} id="tier-active" />
          <Label htmlFor="tier-active">Active</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : initialData ? (
            "Save Changes"
          ) : (
            "Create Tier"
          )}
        </Button>
      </div>
    </form>
  );
}

function TierManagerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="size-5" />
              <div className="flex-1">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="size-9" />
              <Skeleton className="size-9" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
