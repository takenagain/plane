import { computed, makeObservable } from "mobx";
import { computedFn } from "mobx-utils";
import { EPageAccess, EUserPermissions } from "@plane/constants";
import type { TPage } from "@plane/types";
import type { RootStore } from "@/plane-web/store/root.store";
import { WikiPageService } from "@/services/page/wiki-page.service";
import { BasePage } from "./base-page";
import type { TPageInstance } from "./base-page";

const wikiPageService = new WikiPageService();

export type TWikiPage = TPageInstance;

export class WikiPage extends BasePage implements TWikiPage {
  constructor(store: RootStore, page: TPage) {
    const { workspaceSlug } = store.router;

    super(store, page, {
      update: async (payload) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await wikiPageService.update(workspaceSlug, page.id, payload);
      },
      updateDescription: async (document) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await wikiPageService.updateDescription(workspaceSlug, page.id, document);
      },
      updateAccess: async (payload) => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await wikiPageService.updateAccess(workspaceSlug, page.id, payload);
      },
      lock: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await wikiPageService.lock(workspaceSlug, page.id);
      },
      unlock: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await wikiPageService.unlock(workspaceSlug, page.id);
      },
      archive: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        return await wikiPageService.archive(workspaceSlug, page.id);
      },
      restore: async () => {
        if (!workspaceSlug || !page.id) throw new Error("Missing required fields.");
        await wikiPageService.restore(workspaceSlug, page.id);
      },
      duplicate: async () => {
        throw new Error("Wiki page duplicate is not supported in MVP.");
      },
    });

    makeObservable(this, {
      canCurrentUserAccessPage: computed,
      canCurrentUserEditPage: computed,
      canCurrentUserDuplicatePage: computed,
      canCurrentUserLockPage: computed,
      canCurrentUserChangeAccess: computed,
      canCurrentUserArchivePage: computed,
      canCurrentUserDeletePage: computed,
      canCurrentUserFavoritePage: computed,
      canCurrentUserMovePage: computed,
      isContentEditable: computed,
    });
  }

  private getWorkspaceRole = computedFn((): EUserPermissions | undefined => {
    const { workspaceSlug } = this.rootStore.router;
    if (!workspaceSlug) return;
    return this.rootStore.user.permission.getWorkspaceRoleByWorkspaceSlug(workspaceSlug.toString()) as
      | EUserPermissions
      | undefined;
  });

  get canCurrentUserAccessPage() {
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return isPagePublic || this.isCurrentUserOwner;
  }

  get canCurrentUserEditPage() {
    const role = this.getWorkspaceRole();
    const isPagePublic = this.access === EPageAccess.PUBLIC;
    return (isPagePublic && !!role && role >= EUserPermissions.MEMBER) || (!isPagePublic && this.isCurrentUserOwner);
  }

  get canCurrentUserDuplicatePage() {
    const role = this.getWorkspaceRole();
    return !!role && role >= EUserPermissions.MEMBER;
  }

  get canCurrentUserLockPage() {
    const role = this.getWorkspaceRole();
    return this.isCurrentUserOwner || role === EUserPermissions.ADMIN;
  }

  get canCurrentUserChangeAccess() {
    const role = this.getWorkspaceRole();
    return this.isCurrentUserOwner || role === EUserPermissions.ADMIN;
  }

  get canCurrentUserArchivePage() {
    const role = this.getWorkspaceRole();
    return this.isCurrentUserOwner || role === EUserPermissions.ADMIN;
  }

  get canCurrentUserDeletePage() {
    const role = this.getWorkspaceRole();
    return this.isCurrentUserOwner || role === EUserPermissions.ADMIN;
  }

  get canCurrentUserFavoritePage() {
    const role = this.getWorkspaceRole();
    return !!role && role >= EUserPermissions.MEMBER;
  }

  get canCurrentUserMovePage() {
    return false;
  }

  get isContentEditable() {
    const role = this.getWorkspaceRole();
    const isOwner = this.isCurrentUserOwner;
    const isPublic = this.access === EPageAccess.PUBLIC;
    const isArchived = this.archived_at;
    const isLocked = this.is_locked;

    return !isArchived && !isLocked && (isOwner || (isPublic && !!role && role >= EUserPermissions.MEMBER));
  }

  getRedirectionLink = computedFn(() => {
    const { workspaceSlug } = this.rootStore.router;
    return `/${workspaceSlug}/wiki/${this.id}`;
  });
}
