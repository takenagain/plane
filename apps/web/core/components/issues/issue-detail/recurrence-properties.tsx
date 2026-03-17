/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { TIssue, TIssueRecurrencePattern } from "@plane/types";
import { cn } from "@plane/utils";
import { CustomSelect, Input } from "@plane/ui";
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";

const REPEAT_OPTIONS: { label: string; value: TIssueRecurrencePattern | null }[] = [
  { label: "None", value: null },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Bi-weekly", value: "bi_weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
];

const TEST_REPEAT_OPTIONS: { label: string; value: TIssueRecurrencePattern }[] = [
  { label: "Every minute", value: "every_minute" },
  { label: "Once-off", value: "once" },
];

type Props = {
  issue: TIssue;
  disabled: boolean;
  updateIssue: (data: Partial<TIssue>) => Promise<void>;
  textClassName?: string;
};

export function IssueRecurrenceProperties(props: Props) {
  const { issue, disabled, updateIssue, textClassName = "text-body-xs-regular" } = props;
  const [maxRepetitionsValue, setMaxRepetitionsValue] = useState(
    issue.recurrence_max_occurrences?.toString() ?? ""
  );
  const [maxRepetitionsError, setMaxRepetitionsError] = useState<string | null>(null);

  const allowTestRepeatOptions = process.env.NODE_ENV !== "production";
  const repeatOptions = useMemo(
    () => (allowTestRepeatOptions ? [...REPEAT_OPTIONS, ...TEST_REPEAT_OPTIONS] : REPEAT_OPTIONS),
    [allowTestRepeatOptions]
  );
  const selectedRepeatOption = repeatOptions.find((option) => option.value === issue.recurrence_pattern) ?? REPEAT_OPTIONS[0];
  const isDueDateMissing = !issue.target_date;
  const isRepeatDisabled = disabled || isDueDateMissing;
  const isMaxRepetitionsDisabled = disabled || !issue.recurrence_pattern;

  useEffect(() => {
    setMaxRepetitionsValue(issue.recurrence_max_occurrences?.toString() ?? "");
    setMaxRepetitionsError(null);
  }, [issue.recurrence_max_occurrences]);

  const handleRepeatChange = async (value: TIssueRecurrencePattern | null) => {
    if (!value) {
      setMaxRepetitionsValue("");
      setMaxRepetitionsError(null);
      await updateIssue({
        recurrence_pattern: null,
        recurrence_max_occurrences: null,
      });
      return;
    }

    setMaxRepetitionsError(null);
    await updateIssue({
      recurrence_pattern: value,
    });
  };

  const commitMaxRepetitions = async () => {
    if (isMaxRepetitionsDisabled) return;

    const trimmedValue = maxRepetitionsValue.trim();
    if (!trimmedValue) {
      setMaxRepetitionsError(null);
      await updateIssue({ recurrence_max_occurrences: null });
      return;
    }

    const parsedValue = Number(trimmedValue);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      setMaxRepetitionsError("Enter a positive number or leave empty for infinite.");
      return;
    }

    setMaxRepetitionsError(null);
    await updateIssue({ recurrence_max_occurrences: parsedValue });
  };

  const helperText = isDueDateMissing
    ? "Set a due date first."
    : maxRepetitionsError ?? (!issue.recurrence_pattern ? "Select a repeat cadence to enable limits." : "Infinite by default.");

  return (
    <>
      <SidebarPropertyListItem icon={RefreshCw} label="Repeat">
        <div className="flex w-full flex-col gap-1">
          <CustomSelect
            value={issue.recurrence_pattern}
            onChange={handleRepeatChange}
            disabled={isRepeatDisabled}
            label={
              <span
                className={cn(textClassName, {
                  "text-placeholder": !issue.recurrence_pattern,
                })}
              >
                {selectedRepeatOption.label}
              </span>
            }
            className="w-full grow"
            buttonClassName="h-7.5 w-full justify-between !border-none bg-transparent px-2 py-0.5 text-left shadow-none"
          >
            {repeatOptions.map((option) => (
              <CustomSelect.Option key={option.value ?? "none"} value={option.value}>
                {option.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          {isDueDateMissing && <p className="px-2 text-11 text-tertiary">{helperText}</p>}
        </div>
      </SidebarPropertyListItem>

      <SidebarPropertyListItem icon={RefreshCw} label="Max repetitions">
        <div className="flex w-full flex-col gap-1 px-2">
          <Input
            type="number"
            min={1}
            mode="true-transparent"
            inputSize="xs"
            value={maxRepetitionsValue}
            onChange={(event) => {
              setMaxRepetitionsValue(event.target.value);
              if (maxRepetitionsError) setMaxRepetitionsError(null);
            }}
            onBlur={commitMaxRepetitions}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitMaxRepetitions();
              }
            }}
            disabled={isMaxRepetitionsDisabled}
            hasError={Boolean(maxRepetitionsError)}
            placeholder="Infinite"
            className={cn("w-full px-0", textClassName, {
              "text-placeholder": !maxRepetitionsValue,
            })}
          />
          <p
            className={cn("text-11", {
              "text-danger-primary": Boolean(maxRepetitionsError),
              "text-tertiary": !maxRepetitionsError,
            })}
          >
            {helperText}
          </p>
        </div>
      </SidebarPropertyListItem>
    </>
  );
}
