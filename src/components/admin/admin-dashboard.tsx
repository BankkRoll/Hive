"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Shield,
  AlertTriangle,
  Ban,
  CheckCircle,
  Clock,
  UserX,
  UserCheck,
  Activity,
  TrendingUp,
  BadgeCheck,
} from "lucide-react";
import { VerificationQueue } from "./verification-queue";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type UserStatus = "active" | "suspended" | "banned" | "pending_review";
type UserRole = "user" | "creator" | "platform_mod" | "admin" | "super_admin";
type AssignableRole = "user" | "creator" | "platform_mod" | "admin";

type ActionUser = {
  _id: Id<"users">;
  username?: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
  isVerified?: boolean;
  followersCount?: number;
  postsCount?: number;
  createdAt: number;
};

type ActionDialogState = {
  type: "suspend" | "ban" | "unban" | "verify" | "changeRole" | null;
  user: ActionUser | null;
};

export function AdminDashboard() {
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [actionDialog, setActionDialog] = useState<ActionDialogState>({
    type: null,
    user: null,
  });
  const [actionReason, setActionReason] = useState("");
  const [suspendDays, setSuspendDays] = useState("7");
  const [newRole, setNewRole] = useState<UserRole>("user");

  // Queries
  const stats = useQuery(api.admin.getPlatformStats);
  const users = useQuery(api.admin.getUsers, {
    status: statusFilter === "all" ? undefined : statusFilter,
    role: roleFilter === "all" ? undefined : roleFilter,
    limit: 50,
  });
  const actionLogs = useQuery(api.admin.getActionLogs, { limit: 20 });
  const pendingReports = useQuery(api.reports.getPendingReports, { limit: 10 });

  // Mutations
  const suspendUser = useMutation(api.admin.suspendUser);
  const banUser = useMutation(api.admin.banUser);
  const unbanUser = useMutation(api.admin.unbanUser);
  const verifyUser = useMutation(api.admin.verifyUser);
  const changeUserRole = useMutation(api.admin.changeUserRole);

  const handleAction = async () => {
    if (!actionDialog.user || !actionDialog.type) return;

    try {
      switch (actionDialog.type) {
        case "suspend":
          await suspendUser({
            userId: actionDialog.user._id,
            reason: actionReason,
            durationDays: parseInt(suspendDays, 10),
          });
          toast.success("User suspended");
          break;
        case "ban":
          await banUser({
            userId: actionDialog.user._id,
            reason: actionReason,
          });
          toast.success("User banned");
          break;
        case "unban":
          await unbanUser({
            userId: actionDialog.user._id,
            reason: actionReason || undefined,
          });
          toast.success("User restored");
          break;
        case "verify":
          await verifyUser({ userId: actionDialog.user._id });
          toast.success("User verified");
          break;
        case "changeRole":
          await changeUserRole({
            userId: actionDialog.user._id,
            newRole: newRole as AssignableRole,
            reason: actionReason || undefined,
          });
          toast.success("Role updated");
          break;
      }
      closeActionDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  const closeActionDialog = () => {
    setActionDialog({ type: null, user: null });
    setActionReason("");
    setSuspendDays("7");
    setNewRole("user");
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            Active
          </Badge>
        );
      case "suspended":
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            Suspended
          </Badge>
        );
      case "banned":
        return (
          <Badge
            variant="outline"
            className="bg-destructive/10 text-destructive border-destructive/20"
          >
            Banned
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "super_admin":
        return <Badge className="bg-primary text-primary-foreground">Super Admin</Badge>;
      case "admin":
        return <Badge className="bg-destructive text-destructive-foreground">Admin</Badge>;
      case "platform_mod":
        return <Badge className="bg-info text-info-foreground">Moderator</Badge>;
      case "creator":
        return <Badge className="bg-accent text-accent-foreground">Creator</Badge>;
      default:
        return <Badge variant="secondary">User</Badge>;
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      user_suspended: "Suspended User",
      user_banned: "Banned User",
      user_unbanned: "Unbanned User",
      user_verified: "Verified User",
      post_removed: "Removed Post",
      comment_removed: "Removed Comment",
      report_resolved: "Resolved Report",
      payout_approved: "Approved Payout",
      payout_rejected: "Rejected Payout",
      role_changed: "Changed Role",
      connect_deauthorized: "Deauthorized Connect",
    };
    return labels[action] || action;
  };

  if (stats === undefined) {
    return <AdminDashboardSkeleton />;
  }

  if (stats === null) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">
          You don&apos;t have permission to access the admin dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Badge variant="outline" className="gap-1">
          <Shield className="h-3 w-3" />
          Platform Admin
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.users.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-success">{stats.users.active}</span> active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Creators</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.creators.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Verified content creators</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.users.suspended}</div>
            <p className="text-xs text-muted-foreground">Temporarily suspended</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.pendingReports}</div>
            <p className="text-xs text-muted-foreground">Require review</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="verification" className="flex items-center gap-1">
            <BadgeCheck className="h-4 w-4" />
            Verification
          </TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as UserStatus | "all")}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={roleFilter}
              onValueChange={(value) => setRoleFilter(value as UserRole | "all")}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="platform_mod">Moderator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Followers</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user._id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {user.displayName || user.username || "Unknown"}
                            {user.isVerified && (
                              <CheckCircle className="inline-block h-3 w-3 ml-1 text-primary" />
                            )}
                          </span>
                          <span className="text-sm text-muted-foreground">@{user.username}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>{user.followersCount ?? 0}</TableCell>
                      <TableCell>
                        {formatDistanceToNow(user.createdAt, { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {user.status === "active" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setActionDialog({ type: "suspend", user })}
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setActionDialog({ type: "ban", user })}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(user.status === "suspended" || user.status === "banned") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActionDialog({ type: "unban", user })}
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          )}
                          {!user.isVerified && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActionDialog({ type: "verify", user })}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setNewRole((user.role as UserRole) || "user");
                              setActionDialog({ type: "changeRole", user });
                            }}
                          >
                            <Shield className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <UserX className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground">No users found</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* Verification Tab */}
        <TabsContent value="verification" className="space-y-4">
          <VerificationQueue />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Pending Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {pendingReports?.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="text-muted-foreground">No pending reports</p>
                  </div>
                )}
                <div className="space-y-3">
                  {pendingReports?.map((report) => (
                    <div key={report._id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{report.targetType}</Badge>
                            <Badge variant="outline" className="bg-destructive/10 text-destructive">
                              {report.reason.replace("_", " ")}
                            </Badge>
                          </div>
                          {report.targetInfo && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {report.targetInfo.preview}
                            </p>
                          )}
                          {report.description && <p className="text-sm">{report.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            Reported by @{report.reporter?.username} •{" "}
                            {formatDistanceToNow(report.createdAt, {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        <Button size="sm" variant="outline">
                          Review
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Admin Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {actionLogs?.map((log) => (
                    <div key={log._id} className="flex items-start gap-3 p-3 rounded-lg border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">@{log.admin?.username}</span>
                          <Badge variant="secondary">{getActionLabel(log.action)}</Badge>
                        </div>
                        {log.targetUser && (
                          <p className="text-sm text-muted-foreground">
                            Target: @{log.targetUser.username}
                          </p>
                        )}
                        {log.reason && <p className="text-sm mt-1">{log.reason}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(log.createdAt, {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {actionLogs?.length === 0 && (
                    <div className="text-center py-8">
                      <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No activity yet</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Dialogs */}
      <Dialog
        open={actionDialog.type !== null}
        onOpenChange={(open) => !open && closeActionDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.type === "suspend" && "Suspend User"}
              {actionDialog.type === "ban" && "Ban User"}
              {actionDialog.type === "unban" && "Restore User"}
              {actionDialog.type === "verify" && "Verify User"}
              {actionDialog.type === "changeRole" && "Change Role"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.user && (
                <>
                  User: <strong>@{actionDialog.user.username}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {actionDialog.type === "suspend" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="suspendDays">Duration (days)</Label>
                  <Input
                    id="suspendDays"
                    type="number"
                    min="1"
                    max="365"
                    value={suspendDays}
                    onChange={(e) => setSuspendDays(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea
                    id="reason"
                    placeholder="Enter suspension reason..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                  />
                </div>
              </>
            )}

            {actionDialog.type === "ban" && (
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  placeholder="Enter ban reason..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </div>
            )}

            {actionDialog.type === "unban" && (
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Enter reason for restoration..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </div>
            )}

            {actionDialog.type === "verify" && (
              <p className="text-sm text-muted-foreground">
                This will add a verification badge to the user&apos;s profile.
              </p>
            )}

            {actionDialog.type === "changeRole" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newRole">New Role</Label>
                  <Select value={newRole} onValueChange={(value) => setNewRole(value as UserRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="creator">Creator</SelectItem>
                      <SelectItem value="platform_mod">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Textarea
                    id="reason"
                    placeholder="Enter reason for role change..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeActionDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              variant={
                actionDialog.type === "ban" || actionDialog.type === "suspend"
                  ? "destructive"
                  : "default"
              }
              disabled={
                (actionDialog.type === "suspend" || actionDialog.type === "ban") &&
                !actionReason.trim()
              }
            >
              {actionDialog.type === "suspend" && "Suspend"}
              {actionDialog.type === "ban" && "Ban"}
              {actionDialog.type === "unban" && "Restore"}
              {actionDialog.type === "verify" && "Verify"}
              {actionDialog.type === "changeRole" && "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}
