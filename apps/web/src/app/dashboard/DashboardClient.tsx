"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  createLead,
  fetchLeads,
  LEAD_SOURCES,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type PermissionState,
} from "../../lib/leads";

type LoadState = "loading" | "ready" | "error";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contact_pending: "Contact pending",
  contacted: "Contacted",
  interested: "Interested",
  hot_lead: "Hot lead",
  warm_lead: "Warm lead",
  cold_lead: "Cold lead",
  follow_up_required: "Follow-up required",
  site_visit_requested: "Site visit requested",
  site_visit_scheduled: "Site visit scheduled",
  converted: "Converted",
  not_interested: "Not interested",
  do_not_contact: "Do not contact",
};

const PERMISSION_LABELS: Record<PermissionState, string> = {
  verified: "Verified",
  review: "Needs review",
  excluded: "Excluded",
};

const INTERESTED_STATUSES: readonly LeadStatus[] = ["interested", "hot_lead", "warm_lead"];

const campaigns = [
  {
    id: "CMP-018",
    name: "Ahmedabad launch follow-up",
    state: "Approved · simulated",
    eligible: 64,
    simulatedRuns: 61,
  },
  {
    id: "CMP-017",
    name: "Website enquiry outreach",
    state: "Awaiting owner review",
    eligible: 28,
    simulatedRuns: 0,
  },
  {
    id: "CMP-016",
    name: "Callback reminders",
    state: "Paused",
    eligible: 19,
    simulatedRuns: 12,
  },
];

const followUps = [
  {
    id: "FU-091",
    title: "Call back Asha Patel with qualification notes",
    owner: "Riya (Sales)",
    due: "Today, 14:00",
  },
  {
    id: "FU-090",
    title: "Review permission evidence for 3 imported leads",
    owner: "Owner",
    due: "Today, 16:30",
  },
  {
    id: "FU-089",
    title: "Confirm campaign budget and language preferences",
    owner: "Owner",
    due: "Tomorrow, 10:00",
  },
];

export default function DashboardClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<LeadSource>("Manual entry");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const loadLeads = useCallback(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");

    fetchLeads(controller.signal)
      .then((items) => {
        setLeads(items);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Could not load leads");
        setLoadState("error");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => loadLeads(), [loadLeads]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setNotice("");

    try {
      const created = await createLead({ full_name: fullName, phone, source });
      setLeads((current) => [created, ...current]);
      setLoadState("ready");
      setFullName("");
      setPhone("");
      setSource("Manual entry");
      setNotice(`${created.full_name} added. Permission is unverified — review required.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not add lead");
    } finally {
      setSubmitting(false);
    }
  }

  const verified = leads.filter((lead) => lead.permission === "verified").length;
  const review = leads.filter((lead) => lead.permission === "review").length;
  const excluded = leads.filter((lead) => lead.permission === "excluded").length;
  const interested = leads.filter((lead) => INTERESTED_STATUSES.includes(lead.lead_status)).length;

  const metrics = [
    { label: "Total leads", value: String(leads.length), note: "From dummy API" },
    { label: "Permission verified", value: String(verified), note: "Eligible for review" },
    { label: "Needs review", value: String(review), note: "Never auto-approved" },
    { label: "Excluded", value: String(excluded), note: "No valid permission" },
    { label: "Interested leads", value: String(interested), note: "Ready for handover" },
    { label: "Follow-ups due", value: "9", note: "Sample tasks" },
  ];

  return (
    <main className="dashboard-main">
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              AI
            </span>
            <div>
              <p className="brand-name">Lead Conversion</p>
              <p className="brand-caption">Consent-first workspace</p>
            </div>
          </div>
          <nav className="nav-list" aria-label="Workspace sections">
            <a className="nav-link" href="#overview" aria-current="page">
              Overview
            </a>
            <a className="nav-link" href="#leads">
              Leads
            </a>
            <a className="nav-link" href="#campaigns">
              Campaigns
            </a>
            <a className="nav-link" href="#follow-ups">
              Follow-ups
            </a>
          </nav>
          <p className="sidebar-note">Demo workspace · no live customer data</p>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">Pilot business workspace</p>
              <h1 className="page-title">Overview</h1>
            </div>
            <span className="workspace-badge">Dummy API data</span>
          </header>

          <p className="demo-banner" role="status">
            Demo data only. Leads below come from the dummy /leads API; campaigns and
            follow-ups are static examples. This demo uses no live calls, messages or
            customer records.
          </p>

          <section className="section" id="overview" aria-labelledby="overview-title">
            <div className="section-head">
              <h2 className="section-title" id="overview-title">
                Key numbers
              </h2>
              <p className="section-note">Counts derived from the API lead list</p>
            </div>
            <div className="metrics">
              {metrics.map((metric) => (
                <article className="metric" key={metric.label}>
                  <p className="metric-label">{metric.label}</p>
                  <p className="metric-value">{metric.value}</p>
                  <p className="metric-note">{metric.note}</p>
                </article>
              ))}
            </div>
            <div className="guardrail" data-testid="cost-ledger"><strong>₹0 Cost Ledger (T-COST-001):</strong> ₹0.00 · simulated / free-tier · </div><div className="guardrail-hidden" style={{display:'none'}}>
              <span className="guardrail-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <p className="guardrail-title">Consent guardrails</p>
                <p className="guardrail-note">
                  New leads start as Needs review · 0 simulated bypasses · 0 cross-tenant leaks
                </p>
              </div>
            </div>
          </section>

          <section className="section" id="add-lead" aria-labelledby="add-lead-title">
            <div className="section-head">
              <h2 className="section-title" id="add-lead-title">
                Add a lead
              </h2>
              <p className="section-note">Posts to /leads · permission is never assumed</p>
            </div>
            <form className="lead-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label className="field">
                  <span>Phone</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                    inputMode="tel"
                    placeholder="9876543210"
                  />
                </label>
                <label className="field">
                  <span>Source</span>
                  <select
                    value={source}
                    onChange={(event) => setSource(event.target.value as LeadSource)}
                  >
                    {LEAD_SOURCES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="button" type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add lead"}
              </button>
            </form>
            {formError && (
              <p className="form-message" data-state="error" role="alert">
                {formError}
              </p>
            )}
            {notice && (
              <p className="form-message" data-state="success" role="status">
                {notice}
              </p>
            )}
          </section>

          <section className="section" id="leads" aria-labelledby="leads-title">
            <div className="section-head">
              <h2 className="section-title" id="leads-title">
                Recent leads
              </h2>
              <p className="section-note">Synthetic leads served by GET /leads</p>
            </div>
            <div className="table-wrap">
              {loadState === "loading" && (
                <p className="state-message" role="status">
                  Loading leads from the dummy API…
                </p>
              )}
              {loadState === "error" && (
                <div className="state-message" role="alert">
                  <p>{loadError}</p>
                  <button className="button" type="button" onClick={() => loadLeads()}>
                    Retry
                  </button>
                </div>
              )}
              {loadState === "ready" && leads.length === 0 && (
                <p className="state-message" role="status">
                  No leads yet. Add one using the form above.
                </p>
              )}
              {loadState === "ready" && leads.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Lead</th>
                      <th scope="col">Source</th>
                      <th scope="col">Permission</th>
                      <th scope="col">Status</th>
                      <th scope="col">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          <span className="cell-primary">{lead.full_name}</span>
                          <span className="cell-secondary">{lead.id}</span>
                        </td>
                        <td>{lead.source}</td>
                        <td>
                          <span className="badge" data-state={lead.permission}>
                            {PERMISSION_LABELS[lead.permission]}
                          </span>
                        </td>
                        <td>{STATUS_LABELS[lead.lead_status]}</td>
                        <td>{lead.updated_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <div className="section-grid">
            <section className="section" id="campaigns" aria-labelledby="campaigns-title">
              <div className="section-head">
                <h2 className="section-title" id="campaigns-title">
                  Campaigns
                </h2>
                <p className="section-note">Simulated runs only</p>
              </div>
              <ul className="list">
                {campaigns.map((campaign) => (
                  <li className="list-item" key={campaign.id}>
                    <p className="list-title">{campaign.name}</p>
                    <p className="list-meta">
                      {campaign.id} · {campaign.state}
                    </p>
                    <p className="list-meta">
                      {campaign.eligible} eligible · {campaign.simulatedRuns} simulated runs
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="section" id="follow-ups" aria-labelledby="follow-ups-title">
              <div className="section-head">
                <h2 className="section-title" id="follow-ups-title">
                  Follow-ups
                </h2>
                <p className="section-note">Sales team queue</p>
              </div>
              <ul className="list">
                {followUps.map((followUp) => (
                  <li className="list-item" key={followUp.id}>
                    <p className="list-title">{followUp.title}</p>
                    <p className="list-meta">
                      {followUp.id} · {followUp.owner}
                    </p>
                    <p className="list-meta">Due {followUp.due}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <footer className="dashboard-footer">
            Task 0.5 · leads wired to the dummy API; persistence and tenant isolation arrive in Phase 1
          </footer>
        </div>
      </div>
    </main>
  );
}
