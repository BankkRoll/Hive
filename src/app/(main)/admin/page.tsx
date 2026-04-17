import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata = {
  title: "Admin Dashboard",
  description: "Platform administration and moderation",
};

export default function AdminPage() {
  return (
    <div className="feed-container p-4">
      <AdminDashboard />
    </div>
  );
}
