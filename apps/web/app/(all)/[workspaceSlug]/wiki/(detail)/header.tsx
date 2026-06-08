import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageIcon } from "@plane/propel/icons";
import type { ICustomSearchSelectOption } from "@plane/types";
import { Breadcrumbs, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
import { getPageName } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageAccessIcon } from "@/components/common/page-access-icon";
import { SwitcherLabel } from "@/components/common/switcher-label";
import { PageHeaderActions } from "@/components/pages/header/actions";
import { PageSyncingBadge } from "@/components/pages/header/syncing-badge";
import { useAppRouter } from "@/hooks/use-app-router";
import { PageDetailsHeaderExtraActions } from "@/plane-web/components/pages";
import { EPageStoreType, usePage, usePageStore } from "@/plane-web/hooks/store";

const storeType = EPageStoreType.WIKI;

export const WikiPageDetailsHeader = observer(function WikiPageDetailsHeader() {
  const router = useAppRouter();
  const { workspaceSlug, pageId } = useParams();
  const { getPageById, getCurrentProjectPageIds } = usePageStore(storeType);
  const page = usePage({ pageId: pageId?.toString() ?? "", storeType });

  const pageIds = getCurrentProjectPageIds("");
  const switcherOptions: ICustomSearchSelectOption[] =
    pageIds?.map((id) => {
      const pageOption = getPageById(id);
      return {
        value: id,
        query: getPageName(pageOption?.name),
        content: (
          <SwitcherLabel
            logo_props={pageOption?.logo_props}
            name={getPageName(pageOption?.name)}
            LabelIcon={PageIcon}
          />
        ),
      };
    }) ?? [];

  if (!page) return null;

  const { name } = page;

  return (
    <Header>
      <Header.LeftItem>
        <div>
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Wiki"
                  href={`/${workspaceSlug}/wiki`}
                  icon={<PageIcon className="h-4 w-4 text-tertiary" />}
                />
              }
            />
            <Breadcrumbs.Item
              component={
                <BreadcrumbNavigationSearchDropdown
                  selectedItem={pageId?.toString() ?? ""}
                  navigationItems={switcherOptions}
                  onChange={(val: string) => router.push(`/${workspaceSlug}/wiki/${val}`)}
                  title={getPageName(name)}
                  icon={<PageAccessIcon {...page} />}
                />
              }
            />
          </Breadcrumbs>
          <PageSyncingBadge syncStatus={"isSyncingWithServer" in page ? page.isSyncingWithServer : "synced"} />
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        <PageHeaderActions page={page} storeType={storeType} />
        <PageDetailsHeaderExtraActions page={page} storeType={storeType} />
      </Header.RightItem>
    </Header>
  );
});
