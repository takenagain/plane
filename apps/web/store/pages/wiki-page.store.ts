import { unset, set } from "lodash-es";
import { makeObservable, observable, runInAction, action, reaction, computed } from "mobx";
import { computedFn } from "mobx-utils";
import { EUserPermissions } from "@plane/constants";
import type { TPage, TPageFilters, TPageNavigationTabs } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { filterPagesByPageType, getPageName, orderPages, shouldFilterPage } from "@plane/utils";
import type { RootStore } from "@/plane-web/store/root.store";
import { WikiPageService } from "@/services/page/wiki-page.service";
import type { CoreRootStore } from "../root.store";
import type { IProjectPageStore } from "./project-page.store";
import { WikiPage } from "./wiki-page";

type TLoader = "init-loader" | "mutation-loader" | undefined;

type TError = { title: string; description: string };

const ROLE_PERMISSIONS_TO_CREATE_WIKI_PAGE = new Set([
  EUserPermissions.ADMIN,
  EUserPermissions.MEMBER,
  EUserWorkspaceRoles.ADMIN,
  EUserWorkspaceRoles.MEMBER,
]);

export class WikiPageStore implements IProjectPageStore {
  loader: TLoader = "init-loader";
  data: Record<string, WikiPage> = {};
  error: TError | undefined = undefined;
  filters: TPageFilters = {
    searchQuery: "",
    sortKey: "updated_at",
    sortBy: "desc",
  };
  service: WikiPageService;
  rootStore: CoreRootStore;

  constructor(private store: RootStore) {
    makeObservable(this, {
      loader: observable.ref,
      data: observable,
      error: observable,
      filters: observable,
      isAnyPageAvailable: computed,
      canCurrentUserCreatePage: computed,
      updateFilters: action,
      clearAllFilters: action,
      fetchPagesList: action,
      fetchPageDetails: action,
      createPage: action,
      removePage: action,
      movePage: action,
    });
    this.rootStore = store;
    this.service = new WikiPageService();
    reaction(
      () => this.store.router.workspaceSlug,
      () => {
        this.filters.searchQuery = "";
      }
    );
  }

  get isAnyPageAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  get canCurrentUserCreatePage() {
    const { workspaceSlug } = this.store.router;
    const workspaceRole = this.store.user.permission.getWorkspaceRoleByWorkspaceSlug(workspaceSlug?.toString() || "");
    return !!workspaceRole && ROLE_PERMISSIONS_TO_CREATE_WIKI_PAGE.has(workspaceRole);
  }

  getCurrentProjectPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const pagesByType = filterPagesByPageType(pageType, Object.values(this.data || {}));
    return pagesByType.map((page) => page.id) as string[];
  });

  getCurrentProjectPageIds = computedFn((_projectId: string) => {
    return Object.values(this.data || {}).map((page) => page.id) as string[];
  });

  getCurrentProjectFilteredPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const pagesByType = filterPagesByPageType(pageType, Object.values(this.data || {}));
    let filteredPages = pagesByType.filter(
      (p) =>
        getPageName(p.name).toLowerCase().includes(this.filters.searchQuery.toLowerCase()) &&
        shouldFilterPage(p, this.filters.filters)
    );
    filteredPages = orderPages(filteredPages, this.filters.sortKey, this.filters.sortBy);
    return filteredPages.map((page) => page.id) as string[];
  });

  getPageById = computedFn((pageId: string) => this.data?.[pageId] || undefined);

  updateFilters = <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => {
    runInAction(() => {
      set(this.filters, [filterKey], filterValue);
    });
  };

  clearAllFilters = () =>
    runInAction(() => {
      set(this.filters, ["filters"], {});
    });

  fetchPagesList = async (workspaceSlug: string, _projectId?: string, _pageType?: TPageNavigationTabs) => {
    try {
      if (!workspaceSlug) return undefined;

      runInAction(() => {
        this.loader = Object.keys(this.data).length > 0 ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const pages = await this.service.fetchAll(workspaceSlug);
      runInAction(() => {
        for (const page of pages) {
          if (page?.id) {
            const existingPage = this.getPageById(page.id);
            if (existingPage) {
              const { name: _name, ...otherFields } = page;
              existingPage.mutateProperties(otherFields, false);
            } else {
              set(this.data, [page.id], new WikiPage(this.store, page));
            }
          }
        }
        this.loader = undefined;
      });

      return pages;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the pages, Please try again later.",
        };
      });
      throw error;
    }
  };

  fetchPageDetails = async (
    workspaceSlug: string,
    _projectId: string,
    pageId: string,
    options?: { trackVisit?: boolean }
  ) => {
    const { trackVisit } = options || {};
    try {
      if (!workspaceSlug || !pageId) return undefined;

      const currentPageId = this.getPageById(pageId);
      runInAction(() => {
        this.loader = currentPageId ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const page = await this.service.fetchById(workspaceSlug, pageId, trackVisit ?? true);

      runInAction(() => {
        if (page?.id) {
          const pageInstance = this.getPageById(page.id);
          if (pageInstance) {
            pageInstance.mutateProperties(page, false);
          } else {
            set(this.data, [page.id], new WikiPage(this.store, page));
          }
        }
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the page, Please try again later.",
        };
      });
      throw error;
    }
  };

  createPage = async (pageData: Partial<TPage>) => {
    try {
      const { workspaceSlug } = this.store.router;
      if (!workspaceSlug) return undefined;

      runInAction(() => {
        this.loader = "mutation-loader";
        this.error = undefined;
      });

      const page = await this.service.create(workspaceSlug, pageData);
      runInAction(() => {
        if (page?.id) set(this.data, [page.id], new WikiPage(this.store, page));
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to create a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  removePage = async ({ pageId }: { pageId: string; shouldSync?: boolean }) => {
    try {
      const { workspaceSlug } = this.store.router;
      if (!workspaceSlug || !pageId) return undefined;

      await this.service.remove(workspaceSlug, pageId);
      runInAction(() => {
        unset(this.data, [pageId]);
        if (this.rootStore.favorite.entityMap[pageId]) this.rootStore.favorite.removeFavoriteFromStore(pageId);
      });
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to delete a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  movePage = async () => {
    throw new Error("Wiki pages cannot be moved to a project in MVP.");
  };
}
