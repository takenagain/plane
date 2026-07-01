import { useMemo } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { CHART_COLOR_PALETTES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { Card, ECardDirection, ECardSpacing, Loader } from "@plane/ui";
import type { TChart } from "@plane/types";
import { ChartXAxisProperty, ChartYAxisMetric } from "@plane/types";
import { parseChartData } from "@/components/chart/utils";
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

export const ProfileTimeTrendChart = observer(function ProfileTimeTrendChart({
  workspaceSlug,
  userId,
  filters,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const query = filtersToQueryParams(filters);

  const { data, isLoading } = useSWR(
    `profile-time-trend-${workspaceSlug}-${userId}-${filters.dateFilter}-${refreshKey}`,
    () =>
      profileTimeAnalyticsService.getCharts(workspaceSlug, userId, {
        ...query,
        x_axis: ChartXAxisProperty.CREATED_AT,
        y_axis: ChartYAxisMetric.HOURS_LOGGED,
      })
  );

  const parsed = useMemo(
    () => (data ? parseChartData(data as TChart, ChartXAxisProperty.CREATED_AT, undefined, undefined) : null),
    [data]
  );

  const baseColors = CHART_COLOR_PALETTES[0]?.[resolvedTheme === "dark" ? "dark" : "light"];

  return (
    <Card direction={ECardDirection.COLUMN} spacing={ECardSpacing.SM}>
      <h3 className="text-14 font-medium">{t("profile.time_analytics.trend_title")}</h3>
      {isLoading ? (
        <Loader>
          <Loader.Item height="280px" />
        </Loader>
      ) : parsed?.data && parsed.data.length > 0 ? (
        <BarChart
          className="h-[280px] w-full"
          data={parsed.data}
          bars={[
            {
              key: "count",
              label: "Hours",
              stackId: "trend",
              fill: baseColors?.[0] ?? "#4f46e5",
              textClassName: "",
            },
          ]}
          xAxis={{ key: "name", label: t("profile.time_analytics.trend_x") }}
          yAxis={{ key: "count", label: t("profile.time_analytics.kpis.total_hours") }}
        />
      ) : (
        <p className="text-caption-sm-regular text-tertiary">{t("profile.time_analytics.empty.description")}</p>
      )}
    </Card>
  );
});
