// store
import { CoreRootStore } from "@/store/root.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";
import type { IWorklogStore } from "./worklog.store";
import { WorklogStore } from "./worklog.store";

export class RootStore extends CoreRootStore {
  timelineStore: ITimelineStore;
  worklogStore: IWorklogStore;

  constructor() {
    super();

    this.timelineStore = new TimeLineStore(this);
    this.worklogStore = new WorklogStore();
  }
}
