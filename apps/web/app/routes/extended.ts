/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

export const extendedRoutes: RouteConfigEntry[] = [
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/wiki/(list)/layout.tsx", [
        route(":workspaceSlug/wiki", "./(all)/[workspaceSlug]/wiki/(list)/page.tsx"),
      ]),
      layout("./(all)/[workspaceSlug]/wiki/(detail)/layout.tsx", [
        route(":workspaceSlug/wiki/:pageId", "./(all)/[workspaceSlug]/wiki/(detail)/[pageId]/page.tsx"),
      ]),
    ]),
  ]),
];
