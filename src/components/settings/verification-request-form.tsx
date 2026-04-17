"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import {
  BadgeCheck,
  Clock,
  XCircle,
  Loader2,
  Link as LinkIcon,
  Users,
  Sparkles,
  Plus,
  X,
} from "lucide-react";

const CATEGORIES = [
  { value: "content_creator", label: "Content Creator" },
  { value: "artist", label: "Artist / Designer" },
  { value: "musician", label: "Musician / Producer" },
  { value: "fitness", label: "Fitness / Wellness" },
  { value: "gamer", label: "Gamer / Streamer" },
  { value: "educator", label: "Educator / Coach" },
  { value: "influencer", label: "Influencer" },
  { value: "business", label: "Business / Brand" },
  { value: "other", label: "Other" },
];

export function VerificationRequestForm() {
  const request = useQuery(api.verification.getMyRequest);
  const submit = useMutation(api.verification.submit);
  const cancel = useMutation(api.verification.cancel);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState("");
  const [socialLinks, setSocialLinks] = useState<string[]>([""]);
  const [followerCount, setFollowerCount] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const addSocialLink = () => {
    if (socialLinks.length < 5) {
      setSocialLinks([...socialLinks, ""]);
    }
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const updateSocialLink = (index: number, value: string) => {
    const updated = [...socialLinks];
    updated[index] = value;
    setSocialLinks(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validLinks = socialLinks.filter((link) => link.trim());
    if (validLinks.length === 0) {
      toast.error("Please provide at least one social media link");
      return;
    }

    setIsSubmitting(true);
    try {
      await submit({
        displayName: displayName.trim() || undefined,
        category: category || undefined,
        socialLinks: validLinks,
        followerCount: followerCount ? parseInt(followerCount) : undefined,
        additionalNotes: additionalNotes.trim() || undefined,
      });

      toast.success("Verification request submitted!");
      setDisplayName("");
      setCategory("");
      setSocialLinks([""]);
      setFollowerCount("");
      setAdditionalNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancel();
      toast.success("Request cancelled");
    } catch (error) {
      toast.error("Failed to cancel request");
    }
  };

  // Loading state
  if (request === undefined) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Verification"
          description="Request verification for your account"
          backHref="/settings"
        />
        <div className="p-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show status if there's an existing request
  if (request) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Verification"
          description="Request verification for your account"
          backHref="/settings"
        />
        <div className="p-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Verification Status
                {request.status === "pending" && (
                  <Badge variant="secondary">
                    <Clock className="mr-1 h-3 w-3" />
                    Pending Review
                  </Badge>
                )}
                {request.status === "approved" && (
                  <Badge className="bg-green-500">
                    <BadgeCheck className="mr-1 h-3 w-3" />
                    Verified
                  </Badge>
                )}
                {request.status === "rejected" && (
                  <Badge variant="destructive">
                    <XCircle className="mr-1 h-3 w-3" />
                    Not Approved
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.status === "pending" && (
                <>
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-muted-foreground">
                      Your verification request is being reviewed by our team. This typically takes
                      1-3 business days. We&apos;ll notify you once a decision has been made.
                    </p>
                  </div>
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel Request
                  </Button>
                </>
              )}
              {request.status === "approved" && (
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="flex items-center gap-2 text-green-600 font-medium">
                    <Sparkles className="h-4 w-4" />
                    Congratulations! Your account has been verified.
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your verified badge is now visible on your profile.
                  </p>
                </div>
              )}
              {request.status === "rejected" && (
                <>
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-muted-foreground">
                      Your verification request was not approved.
                    </p>
                    {request.rejectionReason && (
                      <p className="text-sm mt-2">
                        <strong>Reason:</strong> {request.rejectionReason}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You can submit a new request after addressing any issues mentioned above.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <PageHeader
        title="Verification"
        description="Request verification for your account"
        backHref="/settings"
      />
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              Request Verification
            </CardTitle>
            <CardDescription>
              Get a verified badge to show your audience you&apos;re authentic. Verification is
              based on your social presence and audience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name (optional)</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How you want to be known"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label>Creator Category</Label>
                <Select value={category} onValueChange={(value) => setCategory(value ?? "other")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Social Links */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Social Media Links *
                </Label>
                <p className="text-xs text-muted-foreground">
                  Add links to your social media profiles. We&apos;ll use these to verify your
                  identity.
                </p>
                <div className="space-y-2">
                  {socialLinks.map((link, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={link}
                        onChange={(e) => updateSocialLink(index, e.target.value)}
                        placeholder="https://twitter.com/yourhandle"
                        type="url"
                      />
                      {socialLinks.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSocialLink(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {socialLinks.length < 5 && (
                  <Button type="button" variant="outline" size="sm" onClick={addSocialLink}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Another Link
                  </Button>
                )}
              </div>

              {/* Follower Count */}
              <div className="space-y-2">
                <Label htmlFor="followerCount" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Total Social Following
                </Label>
                <Input
                  id="followerCount"
                  type="number"
                  value={followerCount}
                  onChange={(e) => setFollowerCount(e.target.value)}
                  placeholder="Combined followers across all platforms"
                />
                <p className="text-xs text-muted-foreground">This helps us understand your reach</p>
              </div>

              {/* Additional Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Information</Label>
                <Textarea
                  id="notes"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Anything else you'd like us to know about your creator journey..."
                  rows={3}
                />
              </div>

              {/* Submit */}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <BadgeCheck className="mr-2 h-4 w-4" />
                    Submit Verification Request
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By submitting, you confirm that the information provided is accurate and that you
                own the social media accounts linked.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
