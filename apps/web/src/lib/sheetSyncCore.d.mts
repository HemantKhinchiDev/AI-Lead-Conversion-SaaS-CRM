export type SheetRef = {
  sheetId: string;
  gid: string;
  url: string;
};

export type SheetLeadRow = {
  full_name: string;
  phone: string;
  source: string;
  consent_given: string;
  suppressed: string;
  sheet_row_index: number;
};

export declare const SHEET_EXPORT_COLUMNS: string[];

export declare function parseGoogleSheetUrl(rawUrl: unknown): SheetRef | null;
export declare function buildSheetCsvUrl(sheetId: string, gid: string): string;
export declare function parseCsvTable(
  csvText: unknown,
  options?: { maxRows?: number; maxColumns?: number }
): string[][];
export declare function rowsToSheetLeadRows(rows: string[][]): SheetLeadRow[];
export declare function csvCell(value: unknown): string;
export declare function buildCsv(headers: string[], rows: unknown[][]): string;
export declare function leadSheetValues(lead: Record<string, unknown>): string[];
