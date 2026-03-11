/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { TBaseFilterFieldConfig } from "./shared";

/**
 * Extended filter types
 */
export const EXTENDED_FILTER_FIELD_TYPE = {
  NUMBER: "number",
  NUMBER_RANGE: "number_range",
} as const;

type TBaseNumberFilterFieldConfig = TBaseFilterFieldConfig & {
  min?: number;
  max?: number;
  step?: number;
};

export type TNumberFilterFieldConfig<V extends TFilterValue> = TBaseNumberFilterFieldConfig & {
  type: typeof EXTENDED_FILTER_FIELD_TYPE.NUMBER;
  defaultValue?: V;
};

export type TNumberRangeFilterFieldConfig<V extends TFilterValue> = TBaseNumberFilterFieldConfig & {
  type: typeof EXTENDED_FILTER_FIELD_TYPE.NUMBER_RANGE;
  defaultValue?: V[];
};

// -------- UNION TYPES --------

/**
 * All extended filter configurations
 */
export type TExtendedFilterFieldConfigs<V extends TFilterValue = TFilterValue> =
  | TNumberFilterFieldConfig<V>
  | TNumberRangeFilterFieldConfig<V>;
