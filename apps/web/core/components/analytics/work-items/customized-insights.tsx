/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
// plane package imports
import { useTranslation } from "@plane/i18n";
import type { IAnalyticsParams } from "@plane/types";
import { ChartXAxisProperty, ChartYAxisMetric } from "@plane/types";
import { cn } from "@plane/utils";
// plane web components
import AnalyticsSectionWrapper from "../analytics-section-wrapper";
import { AnalyticsSelectParams } from "../select/analytics-params";
import AnalyticsBarChart from "./analytics-bar-chart";

const CustomizedInsights = observer(function CustomizedInsights({
  peekView,
  isEpic,
}: {
  peekView?: boolean;
  isEpic?: boolean;
}) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { control, watch, setValue } = useForm<IAnalyticsParams>({
    defaultValues: {
      x_axis: ChartXAxisProperty.PRIORITY,
      y_axis: isEpic ? ChartYAxisMetric.EPIC_WORK_ITEM_COUNT : ChartYAxisMetric.WORK_ITEM_COUNT,
    },
  });

  const params = {
    x_axis: watch("x_axis"),
    y_axis: watch("y_axis"),
    group_by: watch("group_by"),
  };

  // when the user selects Hours logged we want sensible defaults
  const watchedYAxis = params.y_axis;
  useEffect(() => {
    if (watchedYAxis === ChartYAxisMetric.HOURS_LOGGED) {
      setValue("x_axis", ChartXAxisProperty.LOGGED_DAY_OF_WEEK);
      setValue("group_by", ChartXAxisProperty.WORK_ITEMS);
      return;
    }

    if (
      params.x_axis === ChartXAxisProperty.LOGGED_DAY_OF_WEEK ||
      params.x_axis === ChartXAxisProperty.WORK_ITEMS
    ) {
      setValue("x_axis", ChartXAxisProperty.PRIORITY);
    }

    if (
      params.group_by === ChartXAxisProperty.LOGGED_DAY_OF_WEEK ||
      params.group_by === ChartXAxisProperty.WORK_ITEMS
    ) {
      setValue("group_by", undefined);
    }
  }, [watchedYAxis, params.x_axis, params.group_by, setValue]);

  return (
    <AnalyticsSectionWrapper
      title={t("workspace_analytics.customized_insights")}
      className="col-span-1"
      headerClassName={cn(peekView ? "flex-col items-start" : "")}
      actions={
        <AnalyticsSelectParams
          control={control}
          setValue={setValue}
          params={params}
          workspaceSlug={workspaceSlug.toString()}
          isEpic={isEpic}
        />
      }
    >
      <AnalyticsBarChart x_axis={params.x_axis} y_axis={params.y_axis} group_by={params.group_by} />
    </AnalyticsSectionWrapper>
  );
});

export default CustomizedInsights;
