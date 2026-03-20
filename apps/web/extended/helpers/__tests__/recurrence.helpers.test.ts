/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TExpectMatcher = {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toBeNull: () => void;
  toBeTruthy: () => void;
  toBeFalsy: () => void;
  toHaveLength: (length: number) => void;
  toContain: (item: unknown) => void;
  not: TExpectMatcher;
};

declare const describe: (name: string, callback: () => void) => void;
declare const it: (name: string, callback: () => void) => void;
declare const expect: (received: unknown) => TExpectMatcher;

import {
  REPEAT_OPTIONS,
  TEST_REPEAT_OPTIONS,
  getRepeatOptions,
  parseMaxRepetitionsInput,
  getRecurrenceHelperText,
  shouldClearRecurrenceOnDateClear,
  getSelectedRepeatLabel,
} from "../recurrence.helpers";
// TRecurrencePattern is defined locally in recurrence.helpers.ts to avoid
// requiring @plane/types to be built before running these tests.

// ---------------------------------------------------------------------------
// REPEAT_OPTIONS - production cadence list
// ---------------------------------------------------------------------------
describe("REPEAT_OPTIONS", () => {
  it("starts with None (null value)", () => {
    expect(REPEAT_OPTIONS[0].value).toBeNull();
    expect(REPEAT_OPTIONS[0].label).toBe("None");
  });

  it("contains all five production cadences in the correct order", () => {
    const values = REPEAT_OPTIONS.map((o) => o.value);
    expect(values).toEqual([null, "daily", "weekly", "bi_weekly", "monthly", "yearly"]);
  });

  it("has six entries total", () => {
    expect(REPEAT_OPTIONS).toHaveLength(6);
  });

  it("does not include test-only cadences", () => {
    const values = REPEAT_OPTIONS.map((o) => o.value);
    expect(values).not.toContain("every_minute");
    expect(values).not.toContain("once");
  });

  it("has human-readable labels for all entries", () => {
    const labels = REPEAT_OPTIONS.map((o) => o.label);
    expect(labels).toEqual(["None", "Daily", "Weekly", "Bi-weekly", "Monthly", "Yearly"]);
  });
});

// ---------------------------------------------------------------------------
// TEST_REPEAT_OPTIONS - non-production cadence list
// ---------------------------------------------------------------------------
describe("TEST_REPEAT_OPTIONS", () => {
  it("contains exactly two entries", () => {
    expect(TEST_REPEAT_OPTIONS).toHaveLength(2);
  });

  it("contains every_minute as the first entry", () => {
    expect(TEST_REPEAT_OPTIONS[0].value).toBe("every_minute");
    expect(TEST_REPEAT_OPTIONS[0].label).toBe("Every minute");
  });

  it("contains once as the second entry", () => {
    expect(TEST_REPEAT_OPTIONS[1].value).toBe("once");
    expect(TEST_REPEAT_OPTIONS[1].label).toBe("Once-off");
  });
});

// ---------------------------------------------------------------------------
// getRepeatOptions - environment-gated option list
// ---------------------------------------------------------------------------
describe("getRepeatOptions", () => {
  it("returns only production options when allowTestOptions is false", () => {
    const options = getRepeatOptions(false);
    expect(options).toHaveLength(6);
    const values = options.map((o) => o.value);
    expect(values).not.toContain("every_minute");
    expect(values).not.toContain("once");
  });

  it("returns production and test options when allowTestOptions is true", () => {
    const options = getRepeatOptions(true);
    expect(options).toHaveLength(8);
    const values = options.map((o) => o.value);
    expect(values).toContain("every_minute");
    expect(values).toContain("once");
  });

  it("appends test options after production options when allowTestOptions is true", () => {
    const options = getRepeatOptions(true);
    const productionPart = options.slice(0, 6).map((o) => o.value);
    expect(productionPart).toEqual([null, "daily", "weekly", "bi_weekly", "monthly", "yearly"]);
    const testPart = options.slice(6).map((o) => o.value);
    expect(testPart).toEqual(["every_minute", "once"]);
  });

  it("does not mutate the underlying REPEAT_OPTIONS array", () => {
    const before = REPEAT_OPTIONS.length;
    getRepeatOptions(true);
    expect(REPEAT_OPTIONS).toHaveLength(before);
  });

  it("does not include test options when called with false even after a previous true call", () => {
    getRepeatOptions(true);
    const options = getRepeatOptions(false);
    const values = options.map((o) => o.value);
    expect(values).not.toContain("every_minute");
    expect(values).not.toContain("once");
  });
});

// ---------------------------------------------------------------------------
// parseMaxRepetitionsInput - max repetitions validation
// ---------------------------------------------------------------------------
describe("parseMaxRepetitionsInput", () => {
  it("accepts empty string as infinite (null)", () => {
    const result = parseMaxRepetitionsInput("");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBeNull();
  });

  it("accepts whitespace-only string as infinite (null)", () => {
    const result = parseMaxRepetitionsInput("   ");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBeNull();
  });

  it("accepts '1' as 1", () => {
    const result = parseMaxRepetitionsInput("1");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBe(1);
  });

  it("accepts '5' as 5", () => {
    const result = parseMaxRepetitionsInput("5");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBe(5);
  });

  it("accepts '100' as 100", () => {
    const result = parseMaxRepetitionsInput("100");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBe(100);
  });

  it("accepts padded whitespace around a valid number", () => {
    const result = parseMaxRepetitionsInput("  7  ");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBe(7);
  });

  it("rejects '0' as invalid", () => {
    const result = parseMaxRepetitionsInput("0");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("Enter a positive number or leave empty for infinite.");
  });

  it("rejects '-1' as invalid", () => {
    const result = parseMaxRepetitionsInput("-1");
    expect(result.valid).toBe(false);
  });

  it("rejects '-100' as invalid", () => {
    const result = parseMaxRepetitionsInput("-100");
    expect(result.valid).toBe(false);
  });

  it("rejects '1.5' as a non-integer", () => {
    const result = parseMaxRepetitionsInput("1.5");
    expect(result.valid).toBe(false);
  });

  it("rejects '0.9' as a non-integer", () => {
    const result = parseMaxRepetitionsInput("0.9");
    expect(result.valid).toBe(false);
  });

  it("rejects alphabetic text as invalid", () => {
    const result = parseMaxRepetitionsInput("abc");
    expect(result.valid).toBe(false);
  });

  it("rejects mixed alphanumeric text as invalid", () => {
    const result = parseMaxRepetitionsInput("5abc");
    expect(result.valid).toBe(false);
  });

  it("rejects NaN string as invalid", () => {
    const result = parseMaxRepetitionsInput("NaN");
    expect(result.valid).toBe(false);
  });

  it("rejects Infinity string as invalid", () => {
    const result = parseMaxRepetitionsInput("Infinity");
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRecurrenceHelperText - context-aware helper/error text
// ---------------------------------------------------------------------------
describe("getRecurrenceHelperText", () => {
  it("returns due date prompt when due date is missing (highest priority)", () => {
    const text = getRecurrenceHelperText({
      isDueDateMissing: true,
      validationError: null,
      recurrencePattern: null,
    });
    expect(text).toBe("Set a due date first.");
  });

  it("prioritises due date prompt over a validation error", () => {
    const text = getRecurrenceHelperText({
      isDueDateMissing: true,
      validationError: "Enter a positive number or leave empty for infinite.",
      recurrencePattern: null,
    });
    expect(text).toBe("Set a due date first.");
  });

  it("prioritises due date prompt over an active recurrence pattern", () => {
    const text = getRecurrenceHelperText({
      isDueDateMissing: true,
      validationError: null,
      recurrencePattern: "daily",
    });
    expect(text).toBe("Set a due date first.");
  });

  it("returns validation error when due date is present and there is an error", () => {
    const text = getRecurrenceHelperText({
      isDueDateMissing: false,
      validationError: "Enter a positive number or leave empty for infinite.",
      recurrencePattern: "weekly",
    });
    expect(text).toBe("Enter a positive number or leave empty for infinite.");
  });

  it("returns cadence prompt when due date is present, no error, and no pattern selected", () => {
    const text = getRecurrenceHelperText({
      isDueDateMissing: false,
      validationError: null,
      recurrencePattern: null,
    });
    expect(text).toBe("Select a repeat cadence to enable limits.");
  });

  it("returns infinite default text when due date is present, no error, and a pattern is selected", () => {
    const text = getRecurrenceHelperText({
      isDueDateMissing: false,
      validationError: null,
      recurrencePattern: "monthly",
    });
    expect(text).toBe("Infinite by default.");
  });

  it("returns infinite default text for every production cadence", () => {
    const cadences: Array<"daily" | "weekly" | "bi_weekly" | "monthly" | "yearly"> = [
      "daily",
      "weekly",
      "bi_weekly",
      "monthly",
      "yearly",
    ];
    for (const cadence of cadences) {
      const text = getRecurrenceHelperText({
        isDueDateMissing: false,
        validationError: null,
        recurrencePattern: cadence,
      });
      expect(text).toBe("Infinite by default.");
    }
  });

  it("returns infinite default text for test-only cadences when in non-production", () => {
    const testCadences: Array<"every_minute" | "once"> = ["every_minute", "once"];
    for (const cadence of testCadences) {
      const text = getRecurrenceHelperText({
        isDueDateMissing: false,
        validationError: null,
        recurrencePattern: cadence,
      });
      expect(text).toBe("Infinite by default.");
    }
  });
});

// ---------------------------------------------------------------------------
// shouldClearRecurrenceOnDateClear
// ---------------------------------------------------------------------------
describe("shouldClearRecurrenceOnDateClear", () => {
  it("returns true when date is cleared and a pattern is active", () => {
    expect(shouldClearRecurrenceOnDateClear(null, "daily")).toBe(true);
    expect(shouldClearRecurrenceOnDateClear(null, "weekly")).toBe(true);
    expect(shouldClearRecurrenceOnDateClear(null, "monthly")).toBe(true);
    expect(shouldClearRecurrenceOnDateClear(null, "yearly")).toBe(true);
    expect(shouldClearRecurrenceOnDateClear(null, "bi_weekly")).toBe(true);
    expect(shouldClearRecurrenceOnDateClear(null, "every_minute")).toBe(true);
    expect(shouldClearRecurrenceOnDateClear(null, "once")).toBe(true);
  });

  it("returns false when date is cleared but no pattern is active", () => {
    expect(shouldClearRecurrenceOnDateClear(null, null)).toBe(false);
  });

  it("returns false when a date is set (not cleared), regardless of pattern", () => {
    expect(shouldClearRecurrenceOnDateClear("2025-12-31", "daily")).toBe(false);
    expect(shouldClearRecurrenceOnDateClear("2025-01-01", null)).toBe(false);
    expect(shouldClearRecurrenceOnDateClear("2025-06-15", "monthly")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSelectedRepeatLabel
// ---------------------------------------------------------------------------
describe("getSelectedRepeatLabel", () => {
  const productionOptions = getRepeatOptions(false);
  const allOptions = getRepeatOptions(true);

  it("returns 'None' when pattern is null", () => {
    expect(getSelectedRepeatLabel(productionOptions, null)).toBe("None");
  });

  it("returns 'Daily' for 'daily' pattern", () => {
    expect(getSelectedRepeatLabel(productionOptions, "daily")).toBe("Daily");
  });

  it("returns 'Weekly' for 'weekly' pattern", () => {
    expect(getSelectedRepeatLabel(productionOptions, "weekly")).toBe("Weekly");
  });

  it("returns 'Bi-weekly' for 'bi_weekly' pattern", () => {
    expect(getSelectedRepeatLabel(productionOptions, "bi_weekly")).toBe("Bi-weekly");
  });

  it("returns 'Monthly' for 'monthly' pattern", () => {
    expect(getSelectedRepeatLabel(productionOptions, "monthly")).toBe("Monthly");
  });

  it("returns 'Yearly' for 'yearly' pattern", () => {
    expect(getSelectedRepeatLabel(productionOptions, "yearly")).toBe("Yearly");
  });

  it("returns 'Every minute' for 'every_minute' pattern when options include test cadences", () => {
    expect(getSelectedRepeatLabel(allOptions, "every_minute")).toBe("Every minute");
  });

  it("returns 'Once-off' for 'once' pattern when options include test cadences", () => {
    expect(getSelectedRepeatLabel(allOptions, "once")).toBe("Once-off");
  });

  it("falls back to 'None' when the pattern is not in the provided options list", () => {
    // 'every_minute' is not in production-only options
    expect(getSelectedRepeatLabel(productionOptions, "every_minute")).toBe("None");
  });

  it("falls back to 'None' for 'once' when production-only options are used", () => {
    expect(getSelectedRepeatLabel(productionOptions, "once")).toBe("None");
  });
});
