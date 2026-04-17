"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Flag,
  AlertTriangle,
  MessageSquareWarning,
  UserX,
  Scale,
  ShieldAlert,
  Copyright,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TargetType = "user" | "post" | "comment" | "message";
type ReportReason =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "violence"
  | "nudity"
  | "copyright"
  | "impersonation"
  | "other";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: TargetType;
  targetId: string;
  targetPreview?: string;
}

const REPORT_REASONS: {
  value: ReportReason;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "spam",
    label: "Spam",
    description: "Repetitive or promotional content",
    icon: AlertTriangle,
  },
  {
    value: "harassment",
    label: "Harassment",
    description: "Bullying or targeting an individual",
    icon: MessageSquareWarning,
  },
  {
    value: "hate_speech",
    label: "Hate speech",
    description: "Promotes violence against groups",
    icon: ShieldAlert,
  },
  {
    value: "violence",
    label: "Violence",
    description: "Graphic violence or threats",
    icon: Scale,
  },
  {
    value: "nudity",
    label: "Inappropriate content",
    description: "Non-consensual or illegal content",
    icon: UserX,
  },
  {
    value: "copyright",
    label: "Copyright violation",
    description: "Stolen or unauthorized content",
    icon: Copyright,
  },
  {
    value: "impersonation",
    label: "Impersonation",
    description: "Pretending to be someone else",
    icon: UserX,
  },
  {
    value: "other",
    label: "Other",
    description: "Something else not listed here",
    icon: Flag,
  },
];

export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetPreview,
}: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const submitReport = useMutation(api.reports.submit);

  const handleSubmit = async () => {
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitReport({
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined,
      });
      setIsSubmitted(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setReason(null);
      setDescription("");
      setIsSubmitted(false);
    }, 200);
  };

  const getTargetLabel = () => {
    switch (targetType) {
      case "user":
        return "user";
      case "post":
        return "post";
      case "comment":
        return "comment";
      case "message":
        return "message";
    }
  };

  if (isSubmitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="size-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="size-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Report Submitted</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Thank you for helping keep our community safe. We'll review your report and take
              appropriate action.
            </p>
            <Button onClick={handleClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="size-5 text-destructive" />
            Report {getTargetLabel()}
          </DialogTitle>
          <DialogDescription>Help us understand what's wrong with this content.</DialogDescription>
        </DialogHeader>

        {targetPreview && (
          <div className="p-3 rounded-lg bg-muted/50 border text-sm">
            <p className="text-muted-foreground line-clamp-2">{targetPreview}</p>
          </div>
        )}

        <div className="space-y-4 py-2">
          <Label>Why are you reporting this?</Label>
          <RadioGroup value={reason ?? ""} onValueChange={(v) => setReason(v as ReportReason)}>
            <div className="space-y-2">
              {REPORT_REASONS.map((item) => {
                const Icon = item.icon;
                return (
                  <label
                    key={item.value}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      reason === item.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    )}
                  >
                    <RadioGroupItem value={item.value} className="sr-only" />
                    <div
                      className={cn(
                        "size-8 rounded-full flex items-center justify-center shrink-0",
                        reason === item.value
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <div
                      className={cn(
                        "size-4 rounded-full border-2 shrink-0",
                        reason === item.value
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      )}
                    >
                      {reason === item.value && (
                        <div className="size-full rounded-full bg-primary-foreground scale-50" />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="description">Additional details (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide any additional context that might help us review this report..."
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              <>
                <Flag className="size-4 mr-2" />
                Submit Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Trigger button component for convenience
interface ReportButtonProps {
  targetType: TargetType;
  targetId: string;
  targetPreview?: string;
  variant?: "ghost" | "outline" | "destructive";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  children?: React.ReactNode;
}

export function ReportButton({
  targetType,
  targetId,
  targetPreview,
  variant = "ghost",
  size = "sm",
  className,
  children,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn("text-muted-foreground", className)}
        onClick={() => setOpen(true)}
      >
        {children ?? (
          <>
            <Flag className="size-4 mr-1" />
            Report
          </>
        )}
      </Button>
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        targetType={targetType}
        targetId={targetId}
        targetPreview={targetPreview}
      />
    </>
  );
}
