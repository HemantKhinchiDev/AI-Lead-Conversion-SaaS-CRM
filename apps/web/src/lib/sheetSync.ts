import { createSign } from "node:crypto";
import {
  buildSheetCsvUrl,
  leadSheetValues,
  parseCsvTable,
  parseGoogleSheetUrl,
  rowsToSheetLeadRows,
  type SheetLeadRow,
  type SheetRef,
} from "./sheetSyncCore.mjs";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SHEETS_ENDPOINT = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const FETCH_TIMEOUT_MS = 12000;

type FetchLike = typeof fetch;

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

export type SheetSyncResult = {
  status: "skipped" | "updated" | "failed";
  reason?: string;
  sheet_id?: string;
  sheet_row_index?: number;
};

export type SheetTableResult =
  | {
      ok: true;
      rows: string[][];
      source: "google_api" | "public_csv";
      ref: SheetRef;
    }
  | { ok: false; error: string };

export type SheetWriteResult =
  | { ok: true; updatedRows: number }
  | { ok: false; error: string };

let cachedToken: CachedToken | null = null;

function readServiceAccount(): ServiceAccount | null {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  let parsed: Record<string, unknown> | null = null;

  if (rawJson) {
    try {
      const decoded = rawJson.startsWith("{")
        ? rawJson
        : Buffer.from(rawJson, "base64").toString("utf8");
      const candidate = JSON.parse(decoded) as Record<string, unknown>;
      parsed = candidate;
    } catch {
      parsed = null;
    }
  }

  const email =
    (parsed?.client_email as string | undefined) ||
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
    "";
  const rawKey =
    (parsed?.private_key as string | undefined) ||
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() ||
    "";
  const privateKey = rawKey.replace(/\\n/g, "\n").trim();

  if (!email || !privateKey || !privateKey.includes("PRIVATE KEY")) return null;
  return { client_email: email, private_key: privateKey };
}

export function hasGoogleSheetsCredentials(): boolean {
  return readServiceAccount() !== null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function googleAccessToken(fetchImpl: FetchLike): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const account = readServiceAccount();
  if (!account) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    })
  ).toString("base64url");

  try {
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claim}`);
    signer.end();
    const signature = signer.sign(account.private_key).toString("base64url");
    const assertion = `${header}.${claim}.${signature}`;

    const response = await fetchWithTimeout(
      TOKEN_ENDPOINT,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: [
          "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer",
          `assertion=${encodeURIComponent(assertion)}`,
        ].join("&"),
      },
      fetchImpl
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (typeof payload.access_token !== "string" || !payload.access_token) return null;
    cachedToken = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000,
    };
    return cachedToken.value;
  } catch {
    return null;
  }
}

function rangeFor(sheetName: string, a1Range: string): string {
  const safeName = sheetName.replace(/'/g, "''");
  return sheetName ? `'${safeName}'!${a1Range}` : a1Range;
}

async function resolveSheetName(
  sheetId: string,
  gid: string,
  token: string,
  fetchImpl: FetchLike
): Promise<string> {
  const configured = process.env.GOOGLE_SHEET_NAME?.trim();
  if (configured) return configured;

  try {
    const response = await fetchWithTimeout(
      `${SHEETS_ENDPOINT}/${encodeURIComponent(sheetId)}?fields=sheets.properties(sheetId,title)`,
      { headers: { Authorization: `Bearer ${token}` } },
      fetchImpl
    );
    if (!response.ok) return "";
    const payload = (await response.json()) as {
      sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
    };
    const sheets = payload.sheets ?? [];
    const match = sheets.find((sheet) => String(sheet.properties?.sheetId ?? "") === gid);
    const chosen = match ?? sheets[0];
    return typeof chosen?.properties?.title === "string" ? chosen.properties.title : "";
  } catch {
    return "";
  }
}

async function fetchPublicCsvSheet(
  ref: SheetRef,
  fetchImpl: FetchLike
): Promise<SheetTableResult> {
  try {
    const response = await fetchWithTimeout(buildSheetCsvUrl(ref.sheetId, ref.gid), {}, fetchImpl);
    if (!response.ok) {
      return {
        ok: false,
        error: "Could not read that sheet. Share it as public or configure Google Sheets credentials.",
      };
    }
    return { ok: true, rows: parseCsvTable(await response.text()), source: "public_csv", ref };
  } catch {
    return { ok: false, error: "Could not reach Google Sheets." };
  }
}

export async function fetchSheetTable(
  rawSheetUrl: unknown,
  fetchImpl: FetchLike = fetch
): Promise<SheetTableResult> {
  const ref = parseGoogleSheetUrl(rawSheetUrl);
  if (!ref) {
    return { ok: false, error: "Enter a valid Google Sheets URL." };
  }

  const token = await googleAccessToken(fetchImpl);
  if (token) {
    try {
      const sheetName = await resolveSheetName(ref.sheetId, ref.gid, token, fetchImpl);
      const range = encodeURIComponent(rangeFor(sheetName, "A:ZZ"));
      const response = await fetchWithTimeout(
        `${SHEETS_ENDPOINT}/${encodeURIComponent(ref.sheetId)}/values/${range}`,
        { headers: { Authorization: `Bearer ${token}` } },
        fetchImpl
      );
      if (response.ok) {
        const payload = (await response.json()) as { values?: unknown };
        const values = Array.isArray(payload.values) ? payload.values : [];
        return {
          ok: true,
          rows: values.map((row) =>
            Array.isArray(row) ? row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))) : []
          ),
          source: "google_api",
          ref,
        };
      }
    } catch {
      return await fetchPublicCsvSheet(ref, fetchImpl);
    }
  }

  return await fetchPublicCsvSheet(ref, fetchImpl);
}

export async function writeSheetRows(
  sheetRef: SheetRef,
  values: string[][],
  options: { startRow?: number; fetchImpl?: FetchLike } = {}
): Promise<SheetWriteResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = await googleAccessToken(fetchImpl);
  if (!token) {
    return { ok: false, error: "Google Sheets credentials are not configured." };
  }
  if (values.length === 0) {
    return { ok: false, error: "No rows to write." };
  }

  try {
    const sheetName = await resolveSheetName(sheetRef.sheetId, sheetRef.gid, token, fetchImpl);
    const lastColumn = String.fromCharCode(65 + Math.min(25, Math.max(0, values[0].length - 1)));
    const startRow = Number.isInteger(options.startRow) && Number(options.startRow) > 0
      ? Number(options.startRow)
      : 1;
    const range = encodeURIComponent(
      rangeFor(sheetName, `A${startRow}:${lastColumn}${startRow + values.length - 1}`)
    );
    const response = await fetchWithTimeout(
      `${SHEETS_ENDPOINT}/${encodeURIComponent(sheetRef.sheetId)}/values/${range}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values }),
      },
      fetchImpl
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `Google Sheets rejected the update (HTTP ${response.status}). ${detail.slice(0, 200)}`.trim() };
    }
    const payload = (await response.json().catch(() => ({}))) as { updatedRows?: number };
    return { ok: true, updatedRows: Number(payload.updatedRows) || values.length };
  } catch {
    return { ok: false, error: "Could not update Google Sheets." };
  }
}

export function sheetLeadRowsFromTable(rows: string[][]): SheetLeadRow[] {
  return rowsToSheetLeadRows(rows);
}

export async function pushLeadToSheet(
  lead: Record<string, unknown>,
  fetchImpl: FetchLike = fetch
): Promise<SheetSyncResult> {
  const sheetId = typeof lead.sheet_id === "string" ? lead.sheet_id.trim() : "";
  const rowIndex = Number(lead.sheet_row_index);
  if (!sheetId || !Number.isInteger(rowIndex) || rowIndex < 2) {
    return { status: "skipped", reason: "Lead is not linked to a sheet row." };
  }
  if (!hasGoogleSheetsCredentials()) {
    return { status: "skipped", reason: "Google Sheets credentials are not configured." };
  }

  const ref = parseGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
  if (!ref) {
    return { status: "failed", reason: "Invalid stored sheet identifier." };
  }

  const result = await writeSheetRows(ref, [leadSheetValues(lead)], {
    startRow: rowIndex,
    fetchImpl,
  });

  if (!result.ok) {
    return {
      status: "failed",
      reason: result.error,
      sheet_id: sheetId,
      sheet_row_index: rowIndex,
    };
  }

  return { status: "updated", sheet_id: sheetId, sheet_row_index: rowIndex };
}

export async function pushLeadToSheetSafe(
  lead: Record<string, unknown>
): Promise<SheetSyncResult> {
  try {
    return await pushLeadToSheet(lead);
  } catch {
    return { status: "failed", reason: "Sheet sync failed unexpectedly." };
  }
}
