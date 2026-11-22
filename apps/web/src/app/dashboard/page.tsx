"use client";
import CsvImportCard from "../../components/CsvImportCard";
import TrainAgentCard from "../../components/TrainAgentCard";
import VoiceDemoModal from "../../components/VoiceDemoModal";
import DashboardClient from "./DashboardClient";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase";
import type { CallOutcome } from "../../lib/callAnalysis";

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

const OUTCOME_STYLES: Record<CallOutcome, string> = {
  INTERESTED: "bg-emerald-100 text-emerald-700",
  NOT_INTERESTED: "bg-slate-100 text-slate-600",
  CALLBACK_REQUESTED: "bg-amber-100 text-amber-700",
  NO_ANSWER: "bg-rose-100 text-rose-700",
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Lead Conversion</h1>
          <p className="text-xs text-slate-500">
            Consent-first workspace {userEmail ? `• ${userEmail}` : ""}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Sign out
        </button>
      </header>

      <main className="mx-auto max-w-6xl p-6 space-y-6">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMsg}
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Total Leads</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">New Leads</div>
            <div className="mt-1 text-2xl font-bold text-blue-600">{stats.newCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Qualified / Site Visit</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{stats.qualifiedCount}</div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Add New Lead</h2>
          <form onSubmit={handleCreateLead} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rajesh Sharma"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number *</label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email (Optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="rajesh@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Interest / Requirement</label>
              <input
                value={propertyInterest}
                onChange={(e) => setPropertyInterest(e.target.value)}
                placeholder="e.g. 3BHK SG Highway"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Explicit contact & AI follow-up consent verified</span>
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Add Lead"}
              </button>
            </div>
          </form>
        </section>

        <TrainAgentCard />

        <VoiceDemoModal />

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold">Workspace Leads ({filteredLeads.length})</h2>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, or interest..."
              className="w-full sm:w-72 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading leads...</p>
          ) : filteredLeads.length === 0 ? (
            <p className="text-sm text-slate-500">No leads match your view.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-4">Lead</th>
                    <th className="py-2.5 pr-4">Phone</th>
                    <th className="py-2.5 pr-4">Interest</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4">Outcome</th>
                    <th className="py-2.5 pr-4">Callback Time</th>
                    <th className="py-2.5 pr-4">AI Summary</th>
                    <th className="py-2.5 pr-4">AI Voice Agent</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => {
                    const summary = callMap[lead.id];
                    const outcome = lead.call_outcome ?? summary?.call_outcome ?? null;
                    const callbackDatetime =
                      lead.callback_datetime ?? summary?.callback_datetime ?? null;
                    const aiSummary = lead.ai_summary ?? summary?.ai_summary ?? null;
                    return (
                      <tr key={lead.id}>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">{lead.full_name}</div>
                          {lead.email && <div className="text-xs text-slate-500">{lead.email}</div>}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">{lead.phone}</td>
                        <td className="py-3 pr-4 text-slate-600">{lead.property_interest || "—"}</td>
                        <td className="py-3 pr-4">
                          <select
                            aria-label={`Status for ${lead.full_name}`}
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value as Lead["status"])}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium"
                          >
                            {STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st}>
                                {st.replace("_", " ").toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          {outcome ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${OUTCOME_STYLES[outcome]}`}
                              data-testid="lead-outcome"
                              data-outcome={outcome}
                            >
                              {OUTCOME_LABELS[outcome]}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400" data-testid="lead-outcome">
                              —
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-600" data-testid="lead-callback">
                          {formatCallbackTime(callbackDatetime)}
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-600">
                          <span
                            className="inline-block max-w-xs truncate align-bottom"
                            title={aiSummary || undefined}
                            data-testid="lead-ai-summary"
                          >
                            {aiSummary || "—"}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => handleOpenCallHistory(lead)}
                                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Call History
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="text-xs font-medium text-red-600 hover:underline"
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

        <CsvImportCard />
      </main>

      <DashboardClient />

      {historyLead && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-history-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={handleCloseCallHistory}
            aria-hidden="true"
          />
          <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 id="call-history-title" className="text-base font-semibold text-slate-900">
                  Call History
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {historyLead.full_name} · {historyLead.phone}
                </p>
              </div>
              <button
                onClick={handleCloseCallHistory}
                aria-label="Close call history"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {historyLoading ? (
                <p className="text-sm text-slate-500">Loading call history...</p>
              ) : historyError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {historyError}
                </p>
              ) : callLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No calls have been logged for this lead yet.</p>
              ) : (
                <ul className="space-y-3">
                  {callLogs.map((log) => (
                    <li key={log.id} className="rounded-xl border border-slate-200 p-3.5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                          {log.call_status}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>

                      <dl className="mt-3 space-y-2.5 text-sm">
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Duration
                          </dt>
                          <dd className="text-slate-700">
                            {log.duration_seconds != null ? `${log.duration_seconds}s` : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Outcome
                          </dt>
                          <dd className="text-slate-700">
                            {log.call_outcome ? OUTCOME_LABELS[log.call_outcome] : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Callback Time
                          </dt>
                          <dd className="text-slate-700">{formatCallbackTime(log.callback_datetime)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            AI Summary
                          </dt>
                          <dd className="whitespace-pre-wrap text-slate-700">{log.ai_summary || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Next Action
                          </dt>
                          <dd className="text-slate-700">{log.next_action || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Transcript
                          </dt>
                          <dd className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600">
                            {log.transcript || "—"}
                          </dd>
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
