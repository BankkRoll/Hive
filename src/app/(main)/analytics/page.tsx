import { ShareAnalyticsDashboard } from "@/components/analytics/share-analytics";

export const metadata = {
  title: "Analytics - Hive",
  description: "View your content analytics",
};

export default function AnalyticsPage() {
  return (
    <div className="container max-w-4xl py-6">
      <ShareAnalyticsDashboard />
    </div>
  );
}
