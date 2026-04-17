"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Link,
  FileText,
  Calendar,
  Users,
  Shield,
  Loader2,
  ExternalLink,
  Tag,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface VerificationRequest {
  _id: Id<"verificationRequests">;
  userId: Id<"users">;
  status: "pending" | "approved" | "rejected";
  displayName?: string;
  category?: string;
  socialLinks?: string[];
  followerCount?: number;
  additionalNotes?: string;
  rejectionReason?: string;
  reviewedBy?: Id<"users">;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
  user?: {
    _id: Id<"users">;
    username?: string;
    displayName?: string;
    avatarR2Key?: string;
    email?: string;
    bio?: string;
    createdAt?: number;
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  content_creator: "Content Creator",
  artist: "Artist / Designer",
  musician: "Musician / Producer",
  fitness: "Fitness / Wellness",
  gamer: "Gamer / Streamer",
  educator: "Educator / Coach",
  influencer: "Influencer",
  business: "Business / Brand",
  other: "Other",
};

function VerificationRequestCard({
  request,
  onSelect,
}: {
  request: VerificationRequest;
  onSelect: (request: VerificationRequest) => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onSelect(request)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <UserAvatar user={request.user} className="size-12" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold truncate">
                {request.user?.displayName || request.user?.username || "Unknown"}
              </h4>
              <Badge variant="outline" className="shrink-0">
                @{request.user?.username || "unknown"}
              </Badge>
            </div>

            {request.category && (
              <p className="text-sm text-muted-foreground">
                {CATEGORY_LABELS[request.category] || request.category}
              </p>
            )}

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(request.createdAt, { addSuffix: true })}
              </span>
              {request.followerCount && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {request.followerCount.toLocaleString()} followers
                </span>
              )}
              {request.socialLinks && request.socialLinks.length > 0 && (
                <span className="flex items-center gap-1">
                  <Link className="h-3 w-3" />
                  {request.socialLinks.length} links
                </span>
              )}
            </div>
          </div>

          <Badge
            variant={
              request.status === "pending"
                ? "secondary"
                : request.status === "approved"
                  ? "default"
                  : "destructive"
            }
          >
            {request.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function RequestDetailDialog({
  request,
  open,
  onOpenChange,
  onApprove,
  onReject,
}: {
  request: VerificationRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (requestId: Id<"verificationRequests">) => void;
  onReject: (requestId: Id<"verificationRequests">, reason: string) => void;
}) {
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!request) return null;

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove(request._id);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setIsSubmitting(true);
    try {
      await onReject(request._id, rejectReason);
      setShowRejectDialog(false);
      setRejectReason("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Verification Request
            </DialogTitle>
            <DialogDescription>Review the social presence and verify the creator</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 pb-4">
              {/* User Info */}
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                <UserAvatar user={request.user} className="size-16" />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {request.user?.displayName || request.user?.username}
                  </h3>
                  <p className="text-sm text-muted-foreground">@{request.user?.username}</p>
                  {request.user?.email && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Mail className="h-3 w-3" />
                      {request.user.email}
                    </p>
                  )}
                  {request.user?.bio && (
                    <p className="text-sm mt-2 line-clamp-2">{request.user.bio}</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Category */}
              {request.category && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Category
                  </Label>
                  <Badge variant="outline" className="text-sm">
                    {CATEGORY_LABELS[request.category] || request.category}
                  </Badge>
                </div>
              )}

              {/* Display Name */}
              {request.displayName && (
                <div className="space-y-2">
                  <Label>Preferred Display Name</Label>
                  <p className="font-medium">{request.displayName}</p>
                </div>
              )}

              {/* Social Links */}
              {request.socialLinks && request.socialLinks.length > 0 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    Social Media Links
                  </Label>
                  <div className="space-y-2">
                    {request.socialLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:underline p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {link}
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click links to verify ownership and follower counts
                  </p>
                </div>
              )}

              {/* Follower Count */}
              {request.followerCount && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Claimed Total Following
                  </Label>
                  <p className="text-2xl font-bold">{request.followerCount.toLocaleString()}</p>
                </div>
              )}

              {/* Additional Notes */}
              {request.additionalNotes && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Additional Information
                  </Label>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                    {request.additionalNotes}
                  </p>
                </div>
              )}

              {/* Request Meta */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground pt-4 border-t">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Submitted {formatDistanceToNow(request.createdAt, { addSuffix: true })}
                </span>
              </div>
            </div>
          </ScrollArea>

          {request.status === "pending" && (
            <DialogFooter className="border-t pt-4">
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
                disabled={isSubmitting}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button onClick={handleApprove} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Verification Request</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this verification request. This will be sent to
              the user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            <Label>Rejection Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Could not verify social media ownership, insufficient following, etc."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={isSubmitting || !rejectReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function VerificationQueue() {
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);

  const pendingRequests = useQuery(api.verification.listPending, { limit: 50 });
  const stats = useQuery(api.verification.getStats);
  const approveRequest = useMutation(api.verification.approve);
  const rejectRequest = useMutation(api.verification.reject);

  const handleApprove = async (requestId: Id<"verificationRequests">) => {
    try {
      await approveRequest({ requestId });
      toast.success("Verification request approved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve");
    }
  };

  const handleReject = async (requestId: Id<"verificationRequests">, reason: string) => {
    try {
      await rejectRequest({ requestId, reason });
      toast.success("Verification request rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject");
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.rejected}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Queue */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Requests</CardTitle>
          <CardDescription>Review social presence and verify creators</CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingRequests ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingRequests.requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="font-semibold text-lg">All caught up!</h3>
              <p className="text-sm text-muted-foreground">No pending verification requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.requests.map((request) => (
                <VerificationRequestCard
                  key={request._id}
                  request={request as VerificationRequest}
                  onSelect={(r) => setSelectedRequest(r)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <RequestDetailDialog
        request={selectedRequest}
        open={!!selectedRequest}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
}
