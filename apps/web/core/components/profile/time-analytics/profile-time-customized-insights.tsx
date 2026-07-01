import { useEffect } from "react";
import { observer } from "mobx-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import type { IAnalyticsParams } from "@plane/types";
import type { TChart } from "@plane/types";
import { ChartXAxisProperty, ChartYAxisMetric } from "@plane/types";
import AnalyticsSectionWrapper from "@/components/analytics/analytics-section-wrapper";
import { AnalyticsSelectParams } from "@/components/analytics/select/analytics-params";
import AnalyticsBarChart from "@/components/analytics/work-items/analytics-bar-chart";
import { ProfileTimeAnalyticsService } from "@/services/profile-time-analytics.service";
import type { TProfileTimeFilters } from "./types";
import { filtersToQueryParams } from "./types";

const profileTimeAnalyticsService = new ProfileTimeAnalyticsService();

type Props = {
  workspaceSlug: string;
  userId: string;
  filters: TProfileTimeFilters;
  chartRefreshKey?: number;
};

export const ProfileTimeCustomizedInsights = observer(function ProfileTimeCustomizedInsights({
  workspaceSlug,
  userId,
  filters,
  chartRefreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const { control, watch, setValue } = useForm<IAnalyticsParams>({
    defaultValues: {
      x_axis: ChartXAxisProperty.LOGGED_DAY_OF_WEEK,
      y_axis: ChartYAxisMetric.HOURS_LOGGED,
      group_by: ChartXAxisProperty.WORK_ITEMS,
    },
  });

  const params = {
    x_axis: watch("x_axis"),
    y_axis: watch("y_axis"),
    group_by: watch("group_by"),
  };

  const watchedYAxis = params.y_axis;
  useEffect(() => {
    if (watchedYAxis === ChartYAxisMetric.HOURS_LOGGED) {
      if (params.x_axis !== ChartXAxisProperty.LOGGED_DAY_OF_WEEK) {
        setValue("x_axis", ChartXAxisProperty.LOGGED_DAY_OF_WEEK);
      }
      if (params.group_by !== ChartXAxisProperty.WORK_ITEMS) {
        setValue("group_by", ChartXAxisProperty.WORK_ITEMS);
      }
    }
  }, [watchedYAxis, params.x_axis, params.group_by, setValue]);

  const query = filtersToQueryParams(filters);
  const swrKey = `profile-time-chart-${workspaceSlug}-${userId}-${filters.dateFilter}-${filters.projectIds.join(",")}-${params.x_axis}-${params.group_by}-${chartRefreshKey}`;

  return (
    <div data-testid="profile-time-customized-insights">
      <AnalyticsSectionWrapper
        title={t("workspace_analytics.customized_insights")}
        className="col-span-1"
        actions={
          <AnalyticsSelectParams control={control} setValue={setValue} params={params} workspaceSlug={workspaceSlug} />
        }
      >
        <AnalyticsBarChart
          x_axis={params.x_axis}
          y_axis={params.y_axis}
          group_by={params.group_by}
          swrKey={swrKey}
          fetchChart={async (): Promise<TChart> =>
            (await profileTimeAnalyticsService.getCharts(workspaceSlug, userId, {
              ...query,
              x_axis: params.x_axis,
              y_axis: params.y_axis,
              group_by: params.group_by,
            })) as TChart
          }
          onExportCsv={async () => {
            const blob = await profileTimeAnalyticsService.exportCsv(workspaceSlug, userId, query);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `hours-logged-${userId}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
          }}
        />
      </AnalyticsSectionWrapper>
    </div>
  );
});
