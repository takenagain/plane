/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useEffect } from "react";
import { observer } from "mobx-react";
import { StoreContext } from "@/lib/store-context";
import { FloatingTimeTrackingFOB } from "./floating-time-tracking-fob";

type TGlobalTimeTrackingFOBRootProps = {
  workspaceSlug: string;
};

export const GlobalTimeTrackingFOBRoot = observer(function GlobalTimeTrackingFOBRoot(
  props: TGlobalTimeTrackingFOBRootProps
) {
  const { workspaceSlug } = props;
  const rootStore = useContext(StoreContext);
  const { worklogStore } = rootStore;

  useEffect(() => {
    if (!workspaceSlug) return;
    void worklogStore.fetchActiveWorklog(workspaceSlug).catch(() => undefined);
  }, [workspaceSlug, worklogStore]);

  const activeWorklog = worklogStore.activeWorklog;
  const displayedIssueId = activeWorklog?.issue;

  if (!activeWorklog) return null;

  return (
    <FloatingTimeTrackingFOB
      activeWorklog={activeWorklog}
      currentWorklogTarget={null}
      totalMinutes={displayedIssueId ? (worklogStore.totalByIssue[displayedIssueId] ?? 0) : 0}
    />
  );
});
