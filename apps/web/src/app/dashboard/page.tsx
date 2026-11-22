"use client";
import CsvImportCard from "../../components/CsvImportCard";
import TrainAgentCard from "../../components/TrainAgentCard";
import VoiceDemoModal from "../../components/VoiceDemoModal";
import SheetSyncCard from "../../components/SheetSyncCard";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase";
import { sanitizeCallOutcome, type CallOutcome } from "../../lib/callAnalysis";

type Lead = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  property_interest: string | null;
  consent_given: boolean;
  status: "new" | "contacted" | "qualified" | "site_visit" | "closed" | "lost";
  created_at: string;
  call_outcome: CallOutcome | null;
  callback_datetime: string | null;
  ai_summary: string | null;
  full_transcript: string | null;
};

type CallLog = {
  id: string;
  call_status: string;
  duration_seconds: number | null;
  transcript: string | null;
  full_transcript: string | null;
  ai_summary: string | null;
  call_outcome: CallOutcome | null;
  callback_datetime: string | null;
  next_action: string | null;
  created_at: string;
};

type CallSummary = {
  call_status: string;
  ai_summary: string | null;
  call_outcome: CallOutcome | null;
  callback_datetime: string | null;
};

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  CALLBACK_REQUESTED: "Callback requested",
  NO_ANSWER: "No answer",
};

function formatCallbackTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

const STATUS_OPTIONS: Lead["status"][] = [
  "new",
  "contacted",
  "qualified",
  "site_visit",
  "closed",
  "lost",
];

export default function DashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  if (!supabase) {
    if (typeof window !== "undefined") {
      router.replace("/login");
    }
    return null;
  }

  const [userEmail, setUserEmail] = useState<string>("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [callingLeadId, setCallingLeadId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");
  const historyRequestRef = useRef(0);
  const [callMap, setCallMap] = useState<Record<string, CallSummary>>({});

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [propertyInterest, setPropertyInterest] = useState("");
  const [consentGiven, setConsentGiven] = useState(true);

  async function loadUserAndLeads() {
    setLoading(true);
    setErrorMsg("");
    const { data: authData, error: authErr } = await supabase!.auth.getUser();
    if (authErr || !authData?.user) {
      router.replace("/login");
      return;
    }
    setUserEmail(authData.user.email || "");

    const [{ data, error }, { data: logsData }] = await Promise.all([
      supabase!.from("leads").select("*").order("created_at", { ascending: false }),
      supabase!
        .from("call_logs")
        .select("lead_id, call_status, ai_summary, call_outcome, callback_datetime")
        .order("created_at", { ascending: false }),
    ]);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLeads((data as Lead[]) || []);
    }

    if (logsData) {
      const latest: Record<string, CallSummary> = {};
      for (const row of logsData as Array<{
        lead_id: string;
        call_status: string;
        ai_summary: string | null;
        call_outcome: CallOutcome | null;
        callback_datetime: string | null;
      }>) {
        if (!latest[row.lead_id]) {
          latest[row.lead_id] = {
            call_status: row.call_status,
            ai_summary: row.ai_summary,
            call_outcome: row.call_outcome,
            callback_datetime: row.callback_datetime,
          };
        }
      }
      setCallMap(latest);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUserAndLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.full_name.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        (l.property_interest || "").toLowerCase().includes(q)
    );
  }, [leads, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: leads.length,
      newCount: leads.filter((l) => l.status === "new").length,
      qualifiedCount: leads.filter((l) => l.status === "qualified" || l.status === "site_visit").length,
    };
  }, [leads]);

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    if (!consentGiven) {
      setErrorMsg("Consent is required before adding a lead.");
      return;
    }
    setSubmitting(true);
    const { data: authData } = await supabase!.auth.getUser();
    if (!authData?.user) {
      router.replace("/login");
      return;
    }

    if (!supabase) return;
    const { data, error } = await supabase
      .from("leads")
      .insert([
        {
          user_id: authData.user.id,
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          property_interest: propertyInterest.trim() || null,
          consent_given: consentGiven,
          status: "new",
        },
      ])
      .select()
      .single();

    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data) {
      setLeads((prev) => [data as Lead, ...prev]);
    }
    setFullName("");
    setPhone("");
    setEmail("");
    setPropertyInterest("");
    setSuccessMsg("Lead added to workspace.");
  }

  async function handleTriggerVoiceCall(lead: Lead) {
    setErrorMsg("");
    setSuccessMsg("");
    setCallingLeadId(lead.id);
    try {
      const { data: sessionData } = await supabase!.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/voice/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.error) {
        setErrorMsg(json.error || "Failed to trigger AI call.");
        return;
      }

      const outcome = sanitizeCallOutcome(json.call_outcome);
      const callbackDatetime = typeof json.callback_datetime === "string" ? json.callback_datetime : null;
      const aiSummary = typeof json.ai_summary === "string" ? json.ai_summary : null;

      setCallMap((prev) => ({
        ...prev,
        [lead.id]: {
          call_status: json.status,
          ai_summary: aiSummary,
          call_outcome: outcome,
          callback_datetime: callbackDatetime,
        },
      }));
      setLeads((prev) =>
        prev.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                status: json.mode === "sandbox" ? "contacted" : item.status,
                call_outcome: outcome ?? item.call_outcome,
                callback_datetime: callbackDatetime ?? item.callback_datetime,
                ai_summary: aiSummary ?? item.ai_summary,
              }
            : item
        )
      );
      setSuccessMsg(`AI Voice Call (${json.status}) completed for ${lead.full_name}.`);
    } catch (caught) {
      setErrorMsg(caught instanceof Error ? caught.message : "Could not trigger the AI call.");
    } finally {
      setCallingLeadId("");
    }
  }

  async function handleOpenCallHistory(lead: Lead) {
    const requestId = ++historyRequestRef.current;
    setHistoryLead(lead);
    setCallLogs([]);
    setHistoryError("");
    setHistoryLoading(true);
    if (!supabase) return;

    const { data, error } = await supabase
      .from("call_logs")
      .select("id, call_status, duration_seconds, transcript, full_transcript, ai_summary, call_outcome, callback_datetime, next_action, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });

    if (requestId !== historyRequestRef.current) return;

    setHistoryLoading(false);
    if (error) {
      setHistoryError(error.message);
      return;
    }

    const rows = (data as CallLog[]) || [];
    setCallLogs(rows);
    if (rows.length > 0) {
      const latest = rows[0];
      setCallMap((prev) => ({
        ...prev,
        [lead.id]: {
          call_status: latest.call_status,
          ai_summary: latest.ai_summary,
          call_outcome: latest.call_outcome,
          callback_datetime: latest.callback_datetime,
        },
      }));
    }
  }

  function handleCloseCallHistory() {
    historyRequestRef.current += 1;
    setHistoryLead(null);
    setCallLogs([]);
    setHistoryError("");
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (!historyLead) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCloseCallHistory();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyLead]);

  if (!supabase) return;
  async function handleStatusChange(id: string, newStatus: Lead["status"]) {
    setErrorMsg("");
    const { error } = await supabase!
      .from("leads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
  }

  async function handleDeleteLead(id: string) {
    setErrorMsg("");
    const { error } = await supabase!.from("leads").delete().eq("id", id);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleSignOut() {
    await supabase!.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <h1>AI Lead Conversion</h1>
          <p>
            Consent-first workspace{userEmail ? ` · ${userEmail}` : ""}
          </p>
        </div>
        <div className="dashboard-header-actions">
          <span className="cost-chip" data-testid="cost-ledger">
            ₹0.00 · simulated / free-tier
          </span>
          <button onClick={handleSignOut} className="btn btn-secondary">
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-content">
          {errorMsg && (
            <div className="dashboard-alert" data-state="error" role="alert">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="dashboard-alert" data-state="success" role="status">
              {successMsg}
            </div>
          )}

          <section className="stat-grid" aria-label="Workspace summary">
            <div className="stat-card">
              <p className="stat-label">Total Leads</p>
              <p className="stat-value">{stats.total}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">New Leads</p>
              <p className="stat-value stat-value--blue">{stats.newCount}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Qualified / Site Visit</p>
              <p className="stat-value stat-value--green">{stats.qualifiedCount}</p>
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="dashboard-card" aria-labelledby="add-lead-title">
              <div className="card-head">
                <div>
                  <h2 className="card-title" id="add-lead-title">
                    Add New Lead
                  </h2>
                  <p className="card-subtitle">
                    Record a consented enquiry before any AI call is attempted.
                  </p>
                </div>
              </div>
              <form onSubmit={handleCreateLead} className="dash-form">
                <div className="dash-grid">
                  <label className="dash-field">
                    <span>Full Name *</span>
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rajesh Sharma"
                      className="dash-input"
                    />
                  </label>
                  <label className="dash-field">
                    <span>Phone Number *</span>
                    <input
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="dash-input"
                    />
                  </label>
                  <label className="dash-field">
                    <span>Email (Optional)</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="rajesh@example.com"
                      className="dash-input"
                    />
                  </label>
                  <label className="dash-field">
                    <span>Interest / Requirement</span>
                    <input
                      value={propertyInterest}
                      onChange={(e) => setPropertyInterest(e.target.value)}
                      placeholder="e.g. 3BHK SG Highway"
                      className="dash-input"
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <label className="consent-label">
                    <input
                      type="checkbox"
                      checked={consentGiven}
                      onChange={(e) => setConsentGiven(e.target.checked)}
                    />
                    <span>Explicit contact &amp; AI follow-up consent verified</span>
                  </label>
                  <button type="submit" disabled={submitting} className="btn btn-primary">
                    {submitting ? "Saving..." : "Add Lead"}
                  </button>
                </div>
              </form>
            </section>

            <TrainAgentCard />

            <VoiceDemoModal />

            <CsvImportCard />

            <div className="dashboard-grid-full">
              <SheetSyncCard />
            </div>

            <div className="dashboard-grid-full">
              <section className="dashboard-card" aria-labelledby="leads-title">
                <div className="card-head">
                  <div>
                    <h2 className="card-title" id="leads-title">
                      Workspace Leads ({filteredLeads.length})
                    </h2>
                    <p className="card-subtitle">
                      Update status, review call outcomes and trigger consented AI calls.
                    </p>
                  </div>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, phone, or interest..."
                    aria-label="Search leads"
                    className="dash-input lead-search"
                  />
                </div>

                {loading ? (
                  <p className="muted">Loading leads...</p>
                ) : filteredLeads.length === 0 ? (
                  <p className="muted">No leads match your view.</p>
                ) : (
                  <div className="lead-table-wrap">
                    <table className="lead-table">
                      <thead>
                        <tr>
                          <th scope="col">Lead</th>
                          <th scope="col">Phone</th>
                          <th scope="col">Interest</th>
                          <th scope="col">Status</th>
                          <th scope="col">Outcome</th>
                          <th scope="col">Callback Time</th>
                          <th scope="col">AI Summary</th>
                          <th scope="col">AI Voice Agent</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeads.map((lead) => {
                          const summary = callMap[lead.id];
                          const outcome = lead.call_outcome ?? summary?.call_outcome ?? null;
                          const callbackDatetime =
                            lead.callback_datetime ?? summary?.callback_datetime ?? null;
                          const aiSummary = lead.ai_summary ?? summary?.ai_summary ?? null;
                          return (
                            <tr key={lead.id}>
                              <td>
                                <span className="lead-name">{lead.full_name}</span>
                                {lead.email && <span className="lead-email">{lead.email}</span>}
                              </td>
                              <td className="lead-mono">{lead.phone}</td>
                              <td>{lead.property_interest || "—"}</td>
                              <td>
                                <select
                                  aria-label={`Status for ${lead.full_name}`}
                                  value={lead.status}
                                  onChange={(e) => handleStatusChange(lead.id, e.target.value as Lead["status"])}
                                  className="status-select"
                                >
                                  {STATUS_OPTIONS.map((st) => (
                                    <option key={st} value={st}>
                                      {st.replace("_", " ").toUpperCase()}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {outcome ? (
                                  <span
                                    className="outcome-badge"
                                    data-testid="lead-outcome"
                                    data-outcome={outcome}
                                  >
                                    {OUTCOME_LABELS[outcome]}
                                  </span>
                                ) : (
                                  <span className="muted" data-testid="lead-outcome">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="muted" data-testid="lead-callback">
                                {formatCallbackTime(callbackDatetime)}
                              </td>
                              <td>
                                <span
                                  className="truncate-summary"
                                  title={aiSummary || undefined}
                                  data-testid="lead-ai-summary"
                                >
                                  {aiSummary || "—"}
                                </span>
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    onClick={() => handleTriggerVoiceCall(lead)}
                                    disabled={callingLeadId === lead.id}
                                    className="btn btn-primary btn-sm"
                                  >
                                    {callingLeadId === lead.id ? "Calling..." : "Trigger AI Call"}
                                  </button>
                                  <button
                                    onClick={() => handleOpenCallHistory(lead)}
                                    className="btn btn-secondary btn-sm"
                                  >
                                    Call History
                                  </button>
                                </div>
                              </td>
                              <td>
                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  className="link-danger"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>

          <p className="dashboard-note">
            Consent-first workspace · calls and integrations run in simulated mode until explicitly approved.
          </p>
        </div>
      </main>

      {historyLead && (
        <div>
          <div className="drawer-backdrop" onClick={handleCloseCallHistory} aria-hidden="true" />
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-history-title"
          >
            <div className="drawer-header">
              <div>
                <h2 id="call-history-title" className="drawer-title">
                  Call History
                </h2>
                <p className="drawer-subtitle">
                  {historyLead.full_name} · {historyLead.phone}
                </p>
              </div>
              <button
                onClick={handleCloseCallHistory}
                aria-label="Close call history"
                className="icon-button"
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              {historyLoading ? (
                <p className="muted">Loading call history...</p>
              ) : historyError ? (
                <p className="dash-message" data-state="error" role="alert">
                  {historyError}
                </p>
              ) : callLogs.length === 0 ? (
                <p className="muted">No calls have been logged for this lead yet.</p>
              ) : (
                <ul className="history-list">
                  {callLogs.map((log) => (
                    <li key={log.id} className="history-item">
                      <div className="history-meta">
                        <span className="history-status">{log.call_status}</span>
                        <span className="muted">{new Date(log.created_at).toLocaleString()}</span>
                      </div>

                      <dl className="history-fields">
                        <div>
                          <dt>Duration</dt>
                          <dd>{log.duration_seconds != null ? `${log.duration_seconds}s` : "—"}</dd>
                        </div>
                        <div>
                          <dt>Outcome</dt>
                          <dd>{log.call_outcome ? OUTCOME_LABELS[log.call_outcome] : "—"}</dd>
                        </div>
                        <div>
                          <dt>Callback Time</dt>
                          <dd>{formatCallbackTime(log.callback_datetime)}</dd>
                        </div>
                        <div>
                          <dt>AI Summary</dt>
                          <dd>{log.ai_summary || "—"}</dd>
                        </div>
                        <div>
                          <dt>Next Action</dt>
                          <dd>{log.next_action || "—"}</dd>
                        </div>
                        <div>
                          <dt>Transcript</dt>
                          <dd className="history-transcript">{log.transcript || "—"}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
