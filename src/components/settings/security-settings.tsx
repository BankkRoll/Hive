"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import {
  Shield,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Key,
  Copy,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ============================================
// 2FA Setup Component
// ============================================

export function TwoFactorSetup() {
  const currentUser = useQuery(api.users.currentUser);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes] = useState([
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
    "XXXX-XXXX-XXXX",
  ]);

  // 2FA is not yet implemented in the backend
  const is2FAEnabled = false;
  const isSetupInProgress = false;

  if (currentUser === undefined) {
    return <SecuritySkeleton />;
  }

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success("Backup codes copied to clipboard");
  };

  return (
    <div className="feed-container">
      <PageHeader
        title="Two-Factor Authentication"
        description="Add an extra layer of security"
        backHref="/settings"
      />

      <div className="p-4 space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-full ${is2FAEnabled ? "bg-success/10" : "bg-warning/10"}`}
                >
                  {is2FAEnabled ? (
                    <CheckCircle className="size-5 text-success" />
                  ) : (
                    <AlertTriangle className="size-5 text-warning" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {is2FAEnabled ? "2FA is enabled" : "2FA is not enabled"}
                  </CardTitle>
                  <CardDescription>
                    {is2FAEnabled
                      ? "Your account is protected with two-factor authentication"
                      : "Add two-factor authentication for extra security"}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!is2FAEnabled ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <h4 className="font-medium mb-2">How it works</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="font-medium text-foreground">1.</span>
                      Install an authenticator app (Google Authenticator, Authy, etc.)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium text-foreground">2.</span>
                      Scan the QR code with your authenticator app
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium text-foreground">3.</span>
                      Enter the 6-digit code to verify setup
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium text-foreground">4.</span>
                      Save your backup codes in a safe place
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
                  <div className="flex items-center gap-2 text-warning dark:text-warning mb-2">
                    <AlertTriangle className="size-4" />
                    <span className="font-medium text-sm">Coming Soon</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Two-factor authentication is currently being implemented. Check back soon for
                    this security feature.
                  </p>
                </div>

                <Button className="w-full" onClick={() => setShowSetupDialog(true)} disabled>
                  <Smartphone className="size-4 mr-2" />
                  Set up 2FA
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
                  <CheckCircle className="size-5 text-success" />
                  <div>
                    <p className="font-medium text-success dark:text-success">Protected</p>
                    <p className="text-sm text-muted-foreground">
                      Your account requires a verification code to sign in
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-2">Backup Codes</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Use these codes to sign in if you lose access to your authenticator app
                  </p>
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/50 font-mono text-sm">
                    {backupCodes.map((code, i) => (
                      <span key={i} className="text-muted-foreground">
                        {code}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" onClick={copyBackupCodes}>
                      <Copy className="size-4 mr-2" />
                      Copy codes
                    </Button>
                    <Button variant="outline" size="sm">
                      <RefreshCw className="size-4 mr-2" />
                      Generate new codes
                    </Button>
                  </div>
                </div>

                <Separator />

                <Button variant="destructive" className="w-full">
                  Disable 2FA
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommended Apps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recommended Authenticator Apps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <AuthenticatorApp
                name="Google Authenticator"
                description="Free, simple, and reliable"
                icon="G"
              />
              <AuthenticatorApp
                name="Authy"
                description="Cloud backup and multi-device sync"
                icon="A"
              />
              <AuthenticatorApp
                name="1Password"
                description="Built into your password manager"
                icon="1"
              />
              <AuthenticatorApp
                name="Microsoft Authenticator"
                description="Works with Microsoft accounts too"
                icon="M"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Setup Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set up Two-Factor Authentication</DialogTitle>
            <DialogDescription>Scan this QR code with your authenticator app</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* QR Code Placeholder */}
            <div className="flex justify-center">
              <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center px-4">
                  QR Code will appear here when 2FA is enabled
                </p>
              </div>
            </div>

            {/* Manual Entry */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Or enter this code manually:</p>
              <code className="text-sm font-mono bg-muted px-3 py-1 rounded">
                XXXX-XXXX-XXXX-XXXX
              </code>
            </div>

            <Separator />

            {/* Verification */}
            <div className="space-y-2">
              <Label htmlFor="code">Enter verification code</Label>
              <Input
                id="code"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-lg tracking-widest font-mono"
                maxLength={6}
              />
            </div>

            <Button className="w-full" disabled={verificationCode.length !== 6}>
              Verify and Enable 2FA
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuthenticatorApp({
  name,
  description,
  icon,
}: {
  name: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border">
      <div className="size-10 rounded-lg bg-muted flex items-center justify-center font-bold text-lg">
        {icon}
      </div>
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ============================================
// Active Sessions Component
// ============================================

export function ActiveSessions() {
  const loginHistory = useQuery(api.security.getLoginHistory, { limit: 50 });
  const activeSessionsCount = useQuery(api.security.getActiveSessionsCount);

  if (loginHistory === undefined) {
    return <SecuritySkeleton />;
  }

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="size-5" />;
      case "tablet":
        return <Tablet className="size-5" />;
      case "desktop":
      default:
        return <Monitor className="size-5" />;
    }
  };

  const parseUserAgent = (ua?: string) => {
    if (!ua) return { browser: "Unknown", os: "Unknown" };

    let browser = "Unknown";
    let os = "Unknown";

    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    return { browser, os };
  };

  const successfulLogins = loginHistory.filter((l) => l.success);
  const failedLogins = loginHistory.filter((l) => !l.success);

  return (
    <div className="feed-container">
      <PageHeader
        title="Active Sessions"
        description="Manage your logged-in devices"
        backHref="/settings"
      />

      <div className="p-4 space-y-6">
        {/* Summary Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Session Overview</CardTitle>
              <Badge variant="outline">
                {activeSessionsCount ?? 0} active device
                {(activeSessionsCount ?? 0) !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="size-4 text-success" />
                  <span className="font-medium text-success dark:text-success">Successful</span>
                </div>
                <p className="text-2xl font-bold">{successfulLogins.length}</p>
                <p className="text-xs text-muted-foreground">logins (last 90 days)</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="size-4 text-destructive" />
                  <span className="font-medium text-destructive dark:text-destructive">Failed</span>
                </div>
                <p className="text-2xl font-bold">{failedLogins.length}</p>
                <p className="text-xs text-muted-foreground">attempts (last 90 days)</p>
              </div>
            </div>

            {failedLogins.length > 5 && (
              <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" />
                  <span className="text-sm font-medium text-warning dark:text-warning">
                    Multiple failed login attempts detected
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Consider enabling 2FA for additional security.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Session */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="p-2 rounded-full bg-primary/10">
                <Monitor className="size-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">This device</p>
                  <Badge className="bg-primary text-primary-foreground text-xs">Current</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Active now</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Login History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Login Activity</CardTitle>
            <CardDescription>Your login history from the last 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {loginHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="size-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No login history available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {loginHistory.map((login) => {
                    const { browser, os } = parseUserAgent(login.userAgent);
                    return (
                      <div
                        key={login._id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          login.success ? "bg-card" : "bg-destructive/5 border-destructive/20"
                        }`}
                      >
                        <div
                          className={`p-2 rounded-full ${
                            login.success ? "bg-muted" : "bg-destructive/10"
                          }`}
                        >
                          {getDeviceIcon(login.deviceType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">
                              {browser} on {os}
                            </p>
                            {!login.success && (
                              <Badge variant="destructive" className="text-xs">
                                Failed
                              </Badge>
                            )}
                          </div>
                          {login.location && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                              <MapPin className="size-3" />
                              <span>{login.location}</span>
                            </div>
                          )}
                          {login.ipAddress && (
                            <p className="text-xs text-muted-foreground font-mono">
                              IP: {login.ipAddress}
                            </p>
                          )}
                          {login.failureReason && (
                            <p className="text-xs text-destructive mt-1">{login.failureReason}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(login.createdAt, { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Security Tips */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              Security Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="size-4 text-success mt-0.5 shrink-0" />
                <span>Sign out of devices you no longer use</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="size-4 text-success mt-0.5 shrink-0" />
                <span>Enable two-factor authentication for extra security</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="size-4 text-success mt-0.5 shrink-0" />
                <span>Use a unique, strong password</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="size-4 text-success mt-0.5 shrink-0" />
                <span>Be cautious of phishing attempts</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// Password Change Component
// ============================================

export function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsChanging(true);
    try {
      // Password change would be handled by the auth provider
      // For now, show a placeholder message
      toast.info("Password change is handled by your authentication provider");
    } catch (error) {
      toast.error("Failed to change password");
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className="feed-container">
      <PageHeader
        title="Change Password"
        description="Update your account password"
        backHref="/settings"
      />

      <div className="p-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Key className="size-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Update Password</CardTitle>
                <CardDescription>Choose a strong, unique password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border">
              <h4 className="font-medium text-sm mb-2">Password requirements:</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li className={newPassword.length >= 8 ? "text-success" : ""}>
                  {newPassword.length >= 8 ? "✓" : "○"} At least 8 characters
                </li>
                <li className={/[A-Z]/.test(newPassword) ? "text-success" : ""}>
                  {/[A-Z]/.test(newPassword) ? "✓" : "○"} One uppercase letter
                </li>
                <li className={/[a-z]/.test(newPassword) ? "text-success" : ""}>
                  {/[a-z]/.test(newPassword) ? "✓" : "○"} One lowercase letter
                </li>
                <li className={/\d/.test(newPassword) ? "text-success" : ""}>
                  {/\d/.test(newPassword) ? "✓" : "○"} One number
                </li>
              </ul>
            </div>

            <Button
              className="w-full"
              onClick={handleChangePassword}
              disabled={
                isChanging || !currentPassword || !newPassword || newPassword !== confirmPassword
              }
            >
              {isChanging ? "Updating..." : "Update Password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// Skeleton
// ============================================

function SecuritySkeleton() {
  return (
    <div className="feed-container">
      <div className="p-4 border-b">
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="p-4 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
