import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import type { TPageNavigationTabs } from "@plane/types";
import { PageHead } from "@/components/core/page-title";
import { PagesListRoot } from "@/components/pages/list/root";
import { PagesListView } from "@/components/pages/pages-list-view";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { EPageStoreType } from "@/plane-web/hooks/store";
import type { Route } from "./+types/page";

const getPageType = (pageType?: string | null): TPageNavigationTabs => {
  if (pageType === "private") return "private";
  if (pageType === "archived") return "archived";
  return "public";
};

function WikiPagesPage({ params }: Route.ComponentProps) {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const { workspaceSlug } = params;
  const { getWorkspaceBySlug } = useWorkspace();
  const workspace = getWorkspaceBySlug(workspaceSlug);
  const pageTitle = workspace?.name ? `${workspace.name} - Wiki` : undefined;
  const pageType = getPageType(type);

  return (
    <>
      <PageHead title={pageTitle} />
      <PagesListView pageType={pageType} storeType={EPageStoreType.WIKI} workspaceSlug={workspaceSlug}>
        <PagesListRoot pageType={pageType} storeType={EPageStoreType.WIKI} />
      </PagesListView>
    </>
  );
}

export default observer(WikiPagesPage);
