
# AI Lead Conversion Platform

An AI-powered lead conversion platform that helps businesses manage, qualify, and convert leads through automated voice calls, WhatsApp conversations, and website enquiries.

The first target market is real estate builders and developers in India, starting with a pilot involving approximately three businesses.

---

## 1. Product Vision

Build a multi-tenant SaaS platform that helps businesses:

- Import leads using Excel or CSV files.
- Validate and organize customer information.
- Check communication permission and consent.
- Launch approved follow-up campaigns.
- Automatically call eligible leads using AI voice agents.
- Answer customer questions through official WhatsApp Business integrations.
- Capture new enquiries from business websites.
- Qualify leads and record customer interests.
- Assign interested customers to human sales representatives.
- Track conversations, follow-ups, and conversion performance.

**Our goal is not just to build an AI receptionist. We are building an AI Lead Conversion Platform.**

---

## 2. Target Users

### Primary users

- Real estate builders
- Property developers
- Real estate sales teams
- Real estate marketing agencies

### Future industries

- Education
- Healthcare
- Automotive
- Insurance
- Financial services
- Other lead-driven businesses

---

## 3. Core Features

### Lead Management

- Excel/CSV import
- Phone number validation
- Duplicate detection
- Lead status management
- Consent and permission tracking
- Lead search and filtering

### AI Voice Agent

- Automated outbound calls to eligible leads
- Incoming call handling, subject to telephony support
- Hindi, English, and Gujarati language support
- Lead qualification
- Conversation summaries
- Call outcomes and follow-up recommendations

### WhatsApp AI Agent

- Official WhatsApp Business Platform integration
- AI-powered customer responses
- Approved business information
- Lead qualification
- Follow-up management
- Human handover

### Website Enquiries

- Website enquiry integration
- Secure webhook endpoints
- Automatic lead creation
- Permission-aware follow-up

### Dashboard and Analytics

- Total leads
- Eligible and excluded leads
- Campaign performance
- Call history
- WhatsApp conversation history
- Interested leads
- Follow-up tasks
- Conversion reports

### Human Handover

- Transfer to a live sales representative when supported and available.
- Otherwise, create a callback task and notify the sales team.

---

## 4. Technology Stack

The following is our proposed stack. Some integrations remain subject to testing and final selection.

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| UI | React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth (final approach to be confirmed) |
| AI Model Gateway | OpenRouter (candidate) |
| Speech-to-Text | Whisper / Faster-Whisper |
| Voice Transport | LiveKit (candidate) |
| Text-to-Speech | To be selected after testing |
| Telephony | To be selected after India compliance checks |
| WhatsApp | Official WhatsApp Business Platform |
| Source Control | GitHub |
| Development | GitHub Codespaces |
| AI Coding Agent | OpenHands |
| Testing | Pytest, Playwright |

We will prefer modular, replaceable integrations instead of tightly coupling the application to one AI or communication provider.

---

## 5. Project Structure

```text
ai-lead-conversion-platform/
│
├── apps/
│   └── web/
│       └── src/
│           └── app/
│
├── services/
│   └── api/
│       └── app/
│
├── tests/
│   ├── backend/
│   ├── frontend/
│   └── integration/
│
├── decisions/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── ROADMAP.md
│   └── AGENTS.md
│
├── AGENTS.md
├── README.md
├── WORKFLOW.md
└── .gitignore
```

The authoritative product documents are under `docs/`, with numbered decisions under `decisions/`.

---

## 6. Important Business Rules

1. A phone number alone does not establish permission to contact someone.
2. Only leads with verified permission for the intended communication can enter the relevant campaign.
3. The business owner must review and approve a campaign before it starts.
4. Campaign approval starts queue processing; it does not mean all calls happen simultaneously.
5. Calling hours, customer preferences, provider limits, and applicable regulations must be respected.
6. WhatsApp messaging must follow official Meta policies, including opt-in, templates, and the applicable customer-service window.
7. AI must never invent property prices, availability, discounts, or appointment confirmations.
8. Approved business data and backend records are the source of truth.
9. Each business must have isolated data and access permissions.
10. Live communication campaigns must not run during development or testing.

---

## 7. Security and Compliance

Security and compliance are core product requirements.

- Enforce tenant-level data isolation.
- Protect API keys and secrets using environment variables.
- Validate and authorize all API requests.
- Apply database access policies.
- Keep audit records for important actions.
- Protect customer personal information.
- Respect applicable Indian TRAI commercial communication requirements.
- Follow India's applicable DPDP requirements and rules.
- Use only official WhatsApp Business integrations.
- Obtain qualified compliance review before production campaigns.

Never bypass consent, customer preferences, or communication restrictions.

---

## 8. Development Principles

- Build one feature at a time.
- Prefer a modular monolith for the initial MVP.
- Keep frontend and backend responsibilities separate.
- Use TypeScript for frontend code.
- Use type-safe validation in backend APIs.
- Write tests for critical business rules.
- Keep integrations replaceable.
- Avoid unnecessary dependencies.
- Prefer free or low-cost services during development.
- Never activate paid services without explicit approval.
- Never expose API keys or customer data.
- Never use real customer phone numbers for development testing without proper authorization.

---

## 9. MVP Scope

The initial MVP should prove that the platform can:

1. Create and manage a business account.
2. Import leads from Excel/CSV.
3. Validate and deduplicate imported leads.
4. Record and evaluate communication permission.
5. Allow an owner to approve a campaign.
6. Process eligible leads through a controlled queue.
7. Connect an AI voice workflow using an approved provider.
8. Record call outcomes and conversation summaries.
9. Manage follow-up tasks.
10. Demonstrate the workflow with a small real-estate pilot.

WhatsApp and website integrations should be developed in planned stages after the core lead workflow is stable.

---

## 10. Project Documentation

Read these documents before implementing features:

| File | Purpose |
|---|---|
| `docs/PRD.md` | Product requirements: what we are building and why |
| `docs/ARCHITECTURE.md` | Technical architecture: how the system is structured |
| `docs/DATABASE.md` | Database entities, relationships, and data rules |
| `WORKFLOW.md` | Business processes and application workflows |
| `docs/ROADMAP.md` | Development phases and implementation order |
| `AGENTS.md` | Instructions for AI coding agents |

Do not introduce requirements that conflict with the PRD.

---

## 11. Current Development Status

**Project stage:** Foundation complete (Tasks 0.1–0.4); next phase is database and authentication

| Area | Status |
|---|---|
| Product concept | Defined |
| PRD | Drafted |
| Architecture | Drafted |
| Database design | Pending |
| Workflow documentation | Pending |
| Development roadmap | Pending |
| Frontend implementation | Foundation shell implemented (Task 0.3) |
| Demo dashboard | Static preview at `/dashboard` (Task 0.4), labelled demo data only |
| Backend implementation | Foundation health slice implemented |
| AI voice integration | Not started |
| WhatsApp integration | Not started |
| Pilot testing | Not started |

Update this section as implementation progresses.

---

## 12. Long-Term Vision

Build a reliable, scalable AI platform that helps businesses respond to leads faster, qualify prospects automatically, reduce manual follow-up, and improve sales conversions.

Start with real estate. Prove the product with real customers. Expand to other industries only after validating the core platform.
