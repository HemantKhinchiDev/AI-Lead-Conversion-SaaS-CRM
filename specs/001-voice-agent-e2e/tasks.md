# Tasks: Consent-Gated AI Voice Agent & Phase 1 E2E Verification

**Input**: Design documents from `/specs/001-voice-agent-e2e/`
**Prerequisites**: plan.md (template), spec.md (required), checklists/requirements.md

**Tests**: Included. The spec defines a test matrix and the constitution requires unit tests and Playwright E2E against `https://web-olive-delta-41.vercel.app` before completion.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `apps/web/src/`, `apps/web/tests/`
- **Python tests**: `tests/backend/`, `tests/frontend/`
- **Supabase migrations**: `supabase/migrations/`
- **Feature docs**: `specs/001-voice-agent-e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish feature scaffolding, test commands, and environment contracts.

- [x] T001 Review `specs/001-voice-agent-e2e/spec.md`, `docs/PRD.md`, `docs/DATABASE.md`, `WORKFLOW.md`, and `.specify/memory/constitution.md`; record implementation gaps and no-scope confirmations in `specs/001-voice-agent-e2e/plan.md`
- [x] T002 [P] Create feature implementation plan with actual tech stack, structure, and constitution gates in `specs/001-voice-agent-e2e/plan.md`
- [x] T003 [P] Create feature quickstart with local commands, live E2E gate, and simulated-provider defaults in `specs/001-voice-agent-e2e/quickstart.md`
- [x] T004 [P] Document voice/export/webhook contracts and environment variables in `specs/001-voice-agent-e2e/contracts/voice-api.md`
- [x] T005 [P] Add missing server-side env placeholders (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOICE_WEBHOOK_SECRET`, `VOICE_AGENT_TRIGGER_SECRET`, `VOICE_AGENT_TIMEOUT_SECONDS`, `VOICE_AGENT_MODE`) to `apps/web/.env.example`
- [x] T006 [P] Add/align Playwright E2E test configuration and scripts for live deployment runs in `apps/web/package.json` and `apps/web/playwright.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema, auth helpers, audit, and test harness required by all stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T007 Create/adjust `public.call_logs` schema migration to match spec fields, defaults, constraints, and indexes (`id`, `tenant_id`, `user_id`, `lead_id`, `provider`, `call_status`, `duration_seconds`, `transcript`, `ai_summary`, `next_action`, `estimated_cost_inr`, `mode`, `created_at`) in `supabase/migrations/20261121_align_call_logs_spec.sql`
- [x] T008 Add tenant-lead consistency protection and tenant-scoped RLS policies for `public.call_logs` in `supabase/migrations/20261121_align_call_logs_spec.sql`
- [x] T009 [P] Add append-only tenant-scoped audit event migration for consent, lead-status, dispatch, callback, and export actions in `supabase/migrations/20261121_create_voice_audit_events.sql`
- [x] T010 [P] Implement shared server auth/membership resolver (bearer token, `auth.getUser`, single `public.users` tenant membership, 401/403 handling) in `apps/web/src/lib/serverAuth.ts`
- [x] T011 [P] Implement shared CSV safety/attachment helper with formula neutralization and `no-store` headers in `apps/web/src/lib/csvExport.ts`
- [x] T012 [P] Implement shared audit logger and structured security event logger (no secrets/transcripts by default) in `apps/web/src/lib/auditLog.ts`
- [x] T013 [P] Create reusable Playwright fixtures/helpers for synthetic tenant creation, login, cleanup, and live base URL in `apps/web/tests/e2e/helpers.ts`
- [x] T014 [P] Add migration contract tests for `call_logs` columns, constraints, indexes, RLS, and tenant-lead consistency in `tests/backend/test_call_logs_migration.py`
- [x] T015 [P] Add migration contract tests for audit-event table append-only/tenant-scope expectations in `tests/backend/test_voice_audit_migration.py`

**Checkpoint**: Schema, shared helpers, and test harness are ready; user story implementation can begin.

---

## Phase 3: User Story 1 - Live Authentication, Tenant Creation & RLS Verification (Priority: P1) 🎯 MVP

**Goal**: Prove Task 1.1 on the live deployment with two synthetic tenants and no cross-tenant access.

**Independent Test**: Run Playwright against `https://web-olive-delta-41.vercel.app` with two synthetic tenants; registration/login/guard/sign-out pass and all cross-tenant read/write attempts fail with zero target changes.

### Tests for User Story 1

- [x] T016 [P] [US1] Add Playwright live auth flow test for registration, login, invalid credentials, and sign-out in `apps/web/tests/e2e/auth.live.spec.ts`
- [x] T017 [P] [US1] Add Playwright live route-guard and secret-exposure test for `/dashboard`, redirect to `/login`, and browser bundle inspection in `apps/web/tests/e2e/auth-guard.live.spec.ts`
- [x] T018 [P] [US1] Add Playwright live cross-tenant RLS test for tenants/users/leads/call_logs read and write denial in `apps/web/tests/e2e/tenant-isolation.live.spec.ts`
- [x] T019 [P] [US1] Extend offline auth/static checks for login, session handling, and no service-role exposure in `tests/frontend/test_auth_offline.py`

### Implementation for User Story 1

- [ ] T020 [US1] Fix live auth/tenant-creation defects exposed by E2E in `apps/web/src/app/login/page.tsx` and `apps/web/src/app/auth/callback/page.tsx`
- [ ] T021 [US1] Fix session guard and sign-out behavior for unauthenticated dashboard access in `apps/web/src/app/dashboard/page.tsx` and `apps/web/src/app/dashboard/DashboardClient.tsx`
- [ ] T022 [US1] Ensure Supabase browser client uses only public env vars and no backend secrets in `apps/web/src/lib/supabase.ts` and `apps/web/.env.example`
- [ ] T023 [US1] Add/adjust Supabase tenant bootstrap/RLS migration fixes required by live gate in `supabase/migrations/20261121_fix_tenant_rls_auth.sql`
- [ ] T024 [US1] Record US1 live E2E evidence, failures, and pass/fail status in `specs/001-voice-agent-e2e/quickstart.md`

**Checkpoint**: Task 1.1 passes live E2E or remains explicitly open with reported failures.

---

## Phase 4: User Story 2 - Tenant-Scoped Leads CRUD Verification (Priority: P1)

**Goal**: Prove Task 1.2 on the live deployment with tenant-scoped lead CRUD and consent enforcement.

**Independent Test**: Using two synthetic tenants, create/read/update/delete leads in one tenant, verify consent-required create, and confirm cross-tenant lead access/mutation is denied with no target change.

### Tests for User Story 2

- [x] T025 [P] [US2] Add Playwright live lead CRUD test for consent-required create, status update, delete, and reload persistence in `apps/web/tests/e2e/leads-crud.live.spec.ts`
- [ ] T026 [P] [US2] Add Playwright live cross-tenant lead denial test for read/update/delete attempts in `apps/web/tests/e2e/leads-isolation.live.spec.ts`
- [ ] T027 [P] [US2] Extend offline dashboard/lead checks for empty/error states and consent gating in `tests/frontend/test_dashboard_offline.py` and `tests/frontend/test_frontend_offline.py`
- [ ] T028 [P] [US2] Extend API/unit tests for tenant-scoped lead payload/status rules in `apps/web/tests/leads.test.mjs` and `apps/web/tests/lead-import.test.mjs`

### Implementation for User Story 2

- [ ] T029 [US2] Fix dashboard lead create/update/delete flows to enforce explicit consent and valid status transitions in `apps/web/src/app/dashboard/DashboardClient.tsx`
- [ ] T030 [US2] Fix lead library/API helpers for tenant-scoped requests and canonical statuses in `apps/web/src/lib/leads.ts`
- [ ] T031 [US2] Fix lead import route to preserve tenant scoping, consent evidence, and deterministic exclusion reasons in `apps/web/src/app/api/leads/import/route.ts` and `apps/web/src/lib/leadImport.ts`
- [ ] T032 [US2] Fix lead export route to use shared auth/CSV helpers and tenant-only query scope in `apps/web/src/app/api/leads/export/route.ts`
- [ ] T033 [US2] Add/adjust Supabase leads RLS or constraint fixes required by live CRUD gate in `supabase/migrations/20261121_fix_leads_rls_consent.sql`
- [ ] T034 [US2] Record US2 live E2E evidence, failures, and pass/fail status in `specs/001-voice-agent-e2e/quickstart.md`

**Checkpoint**: Task 1.2 passes live E2E or remains explicitly open with reported failures.

---

## Phase 5: User Story 3 - Consent-Gated Voice Trigger (Priority: P1)

**Goal**: Implement deterministic, tenant-safe `POST /api/voice/trigger` with sandbox default and optional external dispatch.

**Independent Test**: Call trigger with missing session, missing membership, malformed lead_id, foreign lead, unconsented/excluded/review-required lead, eligible sandbox lead, configured webhook lead, duplicate active call, and consent-withdrawn-before-dispatch; verify status codes, call_logs rows, dispatch behavior, and zero real calls.

### Tests for User Story 3

- [ ] T035 [P] [US3] Add unit tests for voice eligibility, UUID validation, duplicate-active-call detection, and sandbox/external mode decisions in `apps/web/tests/voice-guard.test.mjs`
- [ ] T036 [P] [US3] Add route contract tests for `POST /api/voice/trigger` auth, 400/401/403/404/409/5xx cases, and response shape in `apps/web/tests/voice-trigger.test.mjs`
- [ ] T037 [P] [US3] Add integration-style test for consent-withdrawn-before-dispatch and no-dispatch failure recording in `apps/web/tests/voice-trigger-dispatch.test.mjs`
- [ ] T038 [P] [US3] Extend backend migration/static tests for call_logs provider/mode/cost/status constraints used by trigger in `tests/backend/test_call_logs_migration.py`

### Implementation for User Story 3

- [x] T039 [P] [US3] Extend eligibility guard for ADR-0001 statuses, `do_not_contact`/`excluded`/`review_required`, and lead-status normalization helpers in `apps/web/src/lib/voiceGuard.ts`
- [ ] T040 [US3] Implement trigger route auth, tenant membership resolution, lead lookup, deterministic consent/eligibility checks, and 404 no-leak behavior in `apps/web/src/app/api/voice/trigger/route.ts`
- [ ] T041 [US3] Implement active-call duplicate guard (409) and queued call_log creation with `provider`, `mode`, `estimated_cost_inr=0.00`, and tenant/user/lead fields in `apps/web/src/app/api/voice/trigger/route.ts`
- [ ] T042 [US3] Implement sandbox simulation path with deterministic transcript/summary, no network calls, and lead `contacted` update in `apps/web/src/app/api/voice/trigger/route.ts`
- [ ] T043 [US3] Implement optional external dispatch with timeout, trigger secret header, documented payload, pre-dispatch recheck, and failure recording including `call_id` in `apps/web/src/app/api/voice/trigger/route.ts`
- [ ] T044 [US3] Add audit/structured log events for blocked consent, duplicate trigger, dispatch, and dispatch failure in `apps/web/src/app/api/voice/trigger/route.ts` and `apps/web/src/lib/auditLog.ts`
-[x] T045 [US3] Update dashboard voice trigger UI/error handling to surface actionable non-secret errors and call status in `apps/web/src/app/dashboard/DashboardClient.tsx`

**Checkpoint**: US3 trigger is independently testable, consent-gated, and sandbox-safe.

---

## Phase 6: User Story 4 - Trusted Webhook Result Processing (Priority: P1)

**Goal**: Implement secure, idempotent `POST /api/voice/webhook` that updates only the correct tenant call/lead state.

**Independent Test**: Post valid, missing/invalid secret, unconfigured secret, unknown call, malformed body, invalid status/duration/lead_status, alias `site_visit`, duplicate terminal, late non-terminal, and body-tenant-mismatch callbacks; verify status codes, atomic updates, no regressions, and audit behavior.

### Tests for User Story 4

- [ ] T046 [P] [US4] Add route contract tests for webhook secret fail-closed, 400/401/403/404/503 cases, and stable success body in `apps/web/tests/voice-webhook.test.mjs`
- [ ] T047 [P] [US4] Add idempotency/state-transition tests for duplicate terminal callbacks and late non-terminal callbacks in `apps/web/tests/voice-webhook-idempotency.test.mjs`
- [ ] T048 [P] [US4] Add validation tests for call_status, duration_seconds, lead_status alias normalization, and length-limited untrusted text fields in `apps/web/tests/voice-guard.test.mjs`
- [ ] T049 [P] [US4] Add backend migration/static tests for webhook-updated fields and RLS/service-role assumptions in `tests/backend/test_call_logs_migration.py`

### Implementation for User Story 4

- [ ] T050 [P] [US4] Implement webhook validation helpers for constant-time secret compare, UUID/status/duration checks, and text length limits in `apps/web/src/lib/voiceWebhook.ts`
- [ ] T051 [US4] Implement webhook route fail-closed secret handling, JSON/body validation, and trusted call_log lookup in `apps/web/src/app/api/voice/webhook/route.ts`
- [ ] T052 [US4] Implement atomic call_log update, terminal-state no-regression, and duplicate-callback idempotency in `apps/web/src/app/api/voice/webhook/route.ts`
- [ ] T053 [US4] Implement tenant-safe lead status update using stored call_log tenant/lead only, with `site_visit` alias normalization and unsupported-status rejection in `apps/web/src/app/api/voice/webhook/route.ts`
- [ ] T054 [US4] Add audit events for accepted/rejected callbacks and lead-status transitions without secrets/transcripts in `apps/web/src/app/api/voice/webhook/route.ts` and `apps/web/src/lib/auditLog.ts`

**Checkpoint**: US4 webhook is secure, idempotent, and tenant-safe.

---

## Phase 7: User Story 5 - Tenant-Scoped Call Log Export (Priority: P2)

**Goal**: Provide secure `GET /api/tenant/call_logs/export` CSV export for the authenticated tenant only.

**Independent Test**: Request export with no session, no membership, empty logs, and two tenants with data; verify 401/403/200/500 behavior, exact headers/filename/order, CSV safety, and no cross-tenant rows.

### Tests for User Story 5

- [ ] T055 [P] [US5] Extend route unit/static tests for export auth, headers, filename, ordering, and no client tenant_id input in `apps/web/tests/call-logs-export.test.mjs`
- [ ] T056 [P] [US5] Add CSV safety tests for formula prefixes, quotes, commas, newlines, and Unicode in `apps/web/tests/call-logs-export.test.mjs`
- [ ] T057 [P] [US5] Add Playwright/API live verification for two-tenant export isolation in `apps/web/tests/e2e/call-logs-export.live.spec.ts`

### Implementation for User Story 5

-[x] T058 [US5] Refactor export route to use shared auth and CSV helpers while preserving tenant-only query scope in `apps/web/src/app/api/tenant/call_logs/export/route.ts`
- [ ] T059 [US5] Add export audit event recording with actor, tenant, timestamp, and action in `apps/web/src/app/api/tenant/call_logs/export/route.ts` and `apps/web/src/lib/auditLog.ts`
- [ ] T060 [US5] Ensure export failure path returns 500 without partial file and logs non-secret error context in `apps/web/src/app/api/tenant/call_logs/export/route.ts`

**Checkpoint**: US5 export is tenant-safe, CSV-safe, and auditable.

---

## Phase 8: User Story 6 - n8n / Vapi / Retell Orchestration (Priority: P2)

**Goal**: Document and validate optional external workflow integration while keeping sandbox default and backend as source of truth.

**Independent Test**: Run trigger with no webhook configured and with a test webhook/stub; verify payload, secret headers, no consent recalculation, bounded retries/idempotent callback, simulated mode, and zero real calls.

### Tests for User Story 6

- [ ] T061 [P] [US6] Add contract tests for outbound workflow payload shape, required secrets, and sandbox fallback in `apps/web/tests/voice-workflow-contract.test.mjs`
- [ ] T062 [P] [US6] Add integration test/stub for workflow callback retry safety and idempotent webhook handling in `apps/web/tests/voice-workflow-integration.test.mjs`
- [ ] T063 [P] [US6] Add documentation validation checklist for simulated-only development and zero-cost recording in `specs/001-voice-agent-e2e/checklists/voice-workflow.md`

### Implementation for User Story 6

- [ ] T064 [US6] Create n8n workflow contract/reference (trigger secret, payload, callback, bounded retries, no consent recomputation) in `specs/001-voice-agent-e2e/contracts/n8n-workflow.md`
- [ ] T065 [US6] Add optional local/stub workflow fixture for tests (no real provider calls) in `apps/web/tests/fixtures/voice-workflow-stub.mjs`
- [ ] T066 [US6] Align trigger dispatch payload and environment variable naming/documentation with workflow contract in `apps/web/src/app/api/voice/trigger/route.ts` and `apps/web/.env.example`
- [ ] T067 [US6] Document operator runbook for sandbox default, external webhook configuration, and fail-closed secrets in `specs/001-voice-agent-e2e/quickstart.md`

**Checkpoint**: US6 external workflow is optional, documented, and safe by default.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, docs, and full gate execution.

- [ ] T068 [P] Update feature/API/data-model documentation for final contracts and ADR-0001 status alias handling in `docs/PRD.md`, `docs/DATABASE.md`, and `docs/ARCHITECTURE.md`
- [ ] T069 [P] Add/refresh security review notes for secrets, RLS, webhook fail-closed, and transcript handling in `specs/001-voice-agent-e2e/checklists/security-review.md`
- [ ] T070 Run unit/static test suites (`npm test` in `apps/web`, `pytest`) and record results in `specs/001-voice-agent-e2e/quickstart.md`
- [ ] T071 Run Playwright live E2E gate against `https://web-olive-delta-41.vercel.app` and record pass/fail evidence in `specs/001-voice-agent-e2e/quickstart.md`
- [ ] T072 Update task completion/reporting status only after gates pass in `specs/001-voice-agent-e2e/tasks.md` and `docs/ROADMAP.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 - blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2; MVP and Task 1.1 gate.
- **Phase 4 (US2)**: Depends on Phase 2; can run parallel with US1 after foundation, but shares live E2E environment and dashboard files.
- **Phase 5 (US3)**: Depends on Phase 2; benefits from US1/US2 auth/lead stability but is independently testable via API.
- **Phase 6 (US4)**: Depends on Phase 2 and shares call_logs contract with US3; independently testable via webhook calls.
- **Phase 7 (US5)**: Depends on Phase 2 and call_logs data shape; independently testable.
- **Phase 8 (US6)**: Depends on US3/US4 contracts; sandbox path can be validated earlier.
- **Phase 9 (Polish)**: Depends on desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories after Foundational.
- **US2 (P1)**: No dependency on other stories after Foundational; coordinate with US1 on shared dashboard/auth files.
- **US3 (P1)**: No dependency on other stories after Foundational; integrates with lead/call_log schema.
- **US4 (P1)**: Depends on call_log/webhook contract established in Foundational/US3; independently verifiable.
- **US5 (P2)**: Depends on call_log schema and auth helpers; independently verifiable.
- **US6 (P2)**: Depends on US3 trigger dispatch and US4 webhook contract.

### Within Each User Story

- Tests should be written and fail before implementation/fixes.
- Schema/helpers before endpoints.
- Endpoints before UI surfacing.
- Story verification before marking story complete.
- Live E2E gate failures keep Task 1.1/1.2/1.3 open.

### Parallel Opportunities

- Setup docs/env tasks T003-T006 can run in parallel.
- Foundational helpers/migrations/tests T009-T015 can run in parallel after T007-T008 schema direction is set.
- US1 tests T016-T019 can run in parallel.
- US2 tests T025-T028 can run in parallel.
- US3 tests T035-T038 and guard/helper T039 can run in parallel.
- US4 tests T046-T049 and helper T050 can run in parallel.
- US5 tests T055-T057 can run in parallel.
- US6 tests/docs/fixture T061-T065 can run in parallel.

---

## Parallel Example: User Story 3

```bash
# Launch US3 tests together:
Task: "T035 [US3] Add unit tests in apps/web/tests/voice-guard.test.mjs"
Task: "T036 [US3] Add route contract tests in apps/web/tests/voice-trigger.test.mjs"
Task: "T037 [US3] Add dispatch integration test in apps/web/tests/voice-trigger-dispatch.test.mjs"

# Launch US3 implementation split by file after tests:
Task: "T039 [US3] Extend eligibility guard in apps/web/src/lib/voiceGuard.ts"
Task: "T045 [US3] Update dashboard voice trigger UI in apps/web/src/app/dashboard/DashboardClient.tsx"
```

## Parallel Example: User Story 4

```bash
# Launch US4 tests together:
Task: "T046 [US4] Add webhook contract tests in apps/web/tests/voice-webhook.test.mjs"
Task: "T047 [US4] Add idempotency tests in apps/web/tests/voice-webhook-idempotency.test.mjs"
Task: "T048 [US4] Add validation tests in apps/web/tests/voice-guard.test.mjs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: US1 live auth/tenant/RLS gate.
4. **STOP and VALIDATE**: US1 independently against live deployment.
5. Do not claim Task 1.1 complete until live gate passes.

### Incremental Delivery

1. Setup + Foundational → safe base.
2. US1 → live Task 1.1 gate.
3. US2 → live Task 1.2 gate.
4. US3 → consent-gated trigger.
5. US4 → trusted webhook processing.
6. US5 → tenant-scoped export.
7. US6 → optional n8n/Vapi/Retell contract and stubs.
8. Each story adds value without breaking tenant isolation or consent rules.

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together.
2. After Foundational:
   - Developer A: US1/US2 live E2E gates.
   - Developer B: US3 trigger + US6 dispatch contract.
   - Developer C: US4 webhook + US5 export.
3. Reconcile shared files (`voiceGuard.ts`, `auditLog.ts`, dashboard client) before final gate.

---

## Notes

- [P] tasks = different files, no dependencies.
- [USn] label maps task to a specific user story for traceability.
- Every user story must be independently testable.
- No real calls, no paid APIs, no real customer data.
- Do not mark Tasks 1.1/1.2/1.3 complete until required unit and live E2E gates pass.
- Keep secrets server-side; never expose service-role key or webhook secrets to browser code.
