"use client";

import * as z from "zod";

import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Check, ChevronDown, Gift, Link2, RefreshCw, Sparkles, X } from "lucide-react";
import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import {
  generateAvatarUrl,
  generateRandomSeed,
  getRandomBgColor,
  getRandomEyes,
  getRandomMouth,
  AVATAR_BG_COLORS,
  AVATAR_EYES,
  AVATAR_MOUTHS,
  EYES_LABELS,
  MOUTH_LABELS,
  type AvatarBgColor,
  type AvatarEyes,
  type AvatarMouth,
} from "@/lib/avatar";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { HiveLogo } from "@/components/logos/hive-logo";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";

// ============================================
// CONTEXT
// ============================================

interface OnboardingContextType {
  needsOnboarding: boolean;
}

const OnboardingContext = createContext<OnboardingContextType>({
  needsOnboarding: false,
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

// ============================================
// PROVIDER
// ============================================

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const searchParams = useSearchParams();

  const referrerUsernameFromUrl = searchParams.get("ref") || undefined;
  const user = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");

  const needsOnboarding = isAuthenticated && user !== undefined && !user?.username;

  const isOpen = !authLoading && needsOnboarding;

  return (
    <OnboardingContext.Provider value={{ needsOnboarding }}>
      {children}
      <OnboardingDialog isOpen={isOpen} referrerUsername={referrerUsernameFromUrl} />
    </OnboardingContext.Provider>
  );
}

// ============================================
// AVATAR STATE HOOK
// ============================================

function useAvatarState() {
  const [seed, setSeed] = useState(() => generateRandomSeed());
  const [bgColor, setBgColor] = useState<AvatarBgColor>(() => getRandomBgColor());
  const [eyes, setEyes] = useState<AvatarEyes | undefined>(undefined);
  const [mouth, setMouth] = useState<AvatarMouth | undefined>(undefined);

  const url = generateAvatarUrl({
    seed,
    backgroundColor: bgColor,
    eyes,
    mouth,
    size: 128,
  });

  const shuffle = () => setSeed(generateRandomSeed());

  const randomizeAll = () => {
    setSeed(generateRandomSeed());
    setBgColor(getRandomBgColor());
    setEyes(getRandomEyes());
    setMouth(getRandomMouth());
  };

  return {
    seed,
    bgColor,
    eyes,
    mouth,
    url,
    setBgColor,
    setEyes,
    setMouth,
    shuffle,
    randomizeAll,
  };
}

// ============================================
// AVATAR CUSTOMIZER COMPONENT
// ============================================

interface AvatarCustomizerProps {
  avatarUrl: string;
  bgColor: AvatarBgColor;
  eyes: AvatarEyes | undefined;
  mouth: AvatarMouth | undefined;
  onBgColorChange: (color: AvatarBgColor) => void;
  onEyesChange: (eyes: AvatarEyes | undefined) => void;
  onMouthChange: (mouth: AvatarMouth | undefined) => void;
  onRandomize: () => void;
  onShuffle: () => void;
}

function AvatarCustomizer({
  avatarUrl,
  bgColor,
  eyes,
  mouth,
  onBgColorChange,
  onEyesChange,
  onMouthChange,
  onRandomize,
  onShuffle,
}: AvatarCustomizerProps) {
  const [showCustomize, setShowCustomize] = useState(false);

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Avatar</label>
      <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
        {/* Avatar preview + actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          <img
            src={avatarUrl}
            alt="Avatar"
            className="size-14 sm:size-16 rounded-full ring-2 ring-border shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRandomize}
                className="text-xs bg-primary text-primary-foreground px-2.5 sm:px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
              >
                <Sparkles className="size-3" />
                <span className="hidden sm:inline">Randomize</span>
                <span className="sm:hidden">Random</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCustomize(!showCustomize)}
                className="text-xs bg-muted hover:bg-muted/80 px-2.5 sm:px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 transition-colors"
              >
                Customize
                <ChevronDown
                  className={`size-3 transition-transform duration-200 ${showCustomize ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Expandable customization */}
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: showCustomize ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-border/50 space-y-3 sm:space-y-4">
              {/* Background */}
              <ColorPicker
                label="Background"
                colors={AVATAR_BG_COLORS}
                selected={bgColor}
                onSelect={onBgColorChange}
              />

              {/* Eyes */}
              <OptionPicker
                label="Eyes"
                options={AVATAR_EYES.slice(0, 8)}
                labels={EYES_LABELS}
                selected={eyes}
                onSelect={onEyesChange}
              />

              {/* Mouth */}
              <OptionPicker
                label="Mouth"
                options={AVATAR_MOUTHS.slice(0, 8)}
                labels={MOUTH_LABELS}
                selected={mouth}
                onSelect={onMouthChange}
              />

              {/* Shuffle */}
              <button
                type="button"
                onClick={onShuffle}
                className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-2 border border-dashed border-border rounded-lg transition-colors"
              >
                <RefreshCw className="size-3" />
                Shuffle face
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// COLOR PICKER COMPONENT
// ============================================

interface ColorPickerProps {
  label: string;
  colors: readonly string[];
  selected: string;
  onSelect: (color: AvatarBgColor) => void;
}

function ColorPicker({ label, colors, selected, onSelect }: ColorPickerProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onSelect(color as AvatarBgColor)}
            className={`size-6 sm:size-7 rounded-full transition-all ${
              selected === color
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110"
                : "hover:scale-105 ring-1 ring-border"
            }`}
            style={{ backgroundColor: `#${color}` }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// OPTION PICKER COMPONENT
// ============================================

interface OptionPickerProps<T extends string> {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: T | undefined;
  onSelect: (option: T | undefined) => void;
}

function OptionPicker<T extends string>({
  label,
  options,
  labels,
  selected,
  onSelect,
}: OptionPickerProps<T>) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          className={`text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-full transition-colors ${
            !selected ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
          }`}
        >
          Auto
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-full transition-colors ${
              selected === option
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// PROFILE PREVIEW COMPONENT
// ============================================

interface ProfilePreviewProps {
  avatarUrl: string;
  displayName: string;
  username: string;
}

function ProfilePreview({ avatarUrl, displayName, username }: ProfilePreviewProps) {
  const host = typeof window !== "undefined" ? window.location.host : "";
  const name = displayName || username || "Your Name";
  const handle = username ? username.toLowerCase() : "username";

  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/50 to-muted/30 p-3 sm:p-4">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2 sm:mb-3">
        Preview
      </p>
      <div className="flex items-center gap-2.5 sm:gap-3">
        <img src={avatarUrl} alt="" className="size-10 sm:size-11 rounded-full shrink-0" />
        <div className="min-w-0 flex-1">
          <p
            className={`font-semibold truncate text-sm sm:text-base ${!displayName && !username ? "text-muted-foreground" : ""}`}
          >
            {name}
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">@{handle}</p>
        </div>
      </div>
      <div className="flex items-center text-[11px] sm:text-xs text-muted-foreground mt-2.5 sm:mt-3 pt-2.5 sm:pt-3 border-t border-border/30">
        <Link2 className="size-3 sm:size-3.5 mr-1 sm:mr-1.5 shrink-0" />
        <span className="truncate">
          {host}/<span className="text-foreground font-bold">@{handle}</span>
        </span>
      </div>
    </div>
  );
}

// ============================================
// REFERRAL BANNER COMPONENT
// ============================================

interface ReferralBannerProps {
  referrer: { displayName?: string; username?: string } | undefined;
  isValid: boolean;
}

function ReferralBanner({ referrer, isValid }: ReferralBannerProps) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out"
      style={{ gridTemplateRows: isValid ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <div className="mb-4 sm:mb-5 p-2.5 sm:p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-2.5 sm:gap-3">
          <Gift className="size-4 sm:size-5 text-primary shrink-0" />
          <p className="text-xs sm:text-sm">
            <span className="font-medium">{referrer?.displayName || referrer?.username}</span>
            <span className="text-muted-foreground"> invited you</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// USERNAME INPUT COMPONENT
// ============================================

interface UsernameInputProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  error?: string;
  username: string;
  isAvailable: boolean | undefined;
}

function UsernameInput({ register, error, username, isAvailable }: UsernameInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Username</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
          @
        </span>
        <Input
          {...register("username")}
          placeholder="username"
          className="h-10 sm:h-11 pl-7 sm:pl-8 text-sm"
          autoComplete="username"
        />
      </div>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : username.length >= 3 && isAvailable !== undefined ? (
        <p
          className={`text-xs flex items-center gap-1 ${isAvailable ? "text-green-500" : "text-destructive"}`}
        >
          {isAvailable ? (
            <>
              <Check className="size-3" /> Available
            </>
          ) : (
            <>
              <X className="size-3" /> Taken
            </>
          )}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Your unique @handle</p>
      )}
    </div>
  );
}

// ============================================
// SCHEMA
// ============================================

const usernameSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be 20 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores"),
  displayName: z.string().max(50, "Display name must be 50 characters or less").optional(),
});

// ============================================
// ONBOARDING DIALOG
// ============================================

interface OnboardingDialogProps {
  isOpen: boolean;
  referrerUsername?: string;
}

function OnboardingDialog({ isOpen, referrerUsername }: OnboardingDialogProps) {
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const [storedReferrerUsername, setStoredReferrerUsername] = useState<string | undefined>(
    undefined
  );

  // Avatar state
  const avatar = useAvatarState();

  // Referrer handling
  useEffect(() => {
    if (referrerUsername) {
      setStoredReferrerUsername(referrerUsername);
      localStorage.setItem("hive_referrer_username", referrerUsername);
    } else {
      const stored = localStorage.getItem("hive_referrer_username");
      if (stored) setStoredReferrerUsername(stored);
    }
  }, [referrerUsername]);

  const referrerValidation = useQuery(
    api.referrals.validateCode,
    storedReferrerUsername ? { code: storedReferrerUsername } : "skip"
  );

  const form = useForm<z.infer<typeof usernameSchema>>({
    resolver: zodResolver(usernameSchema),
    defaultValues: { username: "", displayName: "" },
  });

  const username = form.watch("username");
  const displayName = form.watch("displayName");
  const usernameAvailable = useQuery(
    api.users.isUsernameAvailable,
    username.length >= 3 ? { username } : "skip"
  );

  const handleSubmit = async (data: z.infer<typeof usernameSchema>) => {
    try {
      await completeOnboarding({
        username: data.username,
        displayName: data.displayName || undefined,
        referrerUsername: referrerValidation?.referrer?.username,
        dicebearSeed: avatar.seed,
        dicebearBgColor: avatar.bgColor,
        dicebearEyes: avatar.eyes,
        dicebearMouth: avatar.mouth,
      });

      localStorage.removeItem("hive_referrer_username");
      toast.success("Welcome to Hive!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete profile");
    }
  };

  const isSubmitting = form.formState.isSubmitting;
  const hasValidReferral = referrerValidation?.valid && referrerValidation.referrer;

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md p-0 overflow-hidden max-h-[90vh] rounded-xl">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-4 sm:p-6 pt-6 sm:pt-8">
            {/* Header - Centered like auth dialog */}
            <div className="flex flex-col items-center text-center mb-5 sm:mb-6">
              <p className="text-primary text-sm sm:text-base font-medium mb-1.5 sm:mb-2">
                Create your
              </p>
              <HiveLogo className="h-10 sm:h-12 w-auto text-primary mb-2 sm:mb-3" />
              <p className="text-muted-foreground text-xs sm:text-sm">
                One last step to get started
              </p>
            </div>

            {/* Referral Banner */}
            <ReferralBanner referrer={referrerValidation?.referrer} isValid={!!hasValidReferral} />

            {/* Form */}
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 sm:space-y-5">
              {/* 1. Display Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Display name</label>
                <Input
                  {...form.register("displayName")}
                  placeholder="How you want to be known"
                  className="h-10 sm:h-11 text-sm"
                />
                {form.formState.errors.displayName && (
                  <p className="text-destructive text-xs">
                    {form.formState.errors.displayName.message}
                  </p>
                )}
              </div>

              {/* 2. Username */}
              <UsernameInput
                register={form.register}
                error={form.formState.errors.username?.message}
                username={username}
                isAvailable={usernameAvailable}
              />

              {/* 3. Avatar */}
              <AvatarCustomizer
                avatarUrl={avatar.url}
                bgColor={avatar.bgColor}
                eyes={avatar.eyes}
                mouth={avatar.mouth}
                onBgColorChange={avatar.setBgColor}
                onEyesChange={avatar.setEyes}
                onMouthChange={avatar.setMouth}
                onRandomize={avatar.randomizeAll}
                onShuffle={avatar.shuffle}
              />

              {/* 4. Preview */}
              <ProfilePreview
                avatarUrl={avatar.url}
                displayName={displayName || ""}
                username={username}
              />

              {/* 5. Submit */}
              <Button
                type="submit"
                className="w-full h-10 sm:h-11 font-semibold text-sm sm:text-base"
                disabled={isSubmitting || !username || (username.length >= 3 && !usernameAvailable)}
              >
                {isSubmitting ? <Spinner className="size-4 sm:size-5" /> : "Complete Profile"}
              </Button>
            </form>
          </div>
        </ScrollArea>
      </AlertDialogContent>
    </AlertDialog>
  );
}
