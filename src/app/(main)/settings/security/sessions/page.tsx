import { ActiveSessions } from "@/components/settings/security-settings";

export const metadata = {
  title: "Active Sessions",
  description: "Manage your logged-in devices",
};

export default function SessionsPage() {
  return <ActiveSessions />;
}
