"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserAvatarUrl } from "@/hooks/use-user-avatar";
import { getUserBannerUrl } from "@/hooks/use-user-banner";
import { ArrowLeft, Camera, Loader2, User, AtSign, FileText, X } from "lucide-react";
import { toast } from "sonner";

export function ProfileEditContent() {
  const router = useRouter();
  const currentUser = useQuery(api.users.currentUser);
  const updateProfile = useMutation(api.users.updateProfile);
  const updateAvatar = useMutation(api.users.updateAvatar);
  const updateBanner = useMutation(api.users.updateBanner);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when user data loads
  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName || "");
      setBio(currentUser.bio || "");
    }
  }, [currentUser]);

  if (currentUser === undefined) {
    return <ProfileEditSkeleton />;
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be less than 10MB");
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be less than 10MB");
      return;
    }

    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      // R2 upload: get key and presigned URL
      const { key, url } = await generateUploadUrl();
      const result = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) {
        throw new Error("Upload failed");
      }

      return key;
    } catch (error) {
      console.error("Upload error:", error);
      return null;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Upload avatar if changed
      if (avatarFile) {
        setIsUploadingAvatar(true);
        const r2Key = await uploadFile(avatarFile);
        if (r2Key) {
          await updateAvatar({ r2Key });
        }
        setIsUploadingAvatar(false);
      }

      // Upload banner if changed
      if (bannerFile) {
        setIsUploadingBanner(true);
        const r2Key = await uploadFile(bannerFile);
        if (r2Key) {
          await updateBanner({ r2Key });
        }
        setIsUploadingBanner(false);
      }

      // Update profile text fields
      await updateProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      });

      toast.success("Profile updated!");
      router.back();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // Use proper avatar URL resolution with DiceBear fallback
  const currentAvatarUrl = avatarPreview || getUserAvatarUrl(currentUser, 128);
  // Use auto-generated DiceBear Glass banner if no custom banner
  const currentBannerUrl = bannerPreview || getUserBannerUrl(currentUser);

  return (
    <div className="feed-container pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="size-5" />
            </Button>
            <h1 className="text-lg font-semibold">Edit Profile</h1>
          </div>
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </header>

      {/* Banner */}
      <div className="relative">
        <div
          className="h-32 sm:h-40 bg-gradient-to-r from-primary/20 to-primary/5 relative cursor-pointer group"
          onClick={() => bannerInputRef.current?.click()}
        >
          {currentBannerUrl && (
            <img src={currentBannerUrl} alt="Banner" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="flex items-center gap-2 text-white">
              <Camera className="size-5" />
              <span className="text-sm font-medium">Change Banner</span>
            </div>
          </div>
          {isUploadingBanner && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Loader2 className="size-8 text-white animate-spin" />
            </div>
          )}
        </div>
        {bannerPreview && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-2 right-2 size-8 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              setBannerPreview(null);
              setBannerFile(null);
            }}
          >
            <X className="size-4" />
          </Button>
        )}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBannerSelect}
        />
      </div>

      {/* Avatar */}
      <div className="px-4 -mt-12 relative z-10">
        <div
          className="relative inline-block cursor-pointer group"
          onClick={() => avatarInputRef.current?.click()}
        >
          <Avatar className="size-24 ring-4 ring-background">
            <AvatarImage src={currentAvatarUrl || undefined} />
            <AvatarFallback className="text-3xl bg-primary/10 text-primary">
              {displayName?.[0] || currentUser?.username?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="size-6 text-white" />
          </div>
          {isUploadingAvatar && (
            <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
              <Loader2 className="size-6 text-white animate-spin" />
            </div>
          )}
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarSelect}
        />
      </div>

      {/* Form */}
      <div className="p-4 space-y-6 mt-4">
        {/* Username (read-only) */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <AtSign className="size-4 text-muted-foreground" />
            Username
          </Label>
          <Input value={currentUser?.username || ""} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">Username cannot be changed</p>
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            Display Name
          </Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground text-right">{displayName.length}/50</p>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            Bio
          </Label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself..."
            rows={4}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
        </div>
      </div>
    </div>
  );
}

function ProfileEditSkeleton() {
  return (
    <div className="feed-container">
      <header className="p-4 border-b flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-6 w-24" />
      </header>
      <Skeleton className="h-32 sm:h-40 w-full" />
      <div className="px-4 -mt-12">
        <Skeleton className="size-24 rounded-full" />
      </div>
      <div className="p-4 space-y-6 mt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
