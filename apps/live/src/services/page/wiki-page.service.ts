/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AppError } from "@/lib/errors";
import { PageService } from "./extended.service";

interface WikiPageServiceParams {
  workspaceSlug: string | null;
  cookie: string | null;
  [key: string]: unknown;
}

export class WikiPageService extends PageService {
  protected basePath: string;
  protected pageCollection = "wiki-pages";

  constructor(params: WikiPageServiceParams) {
    super();
    const { workspaceSlug } = params;
    if (!workspaceSlug) throw new AppError("Missing required fields.");
    if (!params.cookie) throw new AppError("Cookie is required.");
    this.setHeader("Cookie", params.cookie);
    this.basePath = `/api/workspaces/${workspaceSlug}`;
  }
}
