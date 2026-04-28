/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty } from "lodash-es";
import type { TIssue, TWorkItemFilterExpression } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

/**
 * Operators that represent positive inclusion/equality. These can be safely
 * propagated as default field values on newly created work items.
 * Exclusion, range, and other non-equality operators are intentionally omitted
 * so that e.g. "priority is NOT high" does NOT force new items to "not high".
 */
const PROPAGATABLE_OPERATORS = new Set(["exact", "in"]);

/**
 * Collect flat [conditionKey, rawValue] pairs from any shape of
 * TWorkItemFilterExpression (flat condition or AND group).
 */
function collectConditionEntries(richFilters: TWorkItemFilterExpression): [string, string][] {
  if (!richFilters || isEmpty(richFilters)) return [];

  const entries: [string, string][] = [];

  if (LOGICAL_OPERATOR.AND in richFilters) {
    // AND group: { and: [{ prop__op: value }, ...] }
    const andGroup = richFilters as { and: Record<string, unknown>[] };
    for (const condition of andGroup[LOGICAL_OPERATOR.AND]) {
      for (const [key, value] of Object.entries(condition)) {
        if (value !== null && value !== undefined) {
          entries.push([key, String(value)]);
        }
      }
    }
  } else {
    // Flat condition: { prop__op: value }
    for (const [key, value] of Object.entries(richFilters)) {
      if (value !== null && value !== undefined) {
        entries.push([key, String(value)]);
      }
    }
  }

  return entries;
}

/**
 * Parse a possibly comma-separated filter value into an array of trimmed IDs.
 */
function parseFilterValue(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Given the currently active rich filter expression, return a partial TIssue
 * with fields pre-populated from equality/inclusion filter conditions.
 *
 * This enables new work items to inherit the active filter context so they
 * remain visible in the filtered view immediately after creation.
 *
 * Rules:
 *  - Only `exact` and `in` operators are propagated (positive equality).
 *  - `cycle_id` and `state_id` only inherit when exactly one value is
 *    filtered (those fields are single-valued on an issue).
 *  - `module_id`, `assignee_id`, and `label_id` propagate as arrays.
 *  - Date, range, and exclusion operators are ignored.
 */
export function extractIssueDefaultsFromRichFilters(richFilters: TWorkItemFilterExpression): Partial<TIssue> {
  const defaults: Partial<TIssue> = {};
  const entries = collectConditionEntries(richFilters);

  for (const [key, rawValue] of entries) {
    const lastDunder = key.lastIndexOf("__");
    if (lastDunder === -1) continue;

    const property = key.substring(0, lastDunder);
    const operator = key.substring(lastDunder + 2);

    if (!PROPAGATABLE_OPERATORS.has(operator)) continue;

    const ids = parseFilterValue(rawValue);
    if (ids.length === 0) continue;

    // For multi-value fields the operator may be "in" with comma-separated ids.
    // For single-value fields the operator is typically "exact" with one id.
    switch (property) {
      case "cycle_id":
        // Issues belong to at most one cycle; only propagate a single-value filter.
        if (ids.length === 1) defaults.cycle_id = ids[0];
        break;

      case "module_id":
        // Issues can belong to multiple modules.
        defaults.module_ids = ids;
        break;

      case "state_id":
        // Single-value field.
        if (ids.length === 1) defaults.state_id = ids[0];
        break;

      case "priority":
        // Single-value field.
        if (ids.length === 1) defaults.priority = ids[0] as TIssue["priority"];
        break;

      case "assignee_id":
        defaults.assignee_ids = ids;
        break;

      case "label_id":
        defaults.label_ids = ids;
        break;

      default:
        // Other properties (created_at, project_id, etc.) are not issue fields
        // that can be pre-populated at creation time, so we skip them.
        break;
    }
  }

  return defaults;
}

/**
 * Fields on a parent issue that should be inherited by a newly created
 * sub-issue / child work item.  These are the "contextual" fields that give
 * the child meaningful placement in the project's workflow from the start.
 *
 * Explicitly NOT inherited:
 *  - state_id  – child should start at its own initial state
 *  - parent_id – child should NOT recursively inherit grandparent
 *  - name / description_html / estimate_point – content-specific
 *  - start_date / target_date – scheduling is independent
 *  - type_id   – child may have a different work item type
 */
export function extractInheritableParentFields(parentIssue: TIssue): Partial<TIssue> {
  const inherited: Partial<TIssue> = {};

  if (parentIssue.cycle_id) {
    inherited.cycle_id = parentIssue.cycle_id;
  }

  if (parentIssue.module_ids?.length) {
    inherited.module_ids = [...parentIssue.module_ids];
  }

  if (parentIssue.assignee_ids?.length) {
    inherited.assignee_ids = [...parentIssue.assignee_ids];
  }

  if (parentIssue.label_ids?.length) {
    inherited.label_ids = [...parentIssue.label_ids];
  }

  if (parentIssue.priority && parentIssue.priority !== "none") {
    inherited.priority = parentIssue.priority;
  }

  return inherited;
}
