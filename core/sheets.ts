import { google } from "googleapis";

const sheets = google.sheets("v4");

export interface SheetRead {
  spreadsheetId: string;
  title: string;
  /** All tab/sheet names, so callers can target another tab via --range. */
  tabs: string[];
  /** The A1 range actually read. */
  range: string;
  values: string[][];
}

/**
 * Read values from a spreadsheet via the Sheets values API.
 *
 * With no `range`, reads the first tab's used range and lists all tab names.
 * Pass an A1 range (e.g. "Sheet2!A1:C10") to target a specific tab/region.
 * Cell values are returned as their formatted strings.
 */
export async function readSheet(
  spreadsheetId: string,
  range?: string,
): Promise<SheetRead> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "properties.title,sheets.properties.title",
  });
  const title = meta.data.properties?.title || spreadsheetId;
  const tabs = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));

  const targetRange = range || tabs[0];
  if (!targetRange) {
    return { spreadsheetId, title, tabs, range: "", values: [] };
  }

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: targetRange,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const values = (res.data.values ?? []).map((row) =>
    row.map((cell) => (cell == null ? "" : String(cell))),
  );

  return { spreadsheetId, title, tabs, range: res.data.range || targetRange, values };
}

/** Serialize rows to CSV/TSV with minimal quoting (CSV only). */
export function rowsToDelimited(values: string[][], delimiter: "," | "\t"): string {
  const needsQuote = (cell: string) =>
    delimiter === "," && /[",\n]/.test(cell);
  return values
    .map((row) =>
      row
        .map((cell) => (needsQuote(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(delimiter),
    )
    .join("\n");
}
