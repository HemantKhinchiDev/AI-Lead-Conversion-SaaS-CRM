const MAX_CSV_CHARS = 2_000_000;

export const SHEET_EXPORT_COLUMNS = [
  "Full Name",
  "Phone",
  "Email",
  "Status",
  "Consent",
  "Call Outcome",
  "Callback Time",
  "AI Summary",
  "Transcript",
  "Sheet Row",
  "Updated At",
];

function hashParam(hash, key) {
  const query = String(hash || "").replace(/^#/, "");
  for (const pair of query.split("&")) {
    const [rawKey, rawValue = ""] = pair.split("=");
    if (decodeURIComponent(rawKey) === key) {
      return decodeURIComponent(rawValue);
    }
  }
  return "";
}

export function parseGoogleSheetUrl(rawUrl) {
  const value = String(rawUrl ?? "").trim();
  if (!value) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "docs.google.com" && !host.endsWith(".docs.google.com")) return null;

  const match = url.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const sheetId = match[1];

  const rawGid = url.searchParams.get("gid") || hashParam(url.hash, "gid") || "0";
  const gid = /^\d+$/.test(rawGid) ? rawGid : "0";

  return {
    sheetId,
    gid,
    url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`,
  };
}

export function buildSheetCsvUrl(sheetId, gid) {
  const id = encodeURIComponent(String(sheetId || ""));
  const sheetGid = /^\d+$/.test(String(gid)) ? String(gid) : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${sheetGid}`;
}

export function parseCsvTable(csvText, options = {}) {
  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : 2000;
  const maxColumns = Number.isFinite(options.maxColumns) ? options.maxColumns : 60;
  const text = String(csvText ?? "").replace(/^\uFEFF/, "").slice(0, MAX_CSV_CHARS);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  function pushRow() {
    row.push(field);
    rows.push(row.slice(0, maxColumns));
    row = [];
    field = "";
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      pushRow();
      if (rows.length >= maxRows) return rows;
    } else if (char === "\n") {
      pushRow();
      if (rows.length >= maxRows) return rows;
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows.slice(0, maxRows);
}

function normalizeHeader(header) {
  return String(header ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

const HEADER_ALIASES = {
  full_name: ["full_name", "name", "customer_name", "lead_name", "contact_name"],
  phone: ["phone", "mobile", "phone_number", "mobile_number", "contact_number", "whatsapp"],
  source: ["source", "lead_source"],
  consent_given: ["consent_given", "consent", "permission", "opt_in", "permission_verified"],
  suppressed: ["suppressed", "dnc", "do_not_call", "do_not_contact", "opt_out"],
};

function findColumn(headers, aliases) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

export function rowsToSheetLeadRows(rows) {
  const table = Array.isArray(rows) ? rows : [];
  if (table.length < 2) return [];

  const headers = table[0].map(normalizeHeader);
  const nameIndex = findColumn(headers, HEADER_ALIASES.full_name);
  const phoneIndex = findColumn(headers, HEADER_ALIASES.phone);
  if (nameIndex < 0 || phoneIndex < 0) return [];

  const sourceIndex = findColumn(headers, HEADER_ALIASES.source);
  const consentIndex = findColumn(headers, HEADER_ALIASES.consent_given);
  const suppressedIndex = findColumn(headers, HEADER_ALIASES.suppressed);
  const output = [];

  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index] || [];
    if (cells.every((cell) => String(cell ?? "").trim() === "")) continue;
    output.push({
      full_name: String(cells[nameIndex] ?? "").trim(),
      phone: String(cells[phoneIndex] ?? "").trim(),
      source: String(cells[sourceIndex] ?? "").trim() || "google_sheet_import",
      consent_given: String(cells[consentIndex] ?? "").trim(),
      suppressed: String(cells[suppressedIndex] ?? "").trim(),
      sheet_row_index: index + 1,
    });
  }

  return output;
}

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function leadSheetValues(lead) {
  const row = lead && typeof lead === "object" ? lead : {};
  return [
    cellText(row.full_name),
    cellText(row.phone),
    cellText(row.email),
    cellText(row.status),
    cellText(row.consent_given),
    cellText(row.call_outcome),
    cellText(row.callback_datetime),
    cellText(row.ai_summary),
    cellText(row.full_transcript).slice(0, 5000),
    cellText(row.sheet_row_index),
    cellText(row.updated_at),
  ];
}
