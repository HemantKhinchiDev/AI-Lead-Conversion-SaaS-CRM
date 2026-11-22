import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCsv,
  buildSheetCsvUrl,
  leadSheetValues,
  parseCsvTable,
  parseGoogleSheetUrl,
  rowsToSheetLeadRows,
  SHEET_EXPORT_COLUMNS,
} from "../src/lib/sheetSyncCore.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function source(relativePath) {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

test("parseGoogleSheetUrl extracts sheet id and gid only from Google Sheets URLs", () => {
  const withHash = parseGoogleSheetUrl(
    "https://docs.google.com/spreadsheets/d/abc123XYZ/edit#gid=42"
  );
  assert.equal(withHash.sheetId, "abc123XYZ");
  assert.equal(withHash.gid, "42");

  const withQuery = parseGoogleSheetUrl(
    "https://docs.google.com/spreadsheets/d/abc123XYZ/export?format=csv&gid=7"
  );
  assert.equal(withQuery.gid, "7");
  assert.equal(
    buildSheetCsvUrl(withQuery.sheetId, withQuery.gid),
    "https://docs.google.com/spreadsheets/d/abc123XYZ/export?format=csv&gid=7"
  );

  assert.equal(parseGoogleSheetUrl("https://evil.example/spreadsheets/d/abc123XYZ"), null);
  assert.equal(parseGoogleSheetUrl("http://127.0.0.1/spreadsheets/d/abc123XYZ"), null);
  assert.equal(parseGoogleSheetUrl("not-a-url"), null);
});

test("parseCsvTable keeps quoted commas, escaped quotes, CRLF, and BOM intact", () => {
  const table = parseCsvTable(
    "\uFEFFname,phone,notes\r\n\"Patel, Asha\",9876543210,\"He said \"\"hello\"\"\"\r\nNext,9876543211,plain\r\n"
  );
  assert.deepEqual(table[0], ["name", "phone", "notes"]);
  assert.deepEqual(table[1], ["Patel, Asha", "9876543210", 'He said "hello"']);
  assert.deepEqual(table[2], ["Next", "9876543211", "plain"]);
});

test("rowsToSheetLeadRows maps header aliases and records 1-based sheet row indexes", () => {
  const rows = parseCsvTable(
    [
      "Name,Mobile Number,Consent,DNC",
      "Rohan Sharma,9876543210,TRUE,false",
      "Asha Patel,+919876543211,false,false",
      "Blocked User,9876543212,true,TRUE",
    ].join("\n")
  );
  const leads = rowsToSheetLeadRows(rows);
  assert.equal(leads.length, 3);
  assert.equal(leads[0].full_name, "Rohan Sharma");
  assert.equal(leads[0].phone, "9876543210");
  assert.equal(leads[0].consent_given, "TRUE");
  assert.equal(leads[0].sheet_row_index, 2);
  assert.equal(leads[2].sheet_row_index, 4);
  assert.equal(leads[2].suppressed, "TRUE");
});

test("csv export neutralizes spreadsheet formula prefixes and keeps outcome columns", () => {
  const values = leadSheetValues({
    full_name: "=HYPERLINK(\"evil\")",
    phone: "+919876543210",
    status: "contacted",
    call_outcome: "INTERESTED",
    ai_summary: "@sum(a1:a9)",
    sheet_row_index: 5,
  });
  const csv = buildCsv(SHEET_EXPORT_COLUMNS, [values]);
  assert.match(csv, /"'=HYPERLINK\(""evil""\)"/);
  assert.match(csv, /'@sum\(a1:a9\)/);
  assert.match(csv, /INTERESTED/);
  assert.equal(values[9], "5");
});

test("sheet import route is authenticated, tenant scoped, consent gated, and stores sheet coordinates", () => {
  const route = source("src/app/api/sheets/import/route.ts");
  assert.match(route, /auth\.getUser/);
  assert.match(route, /status: 401/);
  assert.match(route, /from\("users"\)/);
  assert.match(route, /select\("tenant_id"\)/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /prepareBatchImport/);
  assert.match(route, /sheet_id: sheetId \|\| null/);
  assert.match(route, /sheet_row_index: rowIndex/);
  assert.match(route, /fetchSheetTable/);
});

test("sheets export route supports tenant scoped CSV and Google Sheets writes", () => {
  const route = source("src/app/api/sheets/export/route.ts");
  assert.match(route, /format === "csv"/);
  assert.match(route, /format !== "csv" && format !== "sheet"/);
  assert.match(route, /auth\.getUser/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /text\/csv; charset=utf-8/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /writeSheetRows/);
  assert.match(route, /status: 503/);
});

test("sheet client uses service-account JWT, RAW writes, and targeted row updates", () => {
  const lib = source("src/lib/sheetSync.ts");
  assert.match(lib, /GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.match(lib, /createSign\("RSA-SHA256"\)/);
  assert.match(lib, /oauth2\.googleapis\.com\/token/);
  assert.match(lib, /valueInputOption=RAW/);
  assert.match(lib, /startRow: rowIndex/);
  assert.match(lib, /docs\.google\.com/);
});

test("post-call flows push outcomes back into the imported sheet row", () => {
  for (const path of [
    "src/app/api/voice/analyze/route.ts",
    "src/app/api/voice/webhook/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /pushLeadToSheetSafe/);
    assert.match(route, /sheet_sync: sheetSync/);
  }
});

test("dashboard mounts the sheet sync card", () => {
  const page = source("src/app/dashboard/page.tsx");
  assert.match(page, /SheetSyncCard/);
  const card = source("src/components/SheetSyncCard.tsx");
  assert.match(card, /Import from Google Sheet/);
  assert.match(card, /Export to Google Sheet/);
  assert.match(card, /Export to CSV/);
});
