import { PageHead } from "@/components/core/page-title";
import { ProfileTimeAnalyticsDashboard } from "@/components/profile/time-analytics/root";
import type { Route } from "./+types/page";

export default function ProfileTimeAnalyticsPage(_props: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Profile - Hours logged" />
      <ProfileTimeAnalyticsDashboard />
    </>
  );
}
