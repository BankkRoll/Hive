"use client";

import * as z from "zod";

import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { HiveLogo } from "@/components/logos/hive-logo";
import { Input } from "@/components/ui/input";
import { KickIcon } from "@/components/logos/kick-icon";
import { Spinner } from "@/components/ui/spinner";
import { TwitchIcon } from "@/components/logos/twitch-icon";
import { api } from "../../../convex/_generated/api";
import { authParser } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthActions } from "@convex-dev/auth/react";
import { useForm } from "react-hook-form";
import { useQueryState } from "nuqs";
import { zodResolver } from "@hookform/resolvers/zod";

// ============================================
// CONTEXT
// ============================================

interface AuthDialogContextType {
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
}

const AuthDialogContext = createContext<AuthDialogContextType | null>(null);

export function useAuthDialog() {
  const context = useContext(AuthDialogContext);
  if (!context) {
    throw new Error("useAuthDialog must be used within AuthDialogProvider");
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  // Use history: 'replace' to avoid middleware re-adding ?auth on back button
  // This prevents the dialog from flashing on navigation
  const [authMode, setAuthMode] = useQueryState(
    "auth",
    authParser.withOptions({ history: "replace" })
  );
  const { isAuthenticated, isLoading } = useConvexAuth();

  // Close dialog when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && authMode) {
      setAuthMode(null);
    }
  }, [isAuthenticated, authMode, setAuthMode]);

  const openAuthDialog = useCallback(() => {
    setAuthMode("sign-in");
  }, [setAuthMode]);

  const closeAuthDialog = useCallback(async () => {
    // Simply clear the auth param - user is already on home (middleware handles redirect)
    await setAuthMode(null);
  }, [setAuthMode]);

  // Always render dialog to avoid hydration mismatch
  // Pass isLoading to dialog so it can show loading state internally
  const isOpen = !isLoading && authMode !== null;

  return (
    <AuthDialogContext.Provider value={{ openAuthDialog, closeAuthDialog }}>
      {children}
      <AuthDialog isOpen={isOpen} onClose={closeAuthDialog} />
    </AuthDialogContext.Provider>
  );
}

// ============================================
// AUTH DIALOG
// ============================================

type AuthStep = "initial" | "password";

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signUpPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
});

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function AuthDialog({ isOpen, onClose }: AuthDialogProps) {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<AuthStep>("initial");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null);

  // Check if email exists
  const emailExists = useQuery(api.users.checkEmailExists, email ? { email } : "skip");

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep("initial");
      setEmail("");
      setShowPassword(false);
      setIsLoading(false);
      setIsOAuthLoading(null);
    }
  }, [isOpen]);

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(emailExists ? passwordSchema : signUpPasswordSchema),
    defaultValues: { password: "" },
  });

  // Handle email submit
  const handleEmailSubmit = (data: z.infer<typeof emailSchema>) => {
    setEmail(data.email.toLowerCase().trim());
    setStep("password");
  };

  // Handle password submit (sign in or sign up)
  const handlePasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
    setIsLoading(true);
    try {
      if (emailExists) {
        // Sign in
        await signIn("password", {
          email,
          password: data.password,
          flow: "signIn",
        });
        toast.success("Welcome back!");
      } else {
        // Sign up
        await signIn("password", {
          email,
          password: data.password,
          flow: "signUp",
        });
        toast.success("Account created!");
      }
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OAuth sign in
  const handleOAuthSignIn = async (provider: "twitch" | "kick") => {
    setIsOAuthLoading(provider);
    try {
      const result = await signIn(provider);
      if (result.redirect) {
        window.location.href = result.redirect.toString();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth failed";
      toast.error(message);
      setIsOAuthLoading(null);
    }
  };

  // Go back to initial step
  const goBack = () => {
    setStep("initial");
    passwordForm.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="p-8 flex flex-col items-center">
          {/* Logo */}
          <p className="text-primary text-lg font-medium mb-2">Welcome to</p>
          <div className="mb-6 text-primary">
            <HiveLogo className="h-16 w-auto" />
          </div>

          {/* Subtitle */}
          <p className="text-foreground font-medium mb-6">Log in or sign up</p>

          {/* OAuth Buttons */}
          <div className="flex gap-3 w-full mb-6">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => handleOAuthSignIn("twitch")}
              disabled={isOAuthLoading !== null}
            >
              {isOAuthLoading === "twitch" ? (
                <Spinner className="size-5" />
              ) : (
                <TwitchIcon className="size-5" />
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => handleOAuthSignIn("kick")}
              disabled={isOAuthLoading !== null}
            >
              {isOAuthLoading === "kick" ? (
                <Spinner className="size-5" />
              ) : (
                <KickIcon className="size-5" />
              )}
            </Button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 w-full mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground text-sm">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email Step */}
          {step === "initial" && (
            <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="w-full space-y-4">
              <div className="space-y-1.5">
                <Input
                  {...emailForm.register("email")}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Email address"
                  className="h-12"
                  autoComplete="email username"
                  autoFocus
                />
                {emailForm.formState.errors.email && (
                  <p className="text-destructive text-sm">
                    {emailForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full h-12 text-base font-semibold">
                Continue
              </Button>
            </form>
          )}

          {/* Password Step */}
          {step === "password" && (
            <form
              onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
              className="w-full space-y-4"
            >
              {/* Email display with back button */}
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
                <button
                  type="button"
                  onClick={goBack}
                  className="p-1 hover:bg-background rounded-full transition-colors"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <span className="text-sm text-muted-foreground truncate">{email}</span>
              </div>

              {/* Hidden email field for password managers */}
              <input
                type="email"
                name="email"
                value={email}
                autoComplete="email username"
                readOnly
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />

              <div className="space-y-4">
                <div className="relative">
                  <Input
                    {...passwordForm.register("password")}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    className="h-12 pr-12"
                    autoComplete={emailExists ? "current-password" : "new-password"}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>

                {passwordForm.formState.errors.password && (
                  <p className="text-destructive text-sm">
                    {passwordForm.formState.errors.password.message}
                  </p>
                )}

                {/* Password requirements for new accounts */}
                {!emailExists && emailExists !== undefined && (
                  <PasswordRequirements password={passwordForm.watch("password") || ""} />
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Spinner className="size-5" />
                ) : emailExists === undefined ? (
                  <Spinner className="size-5" />
                ) : emailExists ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          )}

          {/* Terms */}
          <p className="text-xs text-muted-foreground text-center mt-6">
            By using Hive, you confirm that you are at least 18 years old and agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// PASSWORD REQUIREMENTS
// ============================================

const requirements = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (p: string) => p.length >= 8,
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (p: string) => /[a-z]/.test(p),
  },
  { id: "number", label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

function PasswordRequirements({ password }: { password: string }) {
  return (
    <div className="space-y-1.5 text-xs">
      {requirements.map((req) => (
        <div
          key={req.id}
          className={cn(
            "flex items-center gap-2 transition-colors",
            req.test(password) ? "text-green-500" : "text-muted-foreground"
          )}
        >
          <div
            className={cn(
              "size-1.5 rounded-full transition-colors",
              req.test(password) ? "bg-green-500" : "bg-muted-foreground"
            )}
          />
          {req.label}
        </div>
      ))}
    </div>
  );
}
