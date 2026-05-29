import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Card, ECardDirection, ECardSpacing, Loader } from "@plane/ui";
import { ProfileTimeAnalyticsService } from "@/services/profile-time-analytics.service";
import type { TProfileTimeFilters } from "./types";
import { filtersToQueryParams } from "./types";

const profileTimeAnalyticsService = new ProfileTimeAnalyticsService();

type Props = {
  userId: string;
  filters: TProfileTimeFilters;
  refreshKey?: number;
};

export const ProfileTimeTopWorkItemsTable = observer(function ProfileTimeTopWorkItemsTable({
  userId,
  filters,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const query = filtersToQueryParams(filters);

  const { data, isLoading } = useSWR(
    `profile-time-work-items-${slug}-${userId}-${filters.dateFilter}-${refreshKey}`,
    () => profileTimeAnalyticsService.getRankings(slug, userId, "work_item", { ...query, limit: 10 })
  );

  return (
    <Card direction={ECardDirection.COLUMN} spacing={ECardSpacing.SM}>
      <h3 className="text-14 font-medium">{t("profile.time_analytics.top_work_items")}</h3>
      {isLoading ? (
        <Loader className="space-y-2">
          <Loader.Item height="28px" />
          <Loader.Item height="28px" />
        </Loader>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-13">
            <thead>
              <tr className="text-placeholder">
                <th className="pb-2 font-medium">{t("profile.time_analytics.table.work_item")}</th>
                <th className="pb-2 text-right font-medium">{t("profile.time_analytics.table.hours")}</th>
                <th className="pb-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((item) => (
                <tr key={item.id} className="border-t border-subtle">
                  <td className="py-2">
                    <a
                      href={
                        item.meta?.project_id
                          ? `/${slug}/projects/${item.meta.project_id}/issues/${item.id}`
                          : undefined
                      }
                      className="hover:text-primary"
                    >
                      {item.meta?.identifier ? `${item.meta.identifier} · ` : ""}
                      {item.name}
                    </a>
                  </td>
                  <td className="py-2 text-right">{item.hours}</td>
                  <td className="py-2 text-right">{item.percent_of_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
});
