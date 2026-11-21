function neutralizeFormulaPrefixes(text: string): string {
  return text.replace(/^[=\+\-\@]\s*/, "");
}

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(",") || escaped.includes("\n") || escaped.includes("\r")) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function buildCsvRow(value: string | null | undefined): string {
  return escapeCsvField(value);
}

export function buildCsvContent(rows: (string | null | undefined)[]): string {
  const header = buildCsvRow(rows[0]);
  const dataRows = rows.slice(1).map(buildCsvRow);
  return [header, ...dataRows].filter((row) => row.trim().length > 0).join("\n");
}

export function csvHeaders(tenantId: string): HeadersInit {
  return {
    "Content-Disposition": `attachment; filename="call_logs_${tenantId}.csv"`,
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

export function csvSafetyCheck(text: string): string {
  return neutralizeFormulaPrefixes(text);
}