import type { IProjectViewIssuesFilter } from "@/store/issue/project-views";
import { ProjectViewIssuesFilter } from "@/store/issue/project-views";
import type { IIssueRootStore } from "@/store/issue/root.store";

// @ts-nocheck - This class will never be used, extending similar class to avoid type errors
export type ITeamViewIssuesFilter = IProjectViewIssuesFilter;

// @ts-nocheck - This class will never be used, extending similar class to avoid type errors
export class TeamViewIssuesFilter extends ProjectViewIssuesFilter implements IProjectViewIssuesFilter {
  // oxlint-disable-next-line no-useless-constructor -- pass-through to parent for typing
  constructor(_rootStore: IIssueRootStore) {
    super(_rootStore);
  }
}
