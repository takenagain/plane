/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { xor } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// icons
import { Paperclip, RefreshCw } from "lucide-react";
// i18n
import { useTranslation } from "@plane/i18n";
import { LinkIcon, StartDatePropertyIcon, ViewsIcon, DueDatePropertyIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue, IIssueDisplayProperties, TIssuePriorities, TIssueRecurrencePattern } from "@plane/types";
import { CustomSelect, Input } from "@plane/ui";
// ui
import { REPEAT_OPTIONS, TEST_REPEAT_OPTIONS } from "@/constants/recurrence";
import {
  cn,
  getDate,
  renderFormattedPayloadDate,
  generateWorkItemLink,
  shouldHighlightIssueDueDate,
} from "@plane/utils";
// components
import { CycleDropdown } from "@/components/dropdowns/cycle";
import { DateDropdown } from "@/components/dropdowns/date";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { EstimateDropdown } from "@/components/dropdowns/estimate";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useAppRouter } from "@/hooks/use-app-router";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { usePlatformOS } from "@/hooks/use-platform-os";
// local components
import { IssuePropertyLabels } from "./labels";
import { WithDisplayPropertiesHOC } from "./with-display-properties-HOC";

export interface IIssueProperties {
  issue: TIssue;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  displayProperties: IIssueDisplayProperties | undefined;
  isReadOnly: boolean;
  className: string;
  activeLayout: string;
  isEpic?: boolean;
}

type TIssueRecurrenceInlineControlsProps = {
  issue: TIssue;
  updateIssue: IIssueProperties["updateIssue"];
  isReadOnly: boolean;
  handleEventPropagation: (e: SyntheticEvent<HTMLDivElement>) => void;
};

const IssueRecurrenceInlineControls = observer(function IssueRecurrenceInlineControls(
  props: TIssueRecurrenceInlineControlsProps
) {
  const { issue, updateIssue, isReadOnly, handleEventPropagation } = props;
  const [maxRepetitionsValue, setMaxRepetitionsValue] = useState(issue.recurrence_max_occurrences?.toString() ?? "");
  const [maxRepetitionsError, setMaxRepetitionsError] = useState(false);

  const allowTestRepeatOptions = process.env.NODE_ENV !== "production";
  const repeatOptions = allowTestRepeatOptions ? [...REPEAT_OPTIONS, ...TEST_REPEAT_OPTIONS] : REPEAT_OPTIONS;
  const selectedRepeatOption =
    repeatOptions.find((option) => option.value === issue.recurrence_pattern) ?? REPEAT_OPTIONS[0];
  const isDueDateMissing = !issue.target_date;
  const isRepeatDisabled = isReadOnly || !updateIssue || isDueDateMissing;
  const isMaxRepetitionsDisabled = isReadOnly || !updateIssue || !issue.recurrence_pattern;

  useEffect(() => {
    setMaxRepetitionsValue(issue.recurrence_max_occurrences?.toString() ?? "");
    setMaxRepetitionsError(false);
  }, [issue.recurrence_max_occurrences]);

  const handleRepeatChange = async (value: TIssueRecurrencePattern | null) => {
    if (!updateIssue) return;

    if (!value) {
      setMaxRepetitionsValue("");
      setMaxRepetitionsError(false);
      await updateIssue(issue.project_id, issue.id, {
        recurrence_pattern: null,
        recurrence_max_occurrences: null,
      });
      return;
    }

    await updateIssue(issue.project_id, issue.id, { recurrence_pattern: value });
  };

  const commitMaxRepetitions = async () => {
    if (!updateIssue || isMaxRepetitionsDisabled) return;

    const trimmedValue = maxRepetitionsValue.trim();
    if (!trimmedValue) {
      setMaxRepetitionsError(false);
      await updateIssue(issue.project_id, issue.id, { recurrence_max_occurrences: null });
      return;
    }

    const parsedValue = Number(trimmedValue);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      setMaxRepetitionsError(true);
      return;
    }

    setMaxRepetitionsError(false);
    await updateIssue(issue.project_id, issue.id, { recurrence_max_occurrences: parsedValue });
  };

  return (
    <>
      <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
        <CustomSelect
          value={issue.recurrence_pattern}
          onChange={handleRepeatChange}
          disabled={isRepeatDisabled}
          label={
            <div className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3 flex-shrink-0" />
              <span
                className={cn("text-caption-sm-regular", {
                  "text-placeholder": !issue.recurrence_pattern,
                })}
              >
                {isDueDateMissing ? "Repeat" : selectedRepeatOption.label}
              </span>
            </div>
          }
          buttonClassName="h-5 rounded-md border-subtle-1 px-1.5 py-0.5"
        >
          {repeatOptions.map((option) => (
            <CustomSelect.Option key={option.value ?? "none"} value={option.value}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>

      <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
        <div
          className={cn("flex h-5 items-center rounded-md border border-subtle-1 px-1.5", {
            "border-danger-primary": maxRepetitionsError,
          })}
        >
          <Input
            type="number"
            min={1}
            mode="true-transparent"
            inputSize="xs"
            value={maxRepetitionsValue}
            onChange={(event) => {
              setMaxRepetitionsValue(event.target.value);
              if (maxRepetitionsError) setMaxRepetitionsError(false);
            }}
            onBlur={commitMaxRepetitions}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitMaxRepetitions();
              }
            }}
            disabled={isMaxRepetitionsDisabled}
            placeholder={isDueDateMissing ? "Max" : "Infinite"}
            className="w-20 px-0 text-caption-sm-regular"
          />
        </div>
      </div>
    </>
  );
});

const handleEventPropagation = (e: SyntheticEvent<HTMLDivElement>) => {
  e.stopPropagation();
  e.preventDefault();
};

export const IssueProperties = observer(function IssueProperties(props: IIssueProperties) {
  const { issue, updateIssue, displayProperties, isReadOnly, className, isEpic = false } = props;

  // i18n
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { labelMap } = useLabel();
  const storeType = useIssueStoreType();
  const {
    issues: { changeModulesInIssue },
  } = useIssues(storeType);
  const {
    issues: { addCycleToIssue, removeCycleFromIssue },
  } = useIssues(storeType);
  const { areEstimateEnabledByProjectId } = useProjectEstimates();
  const { getStateById } = useProjectState();
  const { isMobile } = usePlatformOS();
  const projectDetails = getProjectById(issue.project_id);

  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();

  // derived values
  const stateDetails = getStateById(issue.state_id);
  const subIssueCount = issue?.sub_issues_count ?? 0;

  const issueOperations = useMemo(
    () => ({
      addModulesToIssue: async (moduleIds: string[]) => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await changeModulesInIssue?.(workspaceSlug.toString(), issue.project_id, issue.id, moduleIds, []);
      },
      removeModulesFromIssue: async (moduleIds: string[]) => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await changeModulesInIssue?.(workspaceSlug.toString(), issue.project_id, issue.id, [], moduleIds);
      },
      addIssueToCycle: async (cycleId: string) => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await addCycleToIssue?.(workspaceSlug.toString(), issue.project_id, cycleId, issue.id);
      },
      removeIssueFromCycle: async () => {
        if (!workspaceSlug || !issue.project_id || !issue.id) return;
        await removeCycleFromIssue?.(workspaceSlug.toString(), issue.project_id, issue.id);
      },
    }),
    [workspaceSlug, issue, changeModulesInIssue, addCycleToIssue, removeCycleFromIssue]
  );

  const handleState = async (stateId: string) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { state_id: stateId });
  };

  const handlePriority = async (value: TIssuePriorities) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { priority: value });
  };

  const handleLabel = async (ids: string[]) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { label_ids: ids });
  };

  const handleAssignee = async (ids: string[]) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { assignee_ids: ids });
  };

  const handleModule = useCallback(
    (moduleIds: string[] | null) => {
      if (!issue || !issue.module_ids || !moduleIds) return;

      const updatedModuleIds = xor(issue.module_ids, moduleIds);
      const modulesToAdd: string[] = [];
      const modulesToRemove: string[] = [];
      for (const moduleId of updatedModuleIds)
        if (issue.module_ids.includes(moduleId)) modulesToRemove.push(moduleId);
        else modulesToAdd.push(moduleId);
      if (modulesToAdd.length > 0) issueOperations.addModulesToIssue(modulesToAdd);
      if (modulesToRemove.length > 0) issueOperations.removeModulesFromIssue(modulesToRemove);
    },
    [issueOperations, issue]
  );

  const handleCycle = useCallback(
    (cycleId: string | null) => {
      if (!issue || issue.cycle_id === cycleId) return;
      if (cycleId) issueOperations.addIssueToCycle?.(cycleId);
      else issueOperations.removeIssueFromCycle?.();
    },
    [issue, issueOperations]
  );

  const handleStartDate = async (date: Date | null) => {
    if (updateIssue)
      await updateIssue(issue.project_id, issue.id, { start_date: date ? renderFormattedPayloadDate(date) : null });
  };

  const handleTargetDate = async (date: Date | null) => {
    if (updateIssue)
      await updateIssue(issue.project_id, issue.id, {
        target_date: date ? renderFormattedPayloadDate(date) : null,
        ...(date === null && issue.recurrence_pattern
          ? {
              recurrence_pattern: null,
              recurrence_max_occurrences: null,
            }
          : {}),
      });
  };

  const handleEstimate = async (value: string | undefined) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, { estimate_point: value });
  };

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString(),
    projectId: issue?.project_id,
    issueId: issue?.id,
    projectIdentifier: projectDetails?.identifier,
    sequenceId: issue?.sequence_id,
    isArchived: !!issue?.archived_at,
    isEpic,
  });

  const redirectToIssueDetail = () => router.push(`${workItemLink}#sub-issues`);

  if (!displayProperties || !issue.project_id) return null;

  // date range is enabled only when both dates are available and both dates are enabled
  const isDateRangeEnabled: boolean = Boolean(
    issue.start_date && issue.target_date && displayProperties.start_date && displayProperties.due_date
  );

  const defaultLabelOptions = issue?.label_ids?.map((id) => labelMap[id]) || [];

  const minDate = getDate(issue.start_date);
  const maxDate = getDate(issue.target_date);

  return (
    <div className={className}>
      {/* basic properties */}
      {/* state */}
      <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="state">
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
        <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
          <StateDropdown
            buttonContainerClassName="truncate max-w-40"
            value={issue.state_id}
            onChange={handleState}
            projectId={issue.project_id}
            disabled={isReadOnly}
            buttonVariant="border-with-text"
            renderByDefault={isMobile}
            showTooltip
          />
        </div>
      </WithDisplayPropertiesHOC>

      {/* priority */}
      <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="priority">
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
        <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
          <PriorityDropdown
            value={issue?.priority}
            onChange={handlePriority}
            disabled={isReadOnly}
            buttonVariant="border-without-text"
            renderByDefault={isMobile}
            showTooltip
          />
        </div>
      </WithDisplayPropertiesHOC>

      {/* merged dates */}
      <WithDisplayPropertiesHOC
        displayProperties={displayProperties}
        displayPropertyKey={["start_date", "due_date"]}
        shouldRenderProperty={() => isDateRangeEnabled}
      >
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
        <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
          <DateRangeDropdown
            value={{
              from: getDate(issue.start_date) || undefined,
              to: getDate(issue.target_date) || undefined,
            }}
            onSelect={(range) => {
              handleStartDate(range?.from ?? null);
              handleTargetDate(range?.to ?? null);
            }}
            hideIcon={{
              from: false,
            }}
            isClearable
            mergeDates
            buttonVariant={issue.start_date || issue.target_date ? "border-with-text" : "border-without-text"}
            buttonClassName={
              shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group) ? "text-danger-primary" : ""
            }
            clearIconClassName="text-primary!"
            disabled={isReadOnly}
            renderByDefault={isMobile}
            showTooltip
            renderPlaceholder={false}
            customTooltipHeading="Date Range"
          />
        </div>
      </WithDisplayPropertiesHOC>

      {/* start date */}
      <WithDisplayPropertiesHOC
        displayProperties={displayProperties}
        displayPropertyKey="start_date"
        shouldRenderProperty={() => !isDateRangeEnabled}
      >
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
        <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
          <DateDropdown
            value={issue.start_date ?? null}
            onChange={handleStartDate}
            maxDate={maxDate}
            placeholder={t("common.order_by.start_date")}
            icon={<StartDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
            buttonVariant={issue.start_date ? "border-with-text" : "border-without-text"}
            optionsClassName="z-10"
            disabled={isReadOnly}
            renderByDefault={isMobile}
            showTooltip
            labelClassName="text-caption-sm-regular"
          />
        </div>
      </WithDisplayPropertiesHOC>

      {/* target/due date */}
      <WithDisplayPropertiesHOC
        displayProperties={displayProperties}
        displayPropertyKey="due_date"
        shouldRenderProperty={() => !isDateRangeEnabled}
      >
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
        <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
          <DateDropdown
            value={issue?.target_date ?? null}
            onChange={handleTargetDate}
            minDate={minDate}
            placeholder={t("common.order_by.due_date")}
            icon={<DueDatePropertyIcon className="h-3 w-3 shrink-0" />}
            buttonVariant={issue.target_date ? "border-with-text" : "border-without-text"}
            buttonClassName={
              shouldHighlightIssueDueDate(issue.target_date, stateDetails?.group) ? "text-danger-primary" : ""
            }
            clearIconClassName="text-primary!"
            optionsClassName="z-10"
            disabled={isReadOnly}
            renderByDefault={isMobile}
            showTooltip
            labelClassName="text-caption-sm-regular"
          />
        </div>
      </WithDisplayPropertiesHOC>

      <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="recurrence">
        <IssueRecurrenceInlineControls
          issue={issue}
          updateIssue={updateIssue}
          isReadOnly={isReadOnly}
          handleEventPropagation={handleEventPropagation}
        />
      </WithDisplayPropertiesHOC>

      {/* assignee */}
      <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="assignee">
        {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
        <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
          <MemberDropdown
            projectId={issue?.project_id}
            value={issue?.assignee_ids}
            onChange={handleAssignee}
            disabled={isReadOnly}
            multiple
            buttonVariant={issue.assignee_ids?.length > 0 ? "transparent-without-text" : "border-without-text"}
            buttonClassName={issue.assignee_ids?.length > 0 ? "hover:bg-transparent px-0" : ""}
            showTooltip={issue?.assignee_ids?.length === 0}
            placeholder={t("common.assignees")}
            optionsClassName="z-10"
            tooltipContent=""
            renderByDefault={isMobile}
          />
        </div>
      </WithDisplayPropertiesHOC>

      <>
        {!isEpic && (
          <>
            {/* modules */}
            {projectDetails?.module_view && (
              <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="modules">
                {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
                <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
                  <ModuleDropdown
                    buttonContainerClassName="truncate max-w-40"
                    projectId={issue?.project_id}
                    value={issue?.module_ids ?? []}
                    onChange={handleModule}
                    disabled={isReadOnly}
                    renderByDefault={isMobile}
                    multiple
                    buttonVariant="border-with-text"
                    showCount
                    showTooltip
                  />
                </div>
              </WithDisplayPropertiesHOC>
            )}

            {/* cycles */}
            {projectDetails?.cycle_view && (
              <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="cycle">
                {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
                <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
                  <CycleDropdown
                    buttonContainerClassName="truncate max-w-40"
                    projectId={issue?.project_id}
                    value={issue?.cycle_id}
                    onChange={handleCycle}
                    disabled={isReadOnly}
                    buttonVariant="border-with-text"
                    renderByDefault={isMobile}
                    showTooltip
                  />
                </div>
              </WithDisplayPropertiesHOC>
            )}
          </>
        )}
      </>

      {/* estimates */}
      {projectId && areEstimateEnabledByProjectId(projectId?.toString()) && (
        <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="estimate">
          {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
          <div className="h-5" onFocus={handleEventPropagation} onClick={handleEventPropagation}>
            <EstimateDropdown
              value={issue.estimate_point ?? undefined}
              onChange={handleEstimate}
              projectId={issue.project_id}
              disabled={isReadOnly}
              buttonVariant="border-with-text"
              renderByDefault={isMobile}
              showTooltip
            />
          </div>
        </WithDisplayPropertiesHOC>
      )}

      {/* extra render properties */}
      {/* sub-issues */}
      {!isEpic && (
        <WithDisplayPropertiesHOC
          displayProperties={displayProperties}
          displayPropertyKey="sub_issue_count"
          shouldRenderProperty={(properties) => !!properties.sub_issue_count && !!subIssueCount}
        >
          <Tooltip
            tooltipHeading={t("common.sub_work_items")}
            tooltipContent={`${subIssueCount}`}
            isMobile={isMobile}
            renderByDefault={false}
          >
            {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
            <div
              onFocus={handleEventPropagation}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (subIssueCount) redirectToIssueDetail();
              }}
              className={cn(
                "flex h-5 flex-shrink-0 items-center justify-center gap-2 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1",
                {
                  "cursor-pointer hover:bg-layer-1": subIssueCount,
                }
              )}
            >
              <ViewsIcon className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
              <div className="text-caption-sm-regular">{subIssueCount}</div>
            </div>
          </Tooltip>
        </WithDisplayPropertiesHOC>
      )}

      {/* attachments */}
      <WithDisplayPropertiesHOC
        displayProperties={displayProperties}
        displayPropertyKey="attachment_count"
        shouldRenderProperty={(properties) => !!properties.attachment_count && !!issue.attachment_count}
      >
        <Tooltip
          tooltipHeading={t("common.attachments")}
          tooltipContent={`${issue.attachment_count}`}
          isMobile={isMobile}
          renderByDefault={false}
        >
          {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
          <div
            className="flex h-5 flex-shrink-0 items-center justify-center gap-2 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1"
            onFocus={handleEventPropagation}
            onClick={handleEventPropagation}
          >
            <Paperclip className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
            <div className="text-caption-sm-regular">{issue.attachment_count}</div>
          </div>
        </Tooltip>
      </WithDisplayPropertiesHOC>

      {/* link */}
      <WithDisplayPropertiesHOC
        displayProperties={displayProperties}
        displayPropertyKey="link"
        shouldRenderProperty={(properties) => !!properties.link && !!issue.link_count}
      >
        <Tooltip
          tooltipHeading={t("common.links")}
          tooltipContent={`${issue.link_count}`}
          isMobile={isMobile}
          renderByDefault={false}
        >
          {/* oxlint-disable-next-line jsx_a11y/click-events-have-key-events oxlint-disable-next-line jsx_a11y/no-static-element-interactions */}
          <div
            className="flex h-5 flex-shrink-0 items-center justify-center gap-2 overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1"
            onFocus={handleEventPropagation}
            onClick={handleEventPropagation}
          >
            <LinkIcon className="h-3 w-3 flex-shrink-0" strokeWidth={2} />
            <div className="text-caption-sm-regular">{issue.link_count}</div>
          </div>
        </Tooltip>
      </WithDisplayPropertiesHOC>

      {/* label */}
      <WithDisplayPropertiesHOC displayProperties={displayProperties} displayPropertyKey="labels">
        <IssuePropertyLabels
          projectId={issue?.project_id || null}
          value={issue?.label_ids || []}
          defaultOptions={defaultLabelOptions}
          onChange={handleLabel}
          disabled={isReadOnly}
          renderByDefault={isMobile}
          hideDropdownArrow
          maxRender={3}
        />
      </WithDisplayPropertiesHOC>
    </div>
  );
});
