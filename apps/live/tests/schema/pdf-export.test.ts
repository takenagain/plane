/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";
import { Effect, Result, Schema } from "effect";
import { PdfExportRequestBody } from "@/schema/pdf-export";

const decodeRequest = Schema.decodeUnknownEffect(PdfExportRequestBody);

describe("PdfExportRequestBody", () => {
  it("accepts non-empty, trimmed page and workspace identifiers", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        decodeRequest({
          pageId: "page-1",
          workspaceSlug: "acme",
          pageSize: "A4",
          pageOrientation: "portrait",
        })
      )
    );

    expect(Result.isFailure(result)).toBe(false);
  });

  it.each([
    { pageId: "", workspaceSlug: "acme" },
    { pageId: "page-1", workspaceSlug: "   " },
    { pageId: " page-1 ", workspaceSlug: "acme" },
  ])("rejects invalid request identifiers: %o", async (identifiers) => {
    const result = await Effect.runPromise(Effect.result(decodeRequest(identifiers)));

    expect(Result.isFailure(result)).toBe(true);
  });
});
