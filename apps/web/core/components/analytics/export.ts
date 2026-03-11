/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ColumnDef, Row } from "@tanstack/react-table";
import { download, generateCsv, mkConfig } from "export-to-csv";

export const csvConfig = (workspaceSlug: string) =>
  mkConfig({
    fieldSeparator: ",",
    filename: `${workspaceSlug}-analytics`,
    decimalSeparator: ".",
    useKeysAsHeaders: true,
  });

export const exportCSV = <T>(rows: Row<T>[], columns: ColumnDef<T>[], workspaceSlug: string) => {
  const rowData = rows.map((row) => {
    const exportColumns = columns.map((col) => col.meta?.export);
    const cells = exportColumns.reduce((acc: Record<string, string | number>, col) => {
      if (col) {
        const cell = col?.value(row) ?? "-";
        acc[col.label ?? col.key] = cell;
      }
      return acc;
    }, {});
    return cells;
  });
  const csv = generateCsv(csvConfig(workspaceSlug))(rowData);
  download(csvConfig(workspaceSlug))(csv);
};
export const exportTimeLoggedCsv = async (
  workspaceSlug: string,
  params: { project_ids?: string; cycle_id?: string; module_id?: string; start_date?: string; end_date?: string }
) => {
  // build query string from params
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.append(key, value);
  });
  const url = `/api/workspaces/${workspaceSlug}/analytics/time-logged-export/?${query.toString()}`;
  const resp = await fetch(url, { method: "GET", credentials: "same-origin" });
  if (!resp.ok) {
    throw new Error(`Export request failed: ${resp.status}`);
  }
  const csv = await resp.text();
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = `${workspaceSlug}-hours-logged.csv`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
};
