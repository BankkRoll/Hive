import { SubscriberBadgesManager } from "@/components/creator/subscriber-badges-manager";

export const metadata = {
  title: "Subscriber Badges - Hive",
  description: "Manage your subscribers' loyalty badges",
};

export default function BadgesPage() {
  return (
    <div className="container max-w-4xl py-6">
      <SubscriberBadgesManager />
    </div>
  );
}
