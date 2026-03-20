/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Re-export from the single source of truth so components can continue
// importing from "@/constants/recurrence" while the canonical definitions
// live alongside the tested helper utilities in recurrence.helpers.ts.
export { REPEAT_OPTIONS, TEST_REPEAT_OPTIONS } from "../../extended/helpers/recurrence.helpers";
