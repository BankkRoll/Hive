"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import QRCode from "qrcode";

// Custom hook for copy with feedback
function useCopyToClipboard(resetDelay = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback(
    async (text: string, key: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        toast.success(`${label} copied!`);
        setTimeout(() => setCopiedKey(null), resetDelay);
      } catch (error) {
        toast.error("Failed to copy");
      }
    },
    [resetDelay]
  );

  const isCopied = useCallback((key: string) => copiedKey === key, [copiedKey]);

  return { copy, isCopied };
}

export function TwoFactorSettings() {
  const status = useQuery(api.twoFactor.getStatus);
  const initiateSetup = useAction(api.twoFactorActions.initiateSetup);
  const confirmSetup = useAction(api.twoFactorActions.confirmSetup);
  const regenerateBackupCodes = useAction(api.twoFactorActions.regenerateBackupCodes);

  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [setupStep, setSetupStep] = useState<"qr" | "verify" | "backup">("qr");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateCode, setRegenerateCode] = useState("");

  const { copy, isCopied } = useCopyToClipboard();

  // Generate QR code image when URL changes
  useEffect(() => {
    if (qrCodeUrl) {
      QRCode.toDataURL(qrCodeUrl, { width: 200, margin: 2 })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [qrCodeUrl]);

  const handleStartSetup = async () => {
    setIsLoading(true);
    try {
      const result = await initiateSetup();
      if (result.success && result.qrCodeUrl && result.secret) {
        setQrCodeUrl(result.qrCodeUrl);
        setSecret(result.secret);
        setSetupStep("qr");
        setShowSetupDialog(true);
      } else {
        toast.error(result.error || "Failed to start 2FA setup");
      }
    } catch (error) {
      toast.error("Failed to start 2FA setup");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const result = await confirmSetup({ code: verificationCode });
      if (result.success && result.backupCodes) {
        setBackupCodes(result.backupCodes);
        setSetupStep("backup");
        toast.success("2FA enabled successfully!");
      } else {
        toast.error(result.error || "Invalid verification code");
      }
    } catch (error) {
      toast.error("Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerateCode.length !== 6) {
      toast.error("Please enter your current 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const result = await regenerateBackupCodes({ currentCode: regenerateCode });
      if (result.success && result.backupCodes) {
        setBackupCodes(result.backupCodes);
        setShowRegenerateDialog(false);
        setRegenerateCode("");
        toast.success("New backup codes generated!");
        // Show backup codes in setup dialog
        setSetupStep("backup");
        setShowSetupDialog(true);
      } else {
        toast.error(result.error || "Failed to regenerate codes");
      }
    } catch (error) {
      toast.error("Failed to regenerate backup codes");
    } finally {
      setIsLoading(false);
    }
  };

  const resetSetup = () => {
    setShowSetupDialog(false);
    setSetupStep("qr");
    setQrCodeUrl(null);
    setSecret(null);
    setVerificationCode("");
    setBackupCodes([]);
    setQrDataUrl(null);
  };

  if (!status) {
    return (
      <div className="feed-container">
        <PageHeader
          title="Two-Factor Authentication"
          description="Add an extra layer of security"
          backHref="/settings"
        />
        <div className="p-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-container">
      <PageHeader
        title="Two-Factor Authentication"
        description="Add an extra layer of security"
        backHref="/settings"
      />
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {status.enabled ? (
                <ShieldCheck className="h-5 w-5 text-success" />
              ) : (
                <ShieldOff className="h-5 w-5 text-muted-foreground" />
              )}
              Two-Factor Authentication
              {status.enabled && (
                <Badge className="bg-success/10 text-success border-success/20">Enabled</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account using authenticator apps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.enabled ? (
              <>
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Authenticator App</p>
                      <p className="text-sm text-muted-foreground">
                        {status.backupCodesRemaining} backup codes remaining
                      </p>
                    </div>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>

                <div className="flex gap-2">
                  <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
                    <DialogTrigger>
                      <Button variant="outline" size="sm">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        New Backup Codes
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Regenerate Backup Codes</DialogTitle>
                        <DialogDescription>
                          Enter your current authenticator code to generate new backup codes. Your
                          old codes will be invalidated.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Current 2FA Code</Label>
                          <Input
                            value={regenerateCode}
                            onChange={(e) =>
                              setRegenerateCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                            }
                            placeholder="000000"
                            maxLength={6}
                            className="text-center text-2xl tracking-widest"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button onClick={handleRegenerate} disabled={isLoading}>
                          {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Generate New Codes
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <AlertDialog>
                    <AlertDialogTrigger>
                      <Button variant="outline" size="sm" className="text-destructive">
                        <ShieldOff className="mr-2 h-4 w-4" />
                        Disable 2FA
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disable Two-Factor Authentication?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the extra security from your account. You can re-enable
                          it at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground">
                          Disable 2FA
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                  <div>
                    <p className="font-medium text-warning">Recommended</p>
                    <p className="text-sm text-muted-foreground">
                      Enable 2FA to protect your account from unauthorized access
                    </p>
                  </div>
                </div>

                <Button onClick={handleStartSetup} disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="mr-2 h-4 w-4" />
                  )}
                  Enable Two-Factor Authentication
                </Button>
              </div>
            )}

            {/* Setup Dialog */}
            <Dialog open={showSetupDialog} onOpenChange={(open) => !open && resetSetup()}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {setupStep === "qr" && "Scan QR Code"}
                    {setupStep === "verify" && "Verify Code"}
                    {setupStep === "backup" && "Save Backup Codes"}
                  </DialogTitle>
                  <DialogDescription>
                    {setupStep === "qr" && "Scan this QR code with your authenticator app"}
                    {setupStep === "verify" && "Enter the 6-digit code from your authenticator"}
                    {setupStep === "backup" && "Save these codes in a safe place"}
                  </DialogDescription>
                </DialogHeader>

                {setupStep === "qr" && (
                  <div className="space-y-4 py-4">
                    <div className="flex justify-center">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="2FA QR Code" className="rounded-lg" />
                      ) : (
                        <div className="w-[200px] h-[200px] bg-muted animate-pulse rounded-lg" />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Or enter this code manually:</Label>
                      <div className="flex gap-2">
                        <Input value={secret || ""} readOnly className="font-mono text-sm" />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => secret && copy(secret, "secret", "Secret")}
                          className="shrink-0"
                        >
                          {isCopied("secret") ? (
                            <Check className="h-4 w-4 text-success" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <Button className="w-full" onClick={() => setSetupStep("verify")}>
                      Continue
                    </Button>
                  </div>
                )}

                {setupStep === "verify" && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Verification Code</Label>
                      <Input
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="000000"
                        maxLength={6}
                        className="text-center text-2xl tracking-widest"
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setSetupStep("qr")}
                      >
                        Back
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleVerify}
                        disabled={isLoading || verificationCode.length !== 6}
                      >
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Verify
                      </Button>
                    </div>
                  </div>
                )}

                {setupStep === "backup" && (
                  <div className="space-y-4 py-4">
                    <div className="p-4 rounded-lg bg-muted space-y-2">
                      <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                        {backupCodes.map((code, i) => (
                          <div key={i} className="p-2 bg-background rounded text-center">
                            {code}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        Save these codes securely. Each code can only be used once.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => copy(backupCodes.join("\n"), "backup", "Backup codes")}
                      >
                        {isCopied("backup") ? (
                          <Check className="mr-2 h-4 w-4 text-success" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        {isCopied("backup") ? "Copied!" : "Copy All"}
                      </Button>
                      <Button className="flex-1" onClick={resetSetup}>
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
