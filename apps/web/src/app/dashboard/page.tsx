import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — AI Lead Conversion",
  description: "Demo dashboard preview for the consent-first lead conversion workspace",
};

type PermissionState = "verified" | "review" | "excluded";

type Lead = {
  id: string;
  name: string;
  source: string;
  permission: PermissionState;
  status: string;
  updated: string;
};

type Campaign = {
  id: string;
  name: string;
  state: string;
  eligible: number;
  simulatedRuns: number;
};

type FollowUp = {
  id: string;
  title: string;
  owner: string;
  due: string;
};

const metrics = [
  { label: "Total leads", value: "248", note: "Demo dataset" },
  { label: "Permission verified", value: "176", note: "Eligible for review" },
  { label: "Needs review", value: "30", note: "Never auto-approved" },
  { label: "Excluded", value: "42", note: "No valid permission" },
  { label: "Interested leads", value: "31", note: "Ready for handover" },
  { label: "Follow-ups due", value: "9", note: "Next 24 hours" },
];

const leads: Lead[] = [
  {
    id: "LD-1041",
    name: "Asha Patel",
    source: "Website enquiry",
    permission: "verified",
    status: "Qualified",
    updated: "Today, 09:20",
  },
  {
    id: "LD-1040",
    name: "Rohit Shah",
    source: "CSV import",
    permission: "verified",
    status: "Interested",
    updated: "Today, 08:45",
  },
  {
    id: "LD-1039",
    name: "Meera Joshi",
    source: "Manual entry",
    permission: "review",
    status: "New",
    updated: "Yesterday, 17:10",
  },
  {
    id: "LD-1038",
    name: "Karan Mehta",
    source: "Website enquiry",
    permission: "excluded",
    status: "Invalid",
    updated: "Yesterday, 15:35",
  },
  {
    id: "LD-1037",
    name: "Nisha Rao",
    source: "CSV import",
    permission: "verified",
    status: "Contacted",
    updated: "Yesterday, 11:05",
  },
  {
    id: "LD-1036",
    name: "Aditya Desai",
    source: "Website enquiry",
    permission: "verified",
    status: "Interested",
    updated: "Yesterday, 10:40",
  },
  {
    id: "LD-1035",
    name: "Priya Nair",
    source: "Manual entry",
    permission: "review",
    status: "New",
    updated: "Yesterday, 09:15",
  },
  {
    id: "LD-1034",
    name: "Vijay Kumar",
    source: "CSV import",
    permission: "verified",
    status: "Contacted",
    updated: "Monday, 18:30",
  },
  {
    id: "LD-1033",
    name: "Sneha Iyer",
    source: "Website enquiry",
    permission: "excluded",
    status: "Do not contact",
    updated: "Monday, 16:05",
  },
  {
    id: "LD-1032",
    name: "Rahul Verma",
    source: "CSV import",
    permission: "verified",
    status: "Qualified",
    updated: "Monday, 14:20",
  },
  {
    id: "LD-1031",
    name: "Anjali Sharma",
    source: "Website enquiry",
    permission: "verified",
    status: "Interested",
    updated: "Monday, 11:50",
  },
  {
    id: "LD-1030",
    name: "Deepak Joshi",
    source: "Manual entry",
    permission: "review",
    status: "New",
    updated: "Monday, 09:10",
  },
  {
    id: "LD-1029",
    name: "Kavita Rana",
    source: "CSV import",
    permission: "verified",
    status: "Contacted",
    updated: "Friday, 17:45",
  },
  {
    id: "LD-1028",
    name: "Nikhil Bhatt",
    source: "Website enquiry",
    permission: "excluded",
    status: "Do not contact",
    updated: "Friday, 15:30",
  },
  {
    id: "LD-1027",
    name: "Pooja Menon",
    source: "Manual entry",
    permission: "verified",
    status: "Qualified",
    updated: "Friday, 12:05",
  },
  {
    id: "LD-1026",
    name: "Sanjay Gupta",
    source: "CSV import",
    permission: "review",
    status: "New",
    updated: "Friday, 10:20",
  },
  {
    id: "LD-1025",
    name: "Rina Kapoor",
    source: "Website enquiry",
    permission: "verified",
    status: "Contacted",
    updated: "Thursday, 18:10",
  },
  {
    id: "LD-1024",
    name: "Manish Chauhan",
    source: "CSV import",
    permission: "excluded",
    status: "Do not contact",
    updated: "Thursday, 16:40",
  },
  {
    id: "LD-1023",
    name: "Tara Sheth",
    source: "Manual entry",
    permission: "verified",
    status: "Qualified",
    updated: "Thursday, 13:25",
  },
  {
    id: "LD-1022",
    name: "Omkar Patil",
    source: "Website enquiry",
    permission: "review",
    status: "New",
    updated: "Thursday, 10:05",
  },
];

const campaigns: Campaign[] = [
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

const followUps: FollowUp[] = [
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

function permissionLabel(state: PermissionState): string {
  switch (state) {
    case "verified":
      return "Verified";
    case "review":
      return "Needs review";
    case "excluded":
      return "Excluded";
  }
}

export default function DashboardPage() {
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
            <span className="workspace-badge">Demo data</span>
          </header>

          <p className="demo-banner" role="status">
            Demo data only. All numbers, leads and campaigns below are static
            examples; no live calls, messages or customer records are used.
          </p>

          <section className="section" id="overview" aria-labelledby="overview-title">
            <div className="section-head">
              <h2 className="section-title" id="overview-title">
                Key numbers
              </h2>
              <p className="section-note">Snapshot of the sample dataset</p>
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
            <div className="guardrail">
              <span className="guardrail-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <p className="guardrail-title">Consent guardrails</p>
                <p className="guardrail-note">
                  0 simulated bypasses · 0 cross-tenant leaks in this demo view
                </p>
              </div>
            </div>
          </section>

          <section className="section" id="leads" aria-labelledby="leads-title">
            <div className="section-head">
              <h2 className="section-title" id="leads-title">
                Recent leads
              </h2>
              <p className="section-note">20 static sample leads · permission status shown for every lead</p>
            </div>
            <div className="table-wrap">
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
                        <span className="cell-primary">{lead.name}</span>
                        <span className="cell-secondary">{lead.id}</span>
                      </td>
                      <td>{lead.source}</td>
                      <td>
                        <span className="badge" data-state={lead.permission}>
                          {permissionLabel(lead.permission)}
                        </span>
                      </td>
                      <td>{lead.status}</td>
                      <td>{lead.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            Static preview for Task 0.4 · connected data appears in a later phase
          </footer>
        </div>
      </div>
    </main>
  );
}
