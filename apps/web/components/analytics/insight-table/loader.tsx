/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import type { RowData } from "@tanstack/table-core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@makeplane/propel/components/table";
import { Loader } from "@plane/blocks/skeleton";

interface TableSkeletonProps<TData extends RowData> {
  columns: LegacyColumnDef<TData>[];
  rows: number;
}

const getColumnKey = <TData extends RowData>(column: LegacyColumnDef<TData>) =>
  column.id ?? String(column.header ?? "");

export function TableLoader<TData extends RowData>({ columns, rows }: TableSkeletonProps<TData>) {
  const rowKeys = Array.from({ length: rows }, (_, rowIndex) => `skeleton-row-${rowIndex}`);

  return (
    <Table variant="table">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={getColumnKey(column)}
              pinned="none"
              label={typeof column.header === "string" ? column.header : ""}
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rowKeys.map((rowKey) => (
          <TableRow key={rowKey}>
            {columns.map((column) => (
              <TableCell key={getColumnKey(column)} pinned="none" padding="cell">
                <Loader.Item height="20px" width="100%" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
