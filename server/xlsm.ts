import * as XLSX from "xlsx";
import type { ParsedTable } from "../shared/schema.js";

/**
 * Build an .xlsm (macro-enabled workbook container) buffer from a parsed table.
 * Sheet is named "Purchase Order", first row = column headers, then data rows.
 *
 * SheetJS supports bookType 'xlsm'. We write to a Node Buffer.
 */
export function buildXlsmBuffer(table: ParsedTable): Buffer {
  const { columns, rows } = table;

  // Array-of-arrays: header row then data rows in column order.
  const aoa: (string | number)[][] = [];
  aoa.push([...columns]);
  for (const row of rows) {
    aoa.push(columns.map((c) => {
      const v = row[c];
      return v === undefined || v === null ? "" : v;
    }));
  }

  // Array-of-arrays rather than json_to_sheet: the table's row objects can
  // have differing keys per row (a template row may omit columns the caller
  // left blank), so building the sheet from `columns` directly guarantees a
  // consistent header order instead of however each row happens to be shaped.
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Purchase Order");

  const buf = XLSX.write(wb, { bookType: "xlsm", type: "buffer" });
  return buf as Buffer;
}

export const XLSM_MIME = "application/vnd.ms-excel.sheet.macroEnabled.12";
export const XLSM_FILENAME = "po_export.xlsm";
