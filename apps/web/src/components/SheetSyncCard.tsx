"use client";

import { useState } from "react";

type ImportSummary = {
  total: number;
  eligible: number;
  review_required: number;
  excluded: number;
  duplicates: number;
  invalid: number;
};

type ImportResponse = {
  ok?: boolean;
  error?: string;
  source?: string;
  sheet_id?: string | null;
  inserted?: number;
  updated?: number;
  summary?: ImportSummary;
};

type ExportResponse = {
  ok?: boolean;
  error?: string;
  rows_written?: number;
};

function readAuthToken(): string {
  try {
    const key = Object.keys(window.localStorage).find((item) => item.indexOf("auth-token") !== -1);
    if (!key) return "";
    const raw = window.localStorage.getItem(key);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.access_token === "string") return parsed.access_token;
    if (parsed && parsed.currentSession && typeof parsed.currentSession.access_token === "string") {
      return parsed.currentSession.access_token;
    }
    return "";
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  const token = readAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SheetSyncCard() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [busy, setBusy] = useState<"import" | "csv" | "sheet" | "">("");
  const [message, setMessage] = useState("");
  const [messageState, setMessageState] = useState<"success" | "error">("success");
  const [summary, setSummary] = useState<ImportResponse | null>(null);

  function report(text: string, state: "success" | "error" = "success") {
    setMessage(text);
    setMessageState(state);
  }

  async function handleImport() {
    setBusy("import");
    setSummary(null);
    try {
      const response = await fetch("/api/sheets/import", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sheet_url: sheetUrl }),
      });
      const data = (await response.json().catch(() => ({}))) as ImportResponse;
      if (!response.ok || !data.ok) {
        report(data.error || `Could not import the sheet (HTTP ${response.status}).`, "error");
        return;
      }
      setSummary(data);
      const counts = data.summary;
      report(
        `Imported ${data.inserted ?? 0} new leads, updated ${data.updated ?? 0} sheet rows · ${counts?.total ?? 0} rows read, ${counts?.duplicates ?? 0} duplicates, ${counts?.invalid ?? 0} invalid.`
      );
    } catch {
      report("Could not reach the Google Sheets importer.", "error");
    } finally {
      setBusy("");
    }
  }

  async function handleCsvExport() {
    setBusy("csv");
    try {
      const response = await fetch("/api/sheets/export?format=csv", { headers: authHeaders() });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ExportResponse;
        report(data.error || `Could not export leads (HTTP ${response.status}).`, "error");
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "leads_sheet_sync.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      report("CSV exported. Open it in Google Sheets whenever you are ready.");
    } catch {
      report("Could not download the CSV export.", "error");
    } finally {
      setBusy("");
    }
  }

  async function handleSheetExport() {
    setBusy("sheet");
    const suffix = sheetUrl.trim()
      ? `&sheet_url=${encodeURIComponent(sheetUrl.trim())}`
      : "";
    try {
      const response = await fetch(`/api/sheets/export?format=sheet${suffix}`, {
        headers: authHeaders(),
      });
      const data = (await response.json().catch(() => ({}))) as ExportResponse;
      if (!response.ok || !data.ok) {
        report(
          data.error || `Could not export to Google Sheets (HTTP ${response.status}).`,
          "error"
        );
        return;
      }
      report(`Exported ${data.rows_written ?? 0} leads to the Google Sheet.`);
    } catch {
      report("Could not reach the Google Sheets exporter.", "error");
    } finally {
      setBusy("");
    }
  }

  const counts = summary?.summary;

  return (
    <section className="section" id="sheets-sync" data-testid="sheets-sync" aria-labelledby="sheets-sync-title">
      <div className="section-head">
        <h2 className="section-title" id="sheets-sync-title">
          Google Sheets Sync
        </h2>
        <p className="section-note">
          Two-way lead sync · +91 numbers normalized · call outcomes written back to the imported row
        </p>
      </div>

      <form
        className="lead-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleImport();
        }}
      >
        <label className="field">
          <span>Google Sheet URL</span>
          <input
            type="url"
            value={sheetUrl}
            onChange={(event) => setSheetUrl(event.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
            maxLength={2048}
          />
        </label>
        <div className="form-grid">
          <button className="button" type="submit" disabled={busy !== ""}>
            {busy === "import" ? "Importing…" : "Import from Google Sheet"}
          </button>
          <button className="button" type="button" disabled={busy !== ""} onClick={() => void handleCsvExport()}>
            {busy === "csv" ? "Exporting…" : "Export to CSV"}
          </button>
          <button className="button" type="button" disabled={busy !== ""} onClick={() => void handleSheetExport()}>
            {busy === "sheet" ? "Exporting…" : "Export to Google Sheet"}
          </button>
        </div>
      </form>

      {message && (
        <p className="form-message" data-state={messageState} role={messageState === "error" ? "alert" : "status"}>
          {message}
        </p>
      )}

      {counts && (
        <div className="train-result">
          <p>
            Rows: {counts.total} · Eligible: {counts.eligible} · Review: {counts.review_required} ·
            Excluded: {counts.excluded} · Duplicates: {counts.duplicates} · Invalid: {counts.invalid}
          </p>
        </div>
      )}
    </section>
  );
}
