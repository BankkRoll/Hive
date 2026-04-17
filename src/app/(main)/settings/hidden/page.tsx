import { HiddenPostsList } from "@/components/moderation/hide-post";

export const metadata = {
  title: "Hidden Posts",
  description: "Manage your hidden posts",
};

export default function HiddenPage() {
  return <HiddenPostsList />;
}
