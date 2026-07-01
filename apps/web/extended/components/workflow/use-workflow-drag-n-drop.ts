/* eslint-disable @typescript-eslint/no-unused-vars */
import type { TIssueGroupByOptions } from "@plane/types";

export const useWorkFlowDragNDrop = (groupBy: TIssueGroupByOptions | undefined, subGroupBy?: TIssueGroupByOptions) => ({
  workflowDisabledSource: undefined,
  isWorkflowDropDisabled: false,
  getIsWorkflowWorkItemCreationDisabled: (groupId: string, subGroupId?: string) => false,
  handleWorkFlowState: (
    sourceGroupId: string,
    destinationGroupId: string,
    sourceSubGroupId?: string,
    destinationSubGroupId?: string
  ) => {},
});

// Backward-compatible alias for older imports.
export const useWorkFlowFDragNDrop = useWorkFlowDragNDrop;
