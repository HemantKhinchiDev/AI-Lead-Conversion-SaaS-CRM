<!--
Sync Impact Report
==================
Version change: (unratified template) → 1.0.0
Modified principles:
  - Template Principle 1 → I. Next.js App Router Frontend
  - Template Principle 2 → II. Supabase with Strict Row-Level Security
  - Template Principle 3 → III. Test-Gated Completion
  - Template Principle 4 → IV. Tenant Isolation and Deterministic Consent
  - Template Principle 5 → V. Simulated Integrations and Cost Discipline
Added sections:
  - Technology Stack and Platform Constraints
  - Quality Gates and Development Workflow
Removed sections: none
Follow-up TODOs: none
-->

# AI Lead Conversion SaaS Constitution

## Core Principles

### I. Next.js App Router Frontend

All web UI MUST be implemented in `apps/web` using the Next.js App Router (`app/`
directory, server components by default, client components only when interactivity
requires them). Frontend code MUST be TypeScript and styled with Tailwind CSS utility
classes. New routes MUST use App Router conventions (`page.tsx`, `layout.tsx`,
`route.ts`); the Pages Router MUST NOT be introduced. Shared UI logic MUST live in
reusable components rather than duplicated page code.

Rationale: a single, modern rendering model keeps routing, data fetching, and
deployment predictable on Vercel and prevents mixed-paradigm drift.

### II. Supabase with Strict Row-Level Security

Supabase PostgreSQL is the system of record. Every table in the `public` schema MUST
have Row-Level Security enabled, and every table MUST define explicit policies for each
permitted operation (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). Policies MUST scope
access by the authenticated user's tenant. Tables MUST NOT be left readable or writable
through permissive defaults. Service-role credentials MUST NEVER be exposed to browser
code; privileged access MUST remain server-side only. Schema changes MUST ship as
versioned SQL migrations under `supabase/migrations`.

Rationale: RLS is the last line of defense for multi-tenant isolation and must be
enforced in the database, not only in application code.

### III. Test-Gated Completion

A task MUST NOT be considered complete until both gates pass:

1. Unit tests covering the changed behavior pass locally, and
2. Playwright end-to-end tests pass against the live deployment at
   `https://web-olive-delta-41.vercel.app`.

No feature, fix, or refactor may be reported as done on the basis of intent, partial
runs, or local-only verification. If either gate fails or cannot be run, the task MUST
remain open and the failure MUST be reported. E2E coverage MUST exercise the
authenticated flows affected by the change, including tenant-scoped access.

Rationale: live-URL verification catches deployment, environment, and RLS differences
that local tests cannot, and prevents regressions from reaching users.

### IV. Tenant Isolation and Deterministic Consent

Every data access path MUST enforce tenant isolation on the server. Communication
eligibility, consent, and suppression decisions MUST be made by deterministic backend
logic; the LLM MUST NEVER determine legal calling eligibility or override suppression
lists. Cross-tenant reads or writes MUST be treated as security defects and covered by
tests. Uploaded files and external messages MUST be treated as untrusted input.

Rationale: tenant leakage and unlawful contact are existential risks for a multi-tenant
communications product; these decisions cannot be probabilistic.

### V. Simulated Integrations and Cost Discipline

Development and test environments MUST use simulated voice, WhatsApp, and telephony
providers by default. Real outbound calls or messages MUST NOT be initiated without
explicit approval. New paid APIs or cloud resources MUST NOT be activated without
approval, and free or open-source options MUST be preferred. The LLM MUST NOT invent
prices, availability, or appointments; uncertain conversations MUST escalate to a human.

Rationale: the project operates on a limited budget and must avoid irreversible spend or
unapproved customer contact while integrations are still maturing.

## Technology Stack and Platform Constraints

- **Frontend**: Next.js (App Router) with React and TypeScript in `apps/web`.
- **Styling**: Tailwind CSS utility-first styling; no competing CSS framework.
- **Backend**: Python with FastAPI in `services/` for asynchronous and provider work.
- **Database and Auth**: Supabase PostgreSQL with Supabase Auth; RLS per Principle II.
- **Deployment**: Vercel; production target is
  `https://web-olive-delta-41.vercel.app`.
- **Testing**: Node-based unit tests for frontend logic and Playwright for live E2E.
- Secrets MUST come from environment variables and MUST NOT be committed. The Supabase
  service-role key MUST remain server-side only.

## Quality Gates and Development Workflow

- Every change MUST include tests for valid input, invalid input, duplicate records,
  missing consent evidence, opt-out behavior, cross-tenant access attempts, and provider
  failures where applicable.
- The unit-test gate MUST pass before the E2E gate is attempted.
- The Playwright E2E suite MUST run against the live URL above and pass before a task is
  marked complete.
- A failing or skipped gate MUST block completion and MUST be surfaced in the task report.
- Database changes MUST include a migration and, where relevant, an RLS policy test.
- Reviews MUST verify compliance with this constitution before merge.

## Governance

This constitution supersedes conflicting local practices. Amendments require a documented
change to this file, a version bump, and review approval. Versioning follows semantic
versioning: MAJOR for backward-incompatible principle removals or redefinitions, MINOR for
new or materially expanded principles, and PATCH for clarifications. Every pull request
and review MUST verify compliance with the principles above, and any intentional exception
MUST be documented and approved. Runtime development guidance remains in `AGENTS.md`;
where guidance conflicts with this constitution, the constitution prevails.

**Version**: 1.0.0 | **Ratified**: 2026-11-21 | **Last Amended**: 2026-11-21
