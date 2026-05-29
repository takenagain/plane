import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { Clock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { ContentWrapper } from "@plane/ui";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { useProfileTimeAnalyticsRealtime } from "@/hooks/use-profile-time-analytics-realtime";
import { ProfileTimeAnalyticsService } from "@/services/profile-time-analytics.service";
import { ProfileTimeCommentSignals } from "./comment-signals";
import { DEFAULT_PROFILE_TIME_FILTERS, ProfileTimeFilters } from "./filters";
import { ProfileTimeKpis } from "./kpis";
import { ProfileTimeCustomizedInsights } from "./profile-time-customized-insights";
import { ProfileTimeRankingsGrid } from "./rankings-grid";
import { ProfileTimeRecentWorklogs } from "./recent-worklogs";
import { ProfileTimeTopWorkItemsTable } from "./top-work-items-table";
import { ProfileTimeTrendChart } from "./trend-chart";
import type { TProfileTimeFilters } from "./types";
import { filtersToQueryParams } from "./types";

const profileTimeAnalyticsService = new ProfileTimeAnalyticsService();

export const ProfileTimeAnalyticsDashboard = observer(function ProfileTimeAnalyticsDashboard() {
  const { t } = useTranslation();
  const { workspaceSlug, userId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const profileUserId = userId?.toString() ?? "";

  const [filters, setFilters] = useState<TProfileTimeFilters>(DEFAULT_PROFILE_TIME_FILTERS);
  const [refreshKey, setRefreshKey] = useState(0);

  const query = filtersToQueryParams(filters);
  const { data: summary } = useSWR(
    profileUserId ? `profile-time-summary-${slug}-${profileUserId}-${filters.dateFilter}-empty-check` : null,
    () => profileTimeAnalyticsService.getSummary(slug, profileUserId, query)
  );

  const bumpRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    void mutate((key) => typeof key === "string" && key.startsWith("profile-time-"));
  }, []);

  useProfileTimeAnalyticsRealtime({
    workspaceSlug: slug,
    userId: profileUserId,
    enabled: Boolean(slug && profileUserId),
    onEvent: () => bumpRefresh(),
  });

  const hasNoData = summary && summary.worklog_count === 0 && summary.active_timer_count === 0;

  return (
    <ContentWrapper className="flex h-full flex-col gap-6 py-7" data-testid="profile-time-analytics-dashboard">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Clock className="size-5 text-tertiary" />
          <h2 className="text-18 font-semibold">{t("profile.time_analytics.title")}</h2>
        </div>
        <ProfileTimeFilters filters={filters} onChange={setFilters} />
      </div>

      {hasNoData ? (
        <EmptyStateCompact
          data-testid="profile-time-analytics-empty"
          title={t("profile.time_analytics.empty.title")}
          description={t("profile.time_analytics.empty.description")}
        />
      ) : (
        <>
          <ProfileTimeKpis workspaceSlug={slug} userId={profileUserId} filters={filters} refreshKey={refreshKey} />
          <ProfileTimeCustomizedInsights
            workspaceSlug={slug}
            userId={profileUserId}
            filters={filters}
            chartRefreshKey={refreshKey}
          />
          <ProfileTimeRankingsGrid
            workspaceSlug={slug}
            userId={profileUserId}
            filters={filters}
            refreshKey={refreshKey}
          />
          <ProfileTimeTopWorkItemsTable userId={profileUserId} filters={filters} refreshKey={refreshKey} />
          <ProfileTimeTrendChart
            workspaceSlug={slug}
            userId={profileUserId}
            filters={filters}
            refreshKey={refreshKey}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ProfileTimeRecentWorklogs userId={profileUserId} filters={filters} />
            <ProfileTimeCommentSignals workspaceSlug={slug} userId={profileUserId} filters={filters} />
          </div>
        </>
      )}
    </ContentWrapper>
  );
});
