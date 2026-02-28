/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty } from "@plane/types";
// local imports
import type { TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig } from "../../../rich-filters";
import type { TCreateNumberFilterParams } from "./shared";
import { getSupportedNumericOperators } from "./shared";

/**
 * Get the time logged filter config
 * @template P - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the time logged filter config
 */
export const getTimeLoggedFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateNumberFilterParams> =>
  (params: TCreateNumberFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Time logged",
      ...params,
      icon: params.filterIcon,
      allowMultipleFilters: true,
      supportedOperatorConfigsMap: getSupportedNumericOperators(params),
    });
