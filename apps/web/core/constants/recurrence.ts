/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueRecurrencePattern } from "@plane/types";

/**
 * The ordered list of production repeat cadence options.
 * This order is significant: it defines the display order in the UI.
 */
export const REPEAT_OPTIONS: { label: string; value: TIssueRecurrencePattern | null }[] = [
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
export const TEST_REPEAT_OPTIONS: { label: string; value: TIssueRecurrencePattern }[] = [
  { label: "Every minute", value: "every_minute" },
  { label: "Once-off", value: "once" },
];
