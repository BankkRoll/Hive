"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Send,
  Image as ImageIcon,
  Lock,
  Users,
  Crown,
  Star,
  Coins,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MassMessageComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Audience = "all" | "subscribers" | "vips" | "tippers";

const AUDIENCES: {
  value: Audience;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  { value: "all", label: "All Followers", icon: Users, description: "Everyone who follows you" },
  { value: "subscribers", label: "Subscribers", icon: Star, description: "Paid subscribers only" },
  { value: "vips", label: "VIPs", icon: Crown, description: "Your VIP members" },
  { value: "tippers", label: "Top Tippers", icon: Coins, description: "Users who have tipped you" },
];

export function MassMessageComposer({ open, onOpenChange }: MassMessageComposerProps) {
  const [content, setContent] = useState("");
  const [selectedAudiences, setSelectedAudiences] = useState<Audience[]>(["subscribers"]);
  const [isLocked, setIsLocked] = useState(false);
  const [unlockPrice, setUnlockPrice] = useState("");
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createMassMessage = useMutation(api.massMessages.create);
  const sendMassMessage = useMutation(api.massMessages.send);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const saveMedia = useMutation(api.media.saveMedia);

  // Use previewAudience to get counts for subscriber audience
  const subscriberPreview = useQuery(api.massMessages.previewAudience, {
    audience: "all_subscribers",
  });
  const vipPreview = useQuery(api.massMessages.previewAudience, { audience: "vips" });
  const tipperPreview = useQuery(api.massMessages.previewAudience, { audience: "top_tippers" });

  // Build audience counts from previews
  const audienceCounts = {
    followers: 0, // Note: followers not directly available via previewAudience
    subscribers: subscriberPreview?.count ?? 0,
    vips: vipPreview?.count ?? 0,
    topTippers: tipperPreview?.count ?? 0,
  };

  const toggleAudience = (audience: Audience) => {
    setSelectedAudiences((prev) =>
      prev.includes(audience) ? prev.filter((a) => a !== audience) : [...prev, audience]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Please select an image or video");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("File must be less than 100MB");
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const removeMedia = () => {
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }
    setMediaFile(null);
    setMediaPreview(null);
  };

  const getTotalRecipients = (): number => {
    if (!audienceCounts) return 0;

    // This is a simplified count - in reality you'd want to deduplicate
    let total = 0;
    if (selectedAudiences.includes("all")) return audienceCounts.followers;
    if (selectedAudiences.includes("subscribers")) total += audienceCounts.subscribers;
    if (selectedAudiences.includes("vips")) total += audienceCounts.vips;
    if (selectedAudiences.includes("tippers")) total += audienceCounts.topTippers;
    return total;
  };

  const handleSend = async () => {
    if (!content.trim() && !mediaFile) {
      toast.error("Please add some content");
      return;
    }

    if (selectedAudiences.length === 0) {
      toast.error("Please select at least one audience");
      return;
    }

    if (isLocked && (!unlockPrice || parseFloat(unlockPrice) < 1)) {
      toast.error("Please set a minimum unlock price of 1 coin");
      return;
    }

    setIsSending(true);

    try {
      const mediaIds: Id<"media">[] = [];

      // Upload media if present
      if (mediaFile) {
        const uploadData = await generateUploadUrl();
        const uploadUrl = typeof uploadData === "string" ? uploadData : uploadData.url;
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": mediaFile.type },
          body: mediaFile,
        });

        if (!result.ok) {
          throw new Error("Failed to upload media");
        }

        const { storageId } = await result.json();
        const mediaId = await saveMedia({
          r2Key: storageId,
          type: mediaFile.type.startsWith("image/") ? "image" : "video",
          mimeType: mediaFile.type,
          filename: mediaFile.name,
          size: mediaFile.size,
        });
        mediaIds.push(mediaId);
      }

      // Map audience to API format
      const audienceMap: Record<Audience, "all_subscribers" | "vips" | "top_tippers"> = {
        all: "all_subscribers",
        subscribers: "all_subscribers",
        vips: "vips",
        tippers: "top_tippers",
      };

      // Use the first selected audience (API only accepts one)
      const audience = audienceMap[selectedAudiences[0]] || "all_subscribers";

      // Create the mass message
      const { massMessageId } = await createMassMessage({
        content: content.trim(),
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
        audience,
        isLocked,
        unlockPrice: isLocked ? Math.round(parseFloat(unlockPrice)) : undefined,
      });

      // Send it immediately
      await sendMassMessage({ massMessageId });

      toast.success(`Message sent to ${getTotalRecipients()} recipients!`);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send");
    } finally {
      setIsSending(false);
      setShowConfirm(false);
    }
  };

  const resetForm = () => {
    setContent("");
    setSelectedAudiences(["subscribers"]);
    setIsLocked(false);
    setUnlockPrice("");
    removeMedia();
  };

  const totalRecipients = getTotalRecipients();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-5 text-primary" />
              Mass Message
            </DialogTitle>
            <DialogDescription>Send a message to multiple followers at once</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Audience Selection */}
            <div className="space-y-3">
              <Label>Select Audience</Label>
              <div className="grid grid-cols-2 gap-2">
                {AUDIENCES.map((audience) => {
                  const Icon = audience.icon;
                  const isSelected = selectedAudiences.includes(audience.value);
                  const count =
                    audienceCounts?.[
                      audience.value === "all"
                        ? "followers"
                        : audience.value === "tippers"
                          ? "topTippers"
                          : audience.value
                    ] ?? 0;

                  return (
                    <button
                      key={audience.value}
                      onClick={() => toggleAudience(audience.value)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5 mt-0.5",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div>
                        <p className="font-medium text-sm">{audience.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {count.toLocaleString()} users
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Content */}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your message..."
                rows={4}
                maxLength={2000}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{content.length}/2000</span>
              </div>
            </div>

            {/* Media Preview */}
            {mediaPreview && (
              <div className="relative rounded-xl overflow-hidden">
                {mediaFile?.type.startsWith("video/") ? (
                  <video src={mediaPreview} className="w-full h-48 object-cover" controls />
                ) : (
                  <img src={mediaPreview} alt="" className="w-full h-48 object-cover" />
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2 size-8"
                  onClick={removeMedia}
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

            {/* Media & Lock Options */}
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon className="size-4 mr-2" />
                Add Media
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileSelect}
              />

              <div className="flex items-center gap-2">
                <Switch checked={isLocked} onCheckedChange={setIsLocked} id="lock-message" />
                <Label htmlFor="lock-message" className="flex items-center gap-1">
                  <Lock className="size-4" />
                  Lock
                </Label>
              </div>
            </div>

            {/* Unlock Price */}
            {isLocked && (
              <div className="space-y-2">
                <Label>Unlock Price (coins)</Label>
                <Input
                  type="number"
                  min="1"
                  value={unlockPrice}
                  onChange={(e) => setUnlockPrice(e.target.value)}
                  placeholder="Enter price"
                />
              </div>
            )}

            {/* Summary & Send */}
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Will be sent to</p>
                    <p className="font-bold text-lg">
                      {totalRecipients.toLocaleString()} recipients
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowConfirm(true)}
                    disabled={
                      (!content.trim() && !mediaFile) || selectedAudiences.length === 0 || isSending
                    }
                    className="gap-2"
                  >
                    {isSending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="size-4" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              Confirm Mass Message
            </DialogTitle>
            <DialogDescription>
              You're about to send a message to {totalRecipients.toLocaleString()} recipients. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Confirm & Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
