/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import type { EIssuesStoreType, TIssue } from "@plane/types";
import { EIssuesStoreType as EStoreType } from "@plane/types";
// helpers
import { extractIssueDefaultsFromRichFilters } from "@/helpers/work-item-defaults";
// hooks
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssues } from "@/hooks/store/use-issues";
// plane web imports
import { IssueModalProvider } from "@/plane-web/components/issues/issue-modal/provider";
// local imports
import { CreateUpdateIssueModalBase } from "./base";

export interface IssuesModalProps {
  data?: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  beforeFormSubmit?: () => Promise<void>;
  onSubmit?: (res: TIssue) => Promise<void>;
  withDraftIssueWrapper?: boolean;
  storeType?: EIssuesStoreType;
  isDraft?: boolean;
  fetchIssueDetails?: boolean;
  moveToIssue?: boolean;
  modalTitle?: string;
  primaryButtonText?: {
    default: string;
    loading: string;
  };
  isProjectSelectionDisabled?: boolean;
  templateId?: string;
  allowedProjectIds?: string[];
  showActionItemsOnUpdate?: boolean;
}

export const CreateUpdateIssueModal = observer(function CreateUpdateIssueModal(props: IssuesModalProps) {
  // router params
  const { cycleId, moduleId } = useParams();
  // resolve effective store type (mirrors the logic in base.tsx)
  const issueStoreType = useIssueStoreType();
  let resolvedStoreType = props.storeType ?? issueStoreType;
  // EPIC issues share the PROJECT filter context
  if (resolvedStoreType === EStoreType.EPIC) resolvedStoreType = EStoreType.PROJECT;
  const { issuesFilter } = useIssues(resolvedStoreType);
  // derive defaults from any currently active rich-filter expression so that
  // newly created work items remain visible in the filtered view
  const filterDefaults = extractIssueDefaultsFromRichFilters(issuesFilter.issueFilters?.richFilters ?? {});
  // derived values – priority order (highest → lowest):
  //   1. explicit props.data values
  //   2. URL-param cycle/module (you are on that cycle/module page)
  //   3. active filter defaults
  const dataForPreload: Partial<TIssue> = {
    ...filterDefaults,
    ...props.data,
    cycle_id: props.data?.cycle_id ?? (cycleId ? cycleId.toString() : (filterDefaults.cycle_id ?? null)),
    module_ids: props.data?.module_ids ?? (moduleId ? [moduleId.toString()] : (filterDefaults.module_ids ?? null)),
  };

  if (!props.isOpen) return null;
  return (
    <IssueModalProvider
      templateId={props.templateId}
      dataForPreload={dataForPreload}
      allowedProjectIds={props.allowedProjectIds}
    >
      <CreateUpdateIssueModalBase {...props} />
    </IssueModalProvider>
  );
});
