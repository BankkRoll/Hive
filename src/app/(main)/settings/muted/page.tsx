import { MutedUsersList } from "@/components/moderation/mute-user";

export const metadata = {
  title: "Muted Accounts",
  description: "Manage your muted accounts",
};

export default function MutedPage() {
  return <MutedUsersList />;
}
