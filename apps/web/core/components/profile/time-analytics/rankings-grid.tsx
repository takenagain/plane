import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Card, ECardDirection, ECardSpacing, Loader } from "@plane/ui";
import type { TProfileTimeRankingDimension } from "@plane/types";
import { ProfileTimeAnalyticsService } from "@/services/profile-time-analytics.service";
import type { TProfileTimeFilters } from "./types";
import { filtersToQueryParams } from "./types";

const profileTimeAnalyticsService = new ProfileTimeAnalyticsService();

type Props = {
  workspaceSlug: string;
  userId: string;
  filters: TProfileTimeFilters;
  refreshKey?: number;
};

function RankingCard({
  title,
  dimension,
  workspaceSlug,
  userId,
  filters,
  refreshKey,
}: {
  title: string;
  dimension: TProfileTimeRankingDimension;
  workspaceSlug: string;
  userId: string;
  filters: TProfileTimeFilters;
  refreshKey: number;
}) {
  const query = filtersToQueryParams(filters);
  const { data, isLoading } = useSWR(
    `profile-time-ranking-${dimension}-${workspaceSlug}-${userId}-${filters.dateFilter}-${refreshKey}`,
    () => profileTimeAnalyticsService.getRankings(workspaceSlug, userId, dimension, { ...query, limit: 10 })
  );

  return (
    <Card direction={ECardDirection.COLUMN} spacing={ECardSpacing.SM} className="h-full">
      <h3 className="text-14 font-medium">{title}</h3>
      {isLoading ? (
        <Loader className="space-y-2">
          <Loader.Item height="24px" />
          <Loader.Item height="24px" />
        </Loader>
      ) : (
        <ul className="space-y-2">
          {(data?.items ?? []).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-13">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-secondary">
                {item.hours}h ({item.percent_of_total}%)
              </span>
            </li>
          ))}
          {(!data?.items || data.items.length === 0) && <li className="text-caption-sm-regular text-tertiary">—</li>}
        </ul>
      )}
    </Card>
  );
}

export const ProfileTimeRankingsGrid = observer(function ProfileTimeRankingsGrid({
  workspaceSlug,
  userId,
  filters,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <RankingCard
        title={t("profile.time_analytics.rankings.projects")}
        dimension="project"
        workspaceSlug={workspaceSlug}
        userId={userId}
        filters={filters}
        refreshKey={refreshKey}
      />
      <RankingCard
        title={t("profile.time_analytics.rankings.modules")}
        dimension="module"
        workspaceSlug={workspaceSlug}
        userId={userId}
        filters={filters}
        refreshKey={refreshKey}
      />
      <RankingCard
        title={t("profile.time_analytics.rankings.cycles")}
        dimension="cycle"
        workspaceSlug={workspaceSlug}
        userId={userId}
        filters={filters}
        refreshKey={refreshKey}
      />
    </div>
  );
});
