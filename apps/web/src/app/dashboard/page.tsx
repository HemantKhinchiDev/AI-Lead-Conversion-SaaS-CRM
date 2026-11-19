"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabase";

type Lead = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  property_interest: string | null;
  consent_given: boolean;
  status: "new" | "contacted" | "qualified" | "site_visit" | "closed" | "lost";
  created_at: string;
};

type CallSummary = {
  call_status: string;
  ai_summary: string | null;
};

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
  const supabase = getSupabaseClient()!;

  const [userEmail, setUserEmail] = useState<string>("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [callMap, setCallMap] = useState<Record<string, CallSummary>>({});
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [propertyInterest, setPropertyInterest] = useState("");
  const [consentGiven, setConsentGiven] = useState(true);

  async function loadUserAndLeads() {
    setLoading(true);
    setErrorMsg("");
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      router.replace("/login");
      return;
    }
    setUserEmail(authData.user.email || "");

    const [{ data, error }, { data: logsData }] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("call_logs").select("lead_id, call_status, ai_summary").order("created_at", { ascending: false }),
    ]);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setLeads((data as Lead[]) || []);
    }

    if (logsData) {
      const latest: Record<string, CallSummary> = {};
      for (const row of logsData as Array<{ lead_id: string; call_status: string; ai_summary: string | null }>) {
        if (!latest[row.lead_id]) {
          latest[row.lead_id] = { call_status: row.call_status, ai_summary: row.ai_summary };
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
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      router.replace("/login");
      return;
    }

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
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/voice/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lead_id: lead.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Failed to trigger AI call");
        return;
      }
      setCallMap((prev) => ({
        ...prev,
        [lead.id]: { call_status: json.status, ai_summary: json.ai_summary },
      }));
      if (json.mode === "sandbox") {
        setLeads((prev) =>
          prev.map((l) => (l.id === lead.id && l.status === "new" ? { ...l, status: "contacted" } : l))
        );
      }
      setSuccessMsg(`AI Voice Call (${json.status}) completed for ${lead.full_name}.`);
    } finally {
      setCallingLeadId(null);
    }
  }

  async function handleStatusChange(id: string, newStatus: Lead["status"]) {
    setErrorMsg("");
    const { error } = await supabase
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
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Property Interest</label>
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
                    <th className="py-2.5 pr-4">AI Voice Agent</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => {
                    const lastCall = callMap[lead.id];
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
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleTriggerVoiceCall(lead)}
                              disabled={callingLeadId === lead.id}
                              className="w-fit rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                            >
                              {callingLeadId === lead.id ? "Calling..." : "Trigger AI Call"}
                            </button>
                            {lastCall && (
                              <span className="text-[11px] text-slate-500 max-w-xs line-clamp-2">
                                [{lastCall.call_status}] {lastCall.ai_summary}
                              </span>
                            )}
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
      </main>
    </div>
  );
}
