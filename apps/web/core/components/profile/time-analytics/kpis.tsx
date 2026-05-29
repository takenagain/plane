import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Card, ECardDirection, ECardSpacing, Loader } from "@plane/ui";
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

export const ProfileTimeKpis = observer(function ProfileTimeKpis({
  workspaceSlug,
  userId,
  filters,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const query = filtersToQueryParams(filters);

  const { data, isLoading } = useSWR(
    `profile-time-summary-${workspaceSlug}-${userId}-${filters.dateFilter}-${filters.projectIds.join(",")}-${refreshKey}`,
    () => profileTimeAnalyticsService.getSummary(workspaceSlug, userId, query)
  );

  if (isLoading) {
    return (
      <Loader className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Loader.Item height="80px" />
        <Loader.Item height="80px" />
        <Loader.Item height="80px" />
        <Loader.Item height="80px" />
      </Loader>
    );
  }

  if (!data) return null;

  const deltaLabel = data.delta_percent === null ? "—" : `${data.delta_percent > 0 ? "+" : ""}${data.delta_percent}%`;

  const cards = [
    {
      title: t("profile.time_analytics.kpis.total_hours"),
      value: data.total_hours.toFixed(1),
      hint: t("profile.time_analytics.kpis.vs_previous", { delta: deltaLabel }),
    },
    {
      title: t("profile.time_analytics.kpis.avg_per_day"),
      value: data.avg_hours_per_day.toFixed(1),
      hint: null,
    },
    {
      title: t("profile.time_analytics.kpis.worklogs"),
      value: String(data.worklog_count),
      hint: null,
    },
    {
      title: t("profile.time_analytics.kpis.active_timers"),
      value: String(data.active_timer_count),
      hint: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="profile-time-kpis">
      {cards.map((card) => (
        <Card key={card.title} direction={ECardDirection.COLUMN} spacing={ECardSpacing.SM}>
          <p className="text-13 text-placeholder">{card.title}</p>
          <p className="text-24 font-semibold">{card.value}</p>
          {card.hint && <p className="text-caption-sm-regular text-tertiary">{card.hint}</p>}
        </Card>
      ))}
    </div>
  );
});
