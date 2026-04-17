"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTheme } from "next-themes";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  User,
  Bell,
  Shield,
  Moon,
  Sun,
  Lock,
  Trash2,
  LogOut,
  ChevronRight,
  Settings,
  Eye,
  EyeOff,
  MessageSquare,
  Heart,
  AtSign,
  UserPlus,
  DollarSign,
  CreditCard,
  Smartphone,
  Globe,
  Monitor,
  AlertTriangle,
  VolumeX,
  Award,
  BarChart3,
  Ban,
  BadgeCheck,
  Radio,
  Link2,
  Play,
  AlertCircle,
  Users,
  ImageIcon,
  Gift,
  Share2,
} from "lucide-react";

export function SettingsContent() {
  const currentUser = useQuery(api.users.currentUser);
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuthActions();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [deleteUsername, setDeleteUsername] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteAccount = useMutation(api.users.deleteAccount);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      toast.error("Failed to sign out");
      setIsSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser?.username) return;

    if (deleteUsername.toLowerCase() !== currentUser.username.toLowerCase()) {
      toast.error("Username does not match");
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAccount({ confirmUsername: deleteUsername });
      toast.success("Account deletion initiated");
      setShowDeleteDialog(false);
      await signOut();
      router.push("/");
    } catch (error) {
      toast.error("Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  if (currentUser === undefined) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="feed-container">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center gap-3 p-4">
          <Settings className="size-5" />
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </div>

      {/* Profile Section */}
      <div className="p-4">
        <Link
          href={`/profile/${currentUser?.username ?? ""}/edit`}
          className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
        >
          <UserAvatar user={currentUser} className="size-14" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">
              {currentUser?.displayName || currentUser?.username || "User"}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              @{currentUser?.username ?? "username"}
            </p>
            <p className="text-xs text-primary mt-0.5">Edit profile</p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>
      </div>

      <Separator />

      {/* Account */}
      <SettingsSection icon={User} title="Account" description="Manage your account settings">
        <div className="space-y-3">
          <SettingsLink
            href="/settings/verification"
            icon={BadgeCheck}
            title="Verification"
            description="Request or check verification status"
          />
          <SettingsLink
            href="/settings/referrals"
            icon={Gift}
            title="Referrals"
            description="Your referral code, link, and earnings"
          />
        </div>
      </SettingsSection>

      <Separator />

      {/* Notification Settings */}
      <SettingsSection
        icon={Bell}
        title="Notifications"
        description="Manage how you receive notifications"
      >
        <NotificationSettings />
      </SettingsSection>

      <Separator />

      {/* Privacy Settings */}
      <SettingsSection icon={Shield} title="Privacy" description="Control your visibility and data">
        <PrivacySettings />
      </SettingsSection>

      <Separator />

      {/* Streaming / Connected Accounts */}
      <SettingsSection icon={Radio} title="Streaming" description="Connect your streaming accounts">
        <div className="space-y-3">
          <SettingsLink
            href="/settings/streaming"
            icon={Link2}
            title="Connected accounts"
            description="Link Twitch, Kick, and manage live status"
          />
        </div>
      </SettingsSection>

      <Separator />

      {/* Content Preferences */}
      <SettingsSection
        icon={EyeOff}
        title="Content Preferences"
        description="Control what you see in your feed"
      >
        <div className="space-y-3">
          <SettingsLink
            href="/settings/muted"
            icon={VolumeX}
            title="Muted accounts"
            description="Manage accounts you've muted"
          />
          <SettingsLink
            href="/settings/hidden"
            icon={EyeOff}
            title="Hidden posts"
            description="View and restore hidden posts"
          />
          <SettingsLink
            href="/settings/blocked"
            icon={Ban}
            title="Blocked accounts"
            description="Manage accounts you've blocked"
          />
        </div>
      </SettingsSection>

      <Separator />

      {/* Creator Settings (only show for creators) */}
      {currentUser?.role === "creator" && (
        <>
          <SettingsSection
            icon={Award}
            title="Creator Tools"
            description="Manage your creator features"
          >
            <div className="space-y-3">
              <SettingsLink
                href="/settings/badges"
                icon={Award}
                title="Subscriber badges"
                description="View and manage subscriber loyalty badges"
              />
              <SettingsLink
                href="/analytics"
                icon={BarChart3}
                title="Share analytics"
                description="Track how your content is being shared"
              />
              <SettingsLink
                href="/settings/payouts"
                icon={DollarSign}
                title="Payouts"
                description="Manage your earnings and payouts"
              />
            </div>
          </SettingsSection>

          <Separator />

          {/* Creator Privacy Settings */}
          <SettingsSection
            icon={EyeOff}
            title="Creator Privacy"
            description="Control what others can see"
          >
            <CreatorPrivacySettings />
          </SettingsSection>

          <Separator />
        </>
      )}

      {/* Appearance Settings */}
      <SettingsSection icon={Monitor} title="Appearance" description="Customize how the app looks">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="size-5 text-muted-foreground" />
              ) : (
                <Sun className="size-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">
                  {theme === "dark"
                    ? "Dark mode"
                    : theme === "light"
                      ? "Light mode"
                      : "System preference"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setTheme("light")}
                className={`p-2 rounded-md transition-colors ${
                  theme === "light" ? "bg-background shadow-sm" : "hover:bg-background/50"
                }`}
                aria-label="Light mode"
              >
                <Sun className="size-4" />
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`p-2 rounded-md transition-colors ${
                  theme === "dark" ? "bg-background shadow-sm" : "hover:bg-background/50"
                }`}
                aria-label="Dark mode"
              >
                <Moon className="size-4" />
              </button>
              <button
                onClick={() => setTheme("system")}
                className={`p-2 rounded-md transition-colors ${
                  theme === "system" ? "bg-background shadow-sm" : "hover:bg-background/50"
                }`}
                aria-label="System theme"
              >
                <Monitor className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <Separator />

      {/* Display Preferences */}
      <SettingsSection icon={Eye} title="Display" description="Control how content is displayed">
        <DisplaySettings />
      </SettingsSection>

      <Separator />

      {/* Security Settings */}
      <SettingsSection icon={Lock} title="Security" description="Protect your account">
        <div className="space-y-3">
          <SettingsLink
            href="/settings/security/password"
            icon={Lock}
            title="Change password"
            description="Update your account password"
          />
          <SettingsLink
            href="/settings/security/2fa"
            icon={Smartphone}
            title="Two-factor authentication"
            description="Add an extra layer of security"
          />
          <SettingsLink
            href="/settings/security/sessions"
            icon={Globe}
            title="Active sessions"
            description="Manage your logged-in devices"
          />
        </div>
      </SettingsSection>

      <Separator />

      {/* Sign Out */}
      <div className="p-4">
        <Button
          variant="outline"
          className="w-full justify-start gap-3 h-12"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          <LogOut className="size-5" />
          {isSigningOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>

      <Separator />

      {/* Danger Zone */}
      <div className="p-4">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="size-5 text-destructive" />
            <h3 className="font-semibold text-destructive">Danger Zone</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete your account, there is no going back. All your data will be permanently
            removed.
          </p>
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full gap-2">
                <Trash2 className="size-4" />
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10">
                  <Trash2 className="text-destructive" />
                </AlertDialogMedia>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. All your posts, messages, subscriptions, and data
                  will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Type{" "}
                  <span className="font-semibold text-foreground">@{currentUser?.username}</span> to
                  confirm:
                </p>
                <Input
                  value={deleteUsername}
                  onChange={(e) => setDeleteUsername(e.target.value)}
                  placeholder={`@${currentUser?.username ?? ""}`}
                  className="font-mono"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={
                    isDeleting ||
                    deleteUsername.toLowerCase() !== (currentUser?.username?.toLowerCase() ?? "")
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>Version 1.0.0</p>
      </div>
    </div>
  );
}

interface SettingsSectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingsSection({ icon: Icon, title, description, children }: SettingsSectionProps) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-1">
        <Icon className="size-5 text-primary" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4 ml-8">{description}</p>
      <div className="ml-8">{children}</div>
    </div>
  );
}

interface SettingsLinkProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

function SettingsLink({ href, icon: Icon, title, description }: SettingsLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
    >
      <Icon className="size-5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-5 text-muted-foreground" />
    </Link>
  );
}

function NotificationSettings() {
  const settings = useQuery(api.settings.get);
  const updateSettings = useMutation(api.settings.update);

  const toggleSetting = async (key: string, currentValue: boolean) => {
    try {
      await updateSettings({ [key]: !currentValue });
      toast.success("Setting updated");
    } catch (error) {
      toast.error("Failed to update setting");
    }
  };

  if (!settings) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-5 rounded" />
              <div>
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsToggle
        icon={Bell}
        title="Push notifications"
        description="Receive push notifications on this device"
        checked={settings.pushNotifications}
        onCheckedChange={() => toggleSetting("pushNotifications", settings.pushNotifications)}
      />
      <SettingsToggle
        icon={AtSign}
        title="Email notifications"
        description="Receive important updates via email"
        checked={settings.emailNotifications}
        onCheckedChange={() => toggleSetting("emailNotifications", settings.emailNotifications)}
      />

      <Separator className="my-4" />

      <p className="text-sm font-medium text-muted-foreground mb-3">Activity</p>

      <SettingsToggle
        icon={UserPlus}
        title="New followers"
        description="When someone follows you"
        checked={settings.notifyOnNewFollower}
        onCheckedChange={() => toggleSetting("notifyOnNewFollower", settings.notifyOnNewFollower)}
      />
      <SettingsToggle
        icon={CreditCard}
        title="New subscribers"
        description="When someone subscribes to you"
        checked={settings.notifyOnNewSubscriber}
        onCheckedChange={() =>
          toggleSetting("notifyOnNewSubscriber", settings.notifyOnNewSubscriber)
        }
      />
      <SettingsToggle
        icon={DollarSign}
        title="Tips"
        description="When you receive a tip"
        checked={settings.notifyOnTip}
        onCheckedChange={() => toggleSetting("notifyOnTip", settings.notifyOnTip)}
      />
      <SettingsToggle
        icon={MessageSquare}
        title="Comments"
        description="When someone comments on your post"
        checked={settings.notifyOnComment}
        onCheckedChange={() => toggleSetting("notifyOnComment", settings.notifyOnComment)}
      />
      <SettingsToggle
        icon={Heart}
        title="Likes"
        description="When someone likes your content"
        checked={settings.notifyOnLike}
        onCheckedChange={() => toggleSetting("notifyOnLike", settings.notifyOnLike)}
      />
      <SettingsToggle
        icon={MessageSquare}
        title="Direct messages"
        description="When you receive a new message"
        checked={settings.notifyOnDM}
        onCheckedChange={() => toggleSetting("notifyOnDM", settings.notifyOnDM)}
      />
      <SettingsToggle
        icon={AtSign}
        title="Mentions"
        description="When someone mentions you"
        checked={settings.notifyOnMention}
        onCheckedChange={() => toggleSetting("notifyOnMention", settings.notifyOnMention)}
      />
    </div>
  );
}

function PrivacySettings() {
  const settings = useQuery(api.settings.get);
  const updateSettings = useMutation(api.settings.update);

  const toggleSetting = async (key: string, currentValue: boolean) => {
    try {
      await updateSettings({ [key]: !currentValue });
      toast.success("Setting updated");
    } catch (error) {
      toast.error("Failed to update setting");
    }
  };

  if (!settings) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-5 rounded" />
              <div>
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsToggle
        icon={Eye}
        title="Show online status"
        description="Let others see when you're online"
        checked={settings.showOnlineStatus}
        onCheckedChange={() => toggleSetting("showOnlineStatus", settings.showOnlineStatus)}
      />
      <SettingsToggle
        icon={Eye}
        title="Show last active"
        description="Let others see when you were last active"
        checked={settings.showLastActive}
        onCheckedChange={() => toggleSetting("showLastActive", settings.showLastActive)}
      />
      <SettingsToggle
        icon={Globe}
        title="Search engine indexing"
        description="Allow search engines to index your profile"
        checked={settings.allowSearchEngineIndexing}
        onCheckedChange={() =>
          toggleSetting("allowSearchEngineIndexing", settings.allowSearchEngineIndexing)
        }
      />
    </div>
  );
}

function DisplaySettings() {
  const settings = useQuery(api.settings.get);
  const updateSettings = useMutation(api.settings.update);

  const toggleSetting = async (key: string, currentValue: boolean) => {
    try {
      await updateSettings({ [key]: !currentValue });
      toast.success("Setting updated");
    } catch (error) {
      toast.error("Failed to update setting");
    }
  };

  if (!settings) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-5 rounded" />
              <div>
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsToggle
        icon={Play}
        title="Autoplay videos"
        description="Automatically play videos in your feed"
        checked={settings.autoplayVideos}
        onCheckedChange={() => toggleSetting("autoplayVideos", settings.autoplayVideos)}
      />
      <SettingsToggle
        icon={AlertCircle}
        title="Content warnings"
        description="Blur sensitive content until you tap to view"
        checked={settings.contentWarnings}
        onCheckedChange={() => toggleSetting("contentWarnings", settings.contentWarnings)}
      />
    </div>
  );
}

function CreatorPrivacySettings() {
  const settings = useQuery(api.settings.get);
  const updateSettings = useMutation(api.settings.update);

  const toggleSetting = async (key: string, currentValue: boolean) => {
    try {
      await updateSettings({ [key]: !currentValue });
      toast.success("Setting updated");
    } catch (error) {
      toast.error("Failed to update setting");
    }
  };

  if (!settings) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-5 rounded" />
              <div>
                <Skeleton className="h-4 w-28 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsToggle
        icon={Users}
        title="Hide subscriber count"
        description="Don't show your total subscriber count publicly"
        checked={settings.hideSubscriberCount}
        onCheckedChange={() => toggleSetting("hideSubscriberCount", settings.hideSubscriberCount)}
      />
      <SettingsToggle
        icon={DollarSign}
        title="Hide earnings"
        description="Don't display your earnings publicly"
        checked={settings.hideEarnings}
        onCheckedChange={() => toggleSetting("hideEarnings", settings.hideEarnings)}
      />
      <SettingsToggle
        icon={ImageIcon}
        title="Watermark media"
        description="Add a watermark to your images and videos"
        checked={settings.watermarkMedia}
        onCheckedChange={() => toggleSetting("watermarkMedia", settings.watermarkMedia)}
      />
    </div>
  );
}

interface SettingsToggleProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: () => void;
}

function SettingsToggle({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: SettingsToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="size-5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground truncate">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="feed-container">
      {/* Header */}
      <div className="p-4 border-b">
        <Skeleton className="h-7 w-24" />
      </div>

      {/* Profile */}
      <div className="p-4">
        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Settings sections */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="ml-8 space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-5 rounded" />
                    <div>
                      <Skeleton className="h-4 w-28 mb-1" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <Separator />
        </div>
      ))}
    </div>
  );
}
