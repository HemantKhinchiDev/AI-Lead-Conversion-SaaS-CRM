# Implementation Plan: Consent-Gated AI Voice Agent

**Branch**: `001-voice-agent-e2e` | **Date**: `2026-11-21` | **Spec**: `specs/001-voice-agent-e2e/spec.md`

**Input**: Feature specification from spec.md; prerequisites: plan.md (template), spec.md (required), checklists/requirements.md

**Note**: This plan is filled in by the speckit workflow; constitution gates verified against .specify/memory/constitution.md (fallback: constitution principles from AGENTS.md §5).

## Summary
This feature implements the consent-gated AI voice agent slice specified in `specs/001-voice-agent-e2e/spec.md`. It covers Phase 1 live E2E verification (Tasks 1.1, 1.2), consent-gated voice trigger (Task 1.3), trusted webhook processing (Task 1.4), tenant-scoped call log export (Task 1.5), and n8n/Vapi/Retell orchestration (Task 1.6). The default simulated sandbox provider is used; no real calls, paid APIs, or customer data are permitted. All requirements must be verifiable with free, local tooling.

## Technical Context
- **Language/Version**: TypeScript 5.9, Python 3.11 (FastAPI), PostgreSQL via Supabase
- **Primary Dependencies**: `@supabase/supabase-js` 2.100.0, Next.js 15.5, FastAPI, Playwright, pytest
- **Storage**: Supabase PostgreSQL (multi-tenant), Supabase Auth
- **Testing**: pytest (backend), Playwright (live E2E), node --test (frontend)
- **Target Platform**: Vercel Free deployment (`https://web-olive-delta-41.vercel.app`), local Next.js dev server
- **Project Type**: Web application (Next.js frontend + FastAPI backend) with Supabase multi-tenant schema
- **Performance Goals**: Simulated trigger returns within 2s p95; external dispatch respects configured timeout
- **Constraints**: ₹0 budget mandate (free-tier only); no paid APIs, no real telephony, no paid model tiers; service-role keys never in browser code; tenant isolation on every read/write; consent-gated blocking must be deterministic
- **Scale/Scope**: Two synthetic tenants for E2E; synthetic leads only; no real customer data

**Constitution Check GATE**: Must pass before Phase 2 user story work can begin. Verified by: (a) plan.md constitution gates aligned with AGENTS.md §5, (b) live E2E gate against deployed URL with two synthetic tenants, (c) zero real calls / zero secret exposure, (d) all cross-tenant isolation tests pass with zero target changes.

## Constitution Check
*GATE: Must pass before Phase 2 user story work can begin. Re-check after Phase 1 design.*

- **G1**: Live E2E suite runs against `https://web-olive-delta-41.vercel.app` with two synthetic tenants; cross-tenant read/write attempts denied with zero target changes
- **G2**: `POST /api/voice/trigger` is consent-gated: 401 without session, 403 without tenant membership, 400 for missing/malformed lead_id, 404 for foreign lead, 403 for no consent/do_not_contact/excluded/review_required, 409 for duplicate active call
- **G3**: `POST /api/voice/webhook` fail-closed: 401 missing/invalid secret, 503 when VOICE_WEBHOOK_SECRET not configured, 400 for malformed body/invalid status/duration/lead_status, 404 for unknown call_id
- **G4**: `GET /api/tenant/call_logs/export` tenant-scoped: 401 without session, 403 without membership, 200 with tenant-only rows, CSV safety (formula neutralization), 500 without partial file
- **G5**: `public.call_logs` schema has proper constraints, indexes, RLS; `provider` constrained to `vapi_or_n8n` or `sandbox_voice_sim`; `mode` constrained to `simulated` or `live`; `call_status` constrained to `queued`, `in_progress`, `completed`, `no_answer`, `failed`; `estimated_cost_inr` defaults to `0.00`; `duration_seconds` defaults to `0` and is non-negative
- **G6**: No Supabase service-role key, database URL or webhook secret in browser bundle or public environment variables
- **G7**: Audit events for consent changes, lead-status changes, call dispatch, callback processing and export are append-only and tenant-scoped

[No constitution violations found. All gates align with AGENTS.md §5 and spec.md FR-001 through FR-093.]

## Project Structure
Documentation (this feature):

```text
specs/001-voice-agent-e2e/
├── plan.md              # This file
├── spec.md              # Feature specification
├── quickstart.md        # Phase 1 output (to be created)
├── contracts/           # Phase 1 output (to be created)
│   └── voice-api.md     # Voice/export/webhook contracts (to be created)
└── tasks.md             # Phase 2 output
```

Source Code (repository root):
- `apps/web/src/` — Next.js 15 frontend (pages, components, lib/, app/)
- `apps/web/package.json` — Pinned free npm dependencies only
- `apps/web/.env.example` — Environment placeholders (updated)
- `services/api/` — FastAPI backend (if extracted; currently inline in Next.js app router)
- `supabase/migrations/` — Version-controlled SQL migrations
- `tests/backend/` — pytest contract tests
- `tests/frontend/` — Frontend offline/static tests
- `tests/e2e/` — Playwright live E2E tests

**Structure Decision**: Selected "Web application" layout (Option 2) per AGENTS.md §4. Real directories: `apps/web/src/`, `supabase/migrations/`, `tests/backend/`, `tests/frontend/`, `tests/e2e/`. No Option 3 (mobile) or standalone API structure.

## Complexity Tracking
> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |