/**
 * Local alias for the recurrence pattern union so this helper module has no
 * external package dependencies and can be tested without a built @plane/types.
 * Keep this in sync with TIssueRecurrencePattern in @plane/types.
 */
export type TRecurrencePattern = "daily" | "weekly" | "bi_weekly" | "monthly" | "yearly" | "every_minute" | "once";

/**
 * The ordered list of production cadence options.
 * This order is significant: it defines the display order in the UI.
 */
export const REPEAT_OPTIONS: { label: string; value: TRecurrencePattern | null }[] = [
  { label: "None", value: null },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Bi-weekly", value: "bi_weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
];

/**
 * Test-only cadence options, only exposed in non-production environments.
 */
export const TEST_REPEAT_OPTIONS: { label: string; value: TRecurrencePattern }[] = [
  { label: "Every minute", value: "every_minute" },
  { label: "Once-off", value: "once" },
];

/**
 * Return the combined repeat options list based on whether the current
 * environment allows test-only cadences.
 *
 * Test-only cadences ("every_minute", "once") are appended after production
 * cadences when allowTestOptions is true (i.e. NODE_ENV !== "production").
 */
export function getRepeatOptions(allowTestOptions: boolean): { label: string; value: TRecurrencePattern | null }[] {
  return allowTestOptions ? [...REPEAT_OPTIONS, ...TEST_REPEAT_OPTIONS] : REPEAT_OPTIONS;
}

/**
 * Validate and parse a raw string value for the max repetitions field.
 *
 * Returns:
 *   - { valid: true, value: null } when the input is empty (infinite repetitions).
 *   - { valid: true, value: number } when the input is a valid positive integer.
 *   - { valid: false, error: string } when the input is present but invalid.
 */
export function parseMaxRepetitionsInput(
  raw: string
): { valid: true; value: number | null } | { valid: false; error: string } {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { valid: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { valid: false, error: "Enter a positive number or leave empty for infinite." };
  }

  return { valid: true, value: parsed };
}

/**
 * Derive the helper text shown below the max repetitions input.
 *
 * Priority order:
 * 1. Due date missing - prompt to set due date.
 * 2. Explicit error message (e.g. invalid max repetitions input).
 * 3. No repeat cadence selected - prompt to select one.
 * 4. Default: "Infinite by default."
 */
export function getRecurrenceHelperText(opts: {
  isDueDateMissing: boolean;
  validationError: string | null;
  recurrencePattern: TRecurrencePattern | null;
}): string {
  const { isDueDateMissing, validationError, recurrencePattern } = opts;

  if (isDueDateMissing) {
    return "Set a due date first.";
  }
  if (validationError) {
    return validationError;
  }
  if (!recurrencePattern) {
    return "Select a repeat cadence to enable limits.";
  }
  return "Infinite by default.";
}

/**
 * Derive whether clearing the due date should also clear recurrence settings.
 * Returns true when the date is being cleared and a recurrence pattern is active.
 */
export function shouldClearRecurrenceOnDateClear(
  newDate: string | null,
  currentPattern: TRecurrencePattern | null
): boolean {
  return newDate === null && currentPattern !== null;
}

/**
 * Return the label for the selected repeat option, falling back to "None".
 */
export function getSelectedRepeatLabel(
  options: { label: string; value: TRecurrencePattern | null }[],
  currentPattern: TRecurrencePattern | null
): string {
  const found = options.find((o) => o.value === currentPattern);
  return found?.label ?? "None";
}
