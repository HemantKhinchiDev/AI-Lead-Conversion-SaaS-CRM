"use client";

import { useState } from "react";
import { parseCsvText, prepareBatchImport } from "../lib/leadImport";

function readAuthToken(): string {
  try {
    const key = Object.keys(window.localStorage).find((k) => k.indexOf("auth-token") !== -1);
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

export default function CsvImportCard() {
  const [fileName, setFileName] = useState<string>("");
  const [summary, setSummary] = useState<{
    total: number;
    eligible: number;
    review_required: number;
    excluded: number;
    duplicates: number;
    invalid: number;
  } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const csvText = await file.text();
    const rows = parseCsvText(csvText);
    const preview = prepareBatchImport(rows, "preview-tenant");
    setSummary(preview.counts);
    setStatusMsg("Preview ready. Syncing with /api/leads/import...");

    setUploading(true);
    try {
      const token = readAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = "Bearer " + token;
      }
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await res.json();
      if (res.ok && data && data.summary) {
        setSummary(data.summary);
        setStatusMsg("Imported to tenant CRM successfully.");
      } else if (data && data.error) {
        setStatusMsg("Preview only (" + String(data.error) + ")");
      } else {
        setStatusMsg("Preview computed locally.");
      }
    } catch {
      setStatusMsg("Preview computed locally.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="dashboard-card" id="import-csv" data-testid="csv-import" aria-labelledby="csv-import-title">
      <div className="card-head">
        <div>
          <h2 className="card-title" id="csv-import-title">
            CSV Lead Import
          </h2>
          <p className="card-subtitle">
            Normalizes +91 phones, flags missing consent as review_required, and excludes suppressed rows
          </p>
        </div>
      </div>
      <div className="dash-upload">
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={uploading}
          onChange={(e) => {
            void handleFileChange(e.target.files ? e.target.files[0] : undefined);
          }}
        />
        {fileName ? <span className="lead-name">File: {fileName}</span> : null}
        {statusMsg ? <span className="muted">{statusMsg}</span> : null}
      </div>
      {summary ? (
        <div className="dash-summary">
          <div>Total: <strong>{summary.total}</strong></div>
          <div>Eligible: <strong>{summary.eligible}</strong></div>
          <div>Review: <strong>{summary.review_required}</strong></div>
          <div>Excluded: <strong>{summary.excluded}</strong></div>
          <div>Duplicates: <strong>{summary.duplicates}</strong></div>
          <div>Invalid: <strong>{summary.invalid}</strong></div>
        </div>
      ) : null}
    </section>
  );
}
