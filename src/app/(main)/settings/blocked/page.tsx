import { BlockedUsersList } from "@/components/moderation/block-user";

export const metadata = {
  title: "Blocked Accounts",
  description: "Manage your blocked accounts",
};

export default function BlockedPage() {
  return <BlockedUsersList />;
}
