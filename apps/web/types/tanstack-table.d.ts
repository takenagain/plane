import type { LegacyRow } from "@tanstack/react-table/legacy";
import type { CellData, RowData, TableFeatures } from "@tanstack/table-core";

declare module "@tanstack/table-core" {
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue extends CellData = CellData> {
    export: {
      key: string;
      value: (row: LegacyRow<TData>) => string | number;
      label?: string;
    };
  }
}
