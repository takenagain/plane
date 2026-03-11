/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TIssueTimeTrackingActions = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  isIntakeIssue?: boolean;
  className?: string;
};

export function IssueTimeTrackingActions(_props: TIssueTimeTrackingActions) {
  return <></>;
}
