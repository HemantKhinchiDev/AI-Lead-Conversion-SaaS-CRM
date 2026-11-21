# Feature Specification: Consent-Gated AI Voice Agent & Phase 1 E2E Verification

**Feature Branch**: `001-voice-agent-e2e` (spec directory only; no branch was created)

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Read docs/PRD.md. Create a complete specification for the pending E2E checks of Task 1.1 and Task 1.2, and for Task 1.3 (AI Voice Agent: consent rule, call_logs schema, /api/voice/trigger, /api/voice/webhook, and n8n integration)."

## 1. Purpose and Scope

This feature closes the remaining Phase 1 verification gap and specifies the consent-gated AI voice slice.

The PRD records that Task 1.1 (Supabase Auth, tenant schema, RLS and login page) and Task 1.2 (tenant-scoped leads CRUD) have offline checks but still need live end-to-end verification. The project constitution requires a Playwright E2E gate against the live deployment at `https://web-olive-delta-41.vercel.app` before either task can be considered complete.

This feature also specifies Task 1.3 from `docs/PRD.md`: a deterministic consent gate, a `public.call_logs` schema, three API endpoints, and an optional n8n/Vapi/Retell orchestration path. The development default remains a simulated sandbox provider. No real calls, messages, paid APIs or customer data are permitted.

### In Scope

- Live E2E verification of registration, login, session guard, tenant creation and tenant isolation for Task 1.1.
- Live E2E verification of tenant-scoped lead create, read, update and delete behavior for Task 1.2.
- Deterministic consent and eligibility checks before any outbound AI voice attempt.
- `public.call_logs` schema, constraints, indexes, RLS and tenant consistency.
- `POST /api/voice/trigger` contract and behavior.
- `POST /api/voice/webhook` contract and behavior.
- `GET /api/tenant/call_logs/export` contract and behavior.
- n8n/Vapi/Retell outbound dispatch and callback integration contract.
- Simulated sandbox voice path used when no external webhook is configured.
- Security, idempotency, failure handling, audit and cost requirements for the above.

### Out of Scope

- Real outbound telephony, real phone numbers or live voice providers in development.
- Production Vapi, Retell or n8n credentials and paid plans.
- AI conversation quality, Hindi/English/Gujarati conversation evaluation, speech-to-text or text-to-speech selection.
- Campaign creation, approval, queue workers, retries and calling-hour enforcement.
- WhatsApp, website enquiry, billing and analytics beyond call-log export.
- Real customer data, recording retention policy and legal approval for live calling.
- Replacing the existing Task 1.1 and Task 1.2 implementations unless the E2E gate exposes a defect.

## 2. User Scenarios & Testing

### User Story 1 - Live authentication, tenant creation and RLS verification (Priority: P1)

A business owner registers a workspace, signs in, reaches only their own dashboard, and cannot read or modify another business's data even when the browser attempts it directly.

**Why this priority**: Task 1.1 is the legal and security boundary of the product. Offline static checks do not prove that the deployed Supabase project enforces RLS, that the signup trigger creates exactly one tenant, or that the live login page works with the production anon key.

**Independent Test**: Run the Playwright suite against the live deployment with two synthetic tenants. Register/sign in both, then attempt cross-tenant reads and writes through the browser session and the Supabase client. The story passes only when every isolation attempt fails safely and no row is changed.

**Acceptance Scenarios**:

1. **Given** a new business email, **When** the owner completes registration with a business name and full name, **Then** exactly one tenant and one `business_owner` membership are created and the owner reaches `/dashboard`.
2. **Given** a registered owner, **When** they sign in with valid credentials, **Then** the session is established and `/dashboard` loads the owner's workspace.
3. **Given** a registered owner, **When** they sign in with an invalid password, **Then** authentication is rejected with a generic error and no secret or stack trace is exposed.
4. **Given** no session, **When** the visitor opens `/dashboard`, **Then** the browser is redirected to `/login` and no tenant data is rendered.
5. **Given** two tenants A and B, **When** tenant A's session queries tenant B's leads, users, tenants or call logs, **Then** the query returns no rows or an authorization error and no data is disclosed.
6. **Given** two tenants A and B, **When** tenant A attempts to update or delete tenant B's lead or call log, **Then** the write affects zero rows or is rejected and tenant B's data is unchanged.
7. **Given** an authenticated owner, **When** they sign out, **Then** the browser session is cleared and `/dashboard` is no longer accessible.
8. **Given** the live deployment, **When** the browser bundle is inspected, **Then** it contains no Supabase service-role key, database URL or other backend secret.

---

### User Story 2 - Tenant-scoped leads CRUD verification (Priority: P1)

A sales user can add, view, update and delete leads in their own workspace, while consent remains explicit and cross-tenant access is impossible.

**Why this priority**: Task 1.2 is the first business-data workflow. A broken lead boundary would invalidate every later campaign and voice feature, and the PRD still lists live database security tests as pending.

**Independent Test**: Using two synthetic tenants, exercise the dashboard lead form, status changes and deletion. Confirm that each action is visible only to the owning tenant and that a lead cannot be created or modified for another tenant by supplying a different identifier.

**Acceptance Scenarios**:

1. **Given** an authenticated owner, **When** they create a lead with an explicit consent confirmation, **Then** the lead is stored with the owner's tenant, appears in that workspace, and starts in the `new` stage.
2. **Given** an authenticated owner, **When** they submit a lead without explicit consent, **Then** the create is blocked and no lead is stored.
3. **Given** an existing lead in the owner's tenant, **When** the owner changes its status to a valid pipeline stage, **Then** the change persists and is visible after reload.
4. **Given** an existing lead in the owner's tenant, **When** the owner deletes it, **Then** it disappears from the workspace and cannot be read again.
5. **Given** tenant A's session and a lead that belongs to tenant B, **When** tenant A attempts to read, update or delete that lead, **Then** the attempt returns no row or is rejected and tenant B's lead is unchanged.
6. **Given** a lead created by tenant A, **When** tenant B lists leads, **Then** tenant A's lead is absent from the response.
7. **Given** the live deployment, **When** the dashboard loads with no leads or with a failed query, **Then** a clear empty or error state is shown instead of a blank page.

---

### User Story 3 - Consent-gated voice trigger (Priority: P1)

A workspace user triggers an AI voice follow-up for an eligible lead. The system blocks the request unless the lead has explicit consent and belongs to the same tenant, records a queued call log, and dispatches either to the configured external workflow or to the simulated sandbox.

**Why this priority**: This is the core safety control for Task 1.3. A voice attempt made without valid consent is a P0 incident, so the gate must be deterministic, tenant-scoped and independently testable before any conversation logic is added.

**Independent Test**: Call the trigger endpoint with missing sessions, missing tenant membership, foreign leads, unconsented leads, excluded leads and eligible leads. Verify status codes, response bodies, `call_logs` rows and provider-dispatch behavior for each case without making a real call.

**Acceptance Scenarios**:

1. **Given** no bearer token, **When** `POST /api/voice/trigger` is called, **Then** it returns `401` and creates no call log.
2. **Given** an authenticated user with no tenant membership, **When** they trigger a call, **Then** it returns `403` and creates no call log.
3. **Given** a missing, blank or malformed `lead_id`, **When** the trigger is called, **Then** it returns `400` and creates no call log.
4. **Given** a lead that belongs to another tenant, **When** the trigger is called, **Then** it returns `404`, does not reveal whether the lead exists, and creates no call log.
5. **Given** a lead with `consent_given` false, null or missing, **When** the trigger is called, **Then** it returns `403`, creates no call log and dispatches nothing.
6. **Given** a lead in `do_not_contact`, `excluded` or `review_required`, **When** the trigger is called, **Then** it returns `403`, creates no call log and dispatches nothing.
7. **Given** an eligible lead in the caller's tenant, **When** the trigger is called, **Then** exactly one `queued` call log is created with the correct tenant, user, lead, provider, mode and zero estimated cost, and the response contains `call_id` and `status`.
8. **Given** a configured `VOICE_AGENT_WEBHOOK_URL`, **When** an eligible call is triggered, **Then** one authenticated dispatch is sent to that workflow with the call and lead context, and no real call is made by the application itself.
9. **Given** no `VOICE_AGENT_WEBHOOK_URL`, **When** an eligible call is triggered, **Then** the simulated sandbox path runs deterministically, makes no network call, stores a completed simulation with a transcript and summary, and updates the lead to `contacted`.
10. **Given** an existing active `queued` or `in_progress` call for the same lead, **When** another trigger is requested, **Then** the duplicate is rejected with `409` and no second dispatch occurs.
11. **Given** consent is withdrawn after the call is queued but before provider dispatch, **When** dispatch is attempted, **Then** the call is not placed, the call log is marked `failed`, `next_action` records the consent block, and an audit event is written.

---

### User Story 4 - Trusted webhook result processing (Priority: P1)

An external voice workflow reports the result of a call. The system accepts only authenticated callbacks, updates the correct tenant's call log, and optionally advances the lead through an allowed status.

**Why this priority**: The webhook is the only path by which an external provider can change business data. Without strict authentication, tenant derivation and enum validation, a forged or malformed callback could corrupt another tenant's records or move a lead into an invalid state.

**Independent Test**: Send valid, invalid-secret, missing-secret, unknown-call, malformed, duplicate and out-of-order callbacks. Verify status codes, call-log fields, lead status and audit entries for each case.

**Acceptance Scenarios**:

1. **Given** a valid `x-webhook-secret` and a known `call_id`, **When** a completed result is posted, **Then** the call log is updated with status, duration, transcript, summary and next action, and the response is `200`.
2. **Given** a missing or invalid `x-webhook-secret`, **When** a callback is posted, **Then** it returns `401` and changes nothing.
3. **Given** no `VOICE_WEBHOOK_SECRET` is configured, **When** a callback is posted, **Then** the endpoint fails closed with `503` and changes nothing.
4. **Given** an unknown `call_id`, **When** a callback is posted, **Then** it returns `404` and creates no row.
5. **Given** a malformed JSON body, a missing `call_id` or an invalid `call_status`, **When** a callback is posted, **Then** it returns `400` and no partial update occurs.
6. **Given** a valid callback that includes a supported `lead_status`, **When** it is processed, **Then** the lead is updated only within the call log's tenant and only to a canonical ADR-0001 status.
7. **Given** a callback that uses the legacy alias `site_visit`, **When** it is processed, **Then** it is normalized to `site_visit_requested` and recorded consistently.
8. **Given** a callback with an unsupported `lead_status`, **When** it is processed, **Then** it returns `400` and neither the call log nor the lead is partially updated.
9. **Given** the same callback is delivered twice, **When** the second delivery arrives, **Then** the response is `200` and no duplicate call log, duplicate lead transition or duplicate audit event is produced.
10. **Given** a late `queued` callback arrives after a terminal `completed` result, **When** it is processed, **Then** the terminal status is not regressed.
11. **Given** a callback body contains a `tenant_id`, **When** it is processed, **Then** that value is ignored or rejected and the tenant is derived only from the stored call log.

---

### User Story 5 - Tenant-scoped call log export (Priority: P2)

A workspace user downloads the call history for their own business as a CSV file, without exposing another tenant's records.

**Why this priority**: Export is required for auditability and the PRD audit/export requirements, but it is secondary to the consent gate and webhook correctness.

**Independent Test**: Call the export endpoint with no session, a session without membership, two tenants with different call logs, and a tenant with no logs. Inspect the status, headers, filename, row order and CSV safety.

**Acceptance Scenarios**:

1. **Given** no bearer token, **When** the export is requested, **Then** it returns `401` and no CSV.
2. **Given** a session without tenant membership, **When** the export is requested, **Then** it returns `403` and no CSV.
3. **Given** an authenticated tenant with call logs, **When** the export is requested, **Then** it returns `200`, `Content-Type: text/csv`, `Content-Disposition: attachment; filename="call_logs_<tenant_id>.csv"`, `Cache-Control: no-store`, and rows ordered newest first.
4. **Given** two tenants with call logs, **When** tenant A exports, **Then** the CSV contains zero rows from tenant B.
5. **Given** a transcript that begins with `=`, `+`, `-` or `@`, **When** the CSV is generated, **Then** the cell is neutralized so spreadsheet software cannot execute it as a formula.
6. **Given** the export query fails, **When** the request is processed, **Then** it returns `500` and does not stream a partial file.
7. **Given** a successful export, **When** the action is audited, **Then** an audit event records the actor, tenant, timestamp and export action without secrets or unnecessary PII.

---

### User Story 6 - n8n / Vapi / Retell orchestration (Priority: P2)

An operator can point `VOICE_AGENT_WEBHOOK_URL` at an n8n workflow (or a compatible Vapi/Retell endpoint) that performs the voice interaction and posts the result back to the application.

**Why this priority**: The external workflow is the replaceable provider layer. It must be optional, authenticated and incapable of overriding consent or business facts.

**Independent Test**: Run the trigger with a local n8n test webhook and a simulated provider, then post the callback. Verify the outbound payload, secret handling, retry behavior, idempotency and that no real call is placed.

**Acceptance Scenarios**:

1. **Given** no external workflow is configured, **When** the application starts and a call is triggered, **Then** the sandbox path is used and the application does not fail to boot.
2. **Given** a configured workflow URL and trigger secret, **When** an eligible call is triggered, **Then** the workflow receives the documented payload with the call ID, tenant ID, lead context, consent evidence and callback URL.
3. **Given** a workflow request without the configured trigger secret, **When** n8n receives it, **Then** n8n rejects it and does not start a voice session.
4. **Given** a valid workflow request, **When** n8n processes it, **Then** n8n uses only the eligibility decision and approved knowledge supplied by the backend and never recalculates consent.
5. **Given** a customer asks for a price, availability or appointment that is not approved, **When** n8n builds the response, **Then** it does not invent the fact and routes the conversation to human follow-up.
6. **Given** a completed, failed or no-answer interaction, **When** n8n posts the result, **Then** it includes `x-webhook-secret`, a valid `call_id`, a supported status and the result fields.
7. **Given** the callback fails with a timeout or `5xx`, **When** n8n retries, **Then** retries are bounded and exponential, and duplicate delivery remains safe because the callback is idempotent.
8. **Given** development or test mode, **When** the workflow runs, **Then** it uses a simulated provider, places zero real calls and records `mode=simulated` with `estimated_cost_inr=0.00`.

### Edge Cases

- Consent is true at trigger time but false before dispatch; the call must be blocked and the call log must record the block.
- Consent is withdrawn while an external call is already in progress; the result may be recorded, but no further automated attempt may be scheduled.
- A lead is deleted after the call log is created; the cascade must not leave an orphaned call log, and the export must remain tenant-scoped.
- A call log references a lead in a different tenant; the write must be rejected and treated as a security defect.
- A webhook arrives twice, out of order, or with conflicting statuses; the system must remain idempotent and must not regress terminal states.
- A webhook body supplies a `tenant_id` or `lead_id` that differs from the stored call log; the stored relationship wins or the request is rejected.
- A provider times out, returns `5xx`, or never calls back; the call must be marked failed or left queued with an explicit recovery path, and the user must see an actionable error.
- A user triggers a call for a lead that is already `do_not_contact`, `excluded` or `review_required`; no call log or provider dispatch may be created.
- A user supplies a malformed UUID, an oversized transcript or a negative duration; the request must be rejected without partial writes.
- The service-role key or webhook secret is missing; the system must fail closed rather than silently skipping authentication.
- A CSV cell contains quotes, newlines, commas, Unicode or a formula prefix; the export must remain valid and safe.
- A user belongs to no tenant or to multiple tenants; the system must resolve exactly one membership or return `403`.
- The live deployment is unavailable or Supabase is misconfigured; the E2E gate must fail and the task must remain open.

## 3. Requirements

### 3.1 Phase 1 live E2E verification (Task 1.1 and Task 1.2)

- **FR-001**: The project MUST maintain a Playwright E2E suite that runs against `https://web-olive-delta-41.vercel.app` and is the completion gate for Tasks 1.1 and 1.2.
- **FR-002**: The E2E suite MUST use at least two synthetic tenants created for the test run, and MUST NOT use real customer data.
- **FR-003**: Registration MUST create exactly one tenant and exactly one owner membership for the new Auth user, using trusted server-side metadata handling and never a client-supplied `tenant_id` or `role`.
- **FR-004**: Valid credentials MUST sign in and reach `/dashboard`; invalid credentials MUST be rejected without exposing whether the email exists, the password, tokens or stack traces.
- **FR-005**: An unauthenticated visit to `/dashboard` MUST redirect to `/login` and MUST NOT render tenant data.
- **FR-006**: Tenant A MUST NOT be able to read tenant B's tenants, users, leads or call logs; attempts MUST return zero rows or an authorization error.
- **FR-007**: Tenant A MUST NOT be able to create, update or delete tenant B's records; attempts MUST affect zero rows or be rejected, and tenant B's data MUST remain unchanged.
- **FR-008**: The live E2E suite MUST cover lead creation with consent, rejection without consent, status update, deletion and cross-tenant denial for Task 1.2.
- **FR-009**: The live E2E suite MUST assert that the browser bundle contains no service-role key, database connection string or webhook secret.
- **FR-010**: A failing or skipped live E2E gate MUST leave Tasks 1.1 and 1.2 open and MUST be reported as a failure, not as a partial success.

### 3.2 Consent-gated voice trigger

- **FR-020**: `POST /api/voice/trigger` MUST require a valid Supabase Auth bearer session and MUST return `401` without one.
- **FR-021**: The endpoint MUST resolve the caller's tenant from the authenticated user's `public.users` membership; it MUST NOT read `tenant_id` from the request body, query string or headers.
- **FR-022**: The endpoint MUST return `403` when the authenticated user has no valid tenant membership.
- **FR-023**: The endpoint MUST require a non-empty, well-formed `lead_id` and MUST return `400` otherwise.
- **FR-024**: The endpoint MUST look up the lead within the caller's tenant and MUST return `404` for a missing or foreign lead without revealing which condition occurred.
- **FR-025**: The endpoint MUST block the request with `403` unless `lead.consent_given` is exactly `true`.
- **FR-026**: The endpoint MUST block the request with `403` when the lead is `do_not_contact`, `excluded` or `review_required`.
- **FR-027**: An eligible request MUST create exactly one `call_logs` row with `tenant_id`, `user_id`, `lead_id`, `provider`, `call_status=queued`, `mode=simulated` unless an approved live mode is configured, and `estimated_cost_inr=0.00`.
- **FR-028**: The endpoint MUST re-check tenant ownership, consent and suppression immediately before dispatch; if eligibility has changed, it MUST NOT dispatch and MUST record the block.
- **FR-029**: The endpoint MUST reject a second trigger for the same lead while a `queued` or `in_progress` call already exists, returning `409` and creating no second dispatch.
- **FR-030**: When `VOICE_AGENT_WEBHOOK_URL` is configured, the endpoint MUST dispatch one authenticated request to that workflow within the configured timeout and MUST not place the call itself.
- **FR-031**: When `VOICE_AGENT_WEBHOOK_URL` is not configured, the endpoint MUST use the deterministic simulated sandbox, make no network call, store a completed simulation with a transcript and summary, and update the lead to `contacted`.
- **FR-032**: The success response MUST contain `call_id` and `status`; in sandbox mode it MAY also return `mode` and `ai_summary`, and `status` MUST reflect the persisted call state at response time.
- **FR-033**: If external dispatch fails, the endpoint MUST persist the failure on the call log and return an error response that includes the `call_id` so the user can investigate.

### 3.3 Trusted webhook processing

- **FR-040**: `POST /api/voice/webhook` MUST require a valid `x-webhook-secret` header and MUST return `401` for a missing or incorrect secret.
- **FR-041**: The endpoint MUST fail closed with `503` when `VOICE_WEBHOOK_SECRET` is not configured; it MUST NOT accept unauthenticated callbacks.
- **FR-042**: Secret comparison MUST use a constant-time comparison and MUST NOT log the supplied or expected secret.
- **FR-043**: The endpoint MUST reject malformed JSON, a missing `call_id` or an invalid `call_id` with `400`.
- **FR-044**: The endpoint MUST resolve the call log by `call_id` using trusted server-side access, MUST return `404` for an unknown call, and MUST derive `tenant_id` and `lead_id` only from the stored row.
- **FR-045**: The endpoint MUST ignore or reject any `tenant_id` or `lead_id` supplied in the callback body.
- **FR-046**: `call_status` MUST be one of `queued`, `in_progress`, `completed`, `no_answer` or `failed`; any other value MUST return `400` and MUST NOT default to `completed`.
- **FR-047**: `duration_seconds` MUST be a non-negative integer within a documented maximum; invalid values MUST return `400`.
- **FR-048**: `transcript`, `ai_summary` and `next_action` MUST be treated as untrusted text, MUST be length-limited, and MUST be stored without executing or interpreting their contents.
- **FR-049**: A valid callback MUST update the call log atomically with the supplied result fields.
- **FR-050**: If a `lead_status` is supplied, it MUST be a canonical ADR-0001 status or the documented `site_visit` alias; the alias MUST normalize to `site_visit_requested`, and any other value MUST return `400` without a partial update.
- **FR-051**: A lead update MUST be scoped to the call log's `tenant_id` and `lead_id`; a mismatch MUST be rejected and treated as a security defect.
- **FR-052**: Duplicate callbacks for the same `call_id` and terminal state MUST be idempotent and MUST NOT create duplicate rows, duplicate transitions or duplicate audit events.
- **FR-053**: A late non-terminal callback MUST NOT regress a terminal `completed`, `no_answer` or `failed` state.
- **FR-054**: A successful callback MUST return `200` with a stable success body and the updated call representation; failures MUST use a clear `4xx` or `5xx` status.
- **FR-055**: Lead-status changes caused by a callback MUST produce an audit event with actor context, tenant, timestamp, old status, new status and call reference, without secrets or full transcript data.

### 3.4 Tenant-scoped call log export

- **FR-060**: `GET /api/tenant/call_logs/export` MUST require a valid Supabase Auth bearer session and MUST return `401` without one.
- **FR-061**: The endpoint MUST resolve `tenant_id` from the authenticated user's `public.users` membership and MUST return `403` when no membership exists.
- **FR-062**: The endpoint MUST NOT read `tenant_id` from query parameters, request body or arbitrary headers.
- **FR-063**: The export MUST contain only rows whose `tenant_id` matches the resolved tenant and MUST order rows newest first.
- **FR-064**: The response MUST be `text/csv; charset=utf-8`, MUST use `Content-Disposition: attachment; filename="call_logs_<tenant_id>.csv"`, and MUST set `Cache-Control: no-store`.
- **FR-065**: The CSV MUST include stable columns for call identity, lead identity, provider, status, duration, transcript, summary, next action, cost, mode and creation time.
- **FR-066**: CSV cells MUST be escaped and MUST neutralize values beginning with `=`, `+`, `-`, `@`, tab or carriage return to prevent formula injection.
- **FR-067**: A failed query MUST return `500` and MUST NOT stream a partial file.
- **FR-068**: A successful export MUST create an audit event for the export action.

### 3.5 n8n / Vapi / Retell integration

- **FR-070**: The external voice workflow MUST be optional; the application MUST boot and serve the sandbox path when `VOICE_AGENT_WEBHOOK_URL` is absent.
- **FR-071**: The outbound dispatch contract MUST include `call_id`, `tenant_id`, lead identity and contact fields, lead consent evidence, the backend eligibility decision and a callback URL.
- **FR-072**: The outbound dispatch MUST NOT include the Supabase service-role key, the inbound webhook secret, database credentials or unrelated tenant data.
- **FR-073**: The workflow MUST authenticate the outbound request with a configured trigger secret and MUST reject requests without it.
- **FR-074**: The workflow MUST NOT determine consent, suppression, tenant ownership or legal eligibility; it MUST use only the backend's decision.
- **FR-075**: The workflow MUST NOT invent prices, availability, discounts or confirmed appointments; unknown facts MUST route to human follow-up.
- **FR-076**: The workflow MUST post results to `/api/voice/webhook` with `x-webhook-secret`, a valid `call_id`, a supported `call_status` and the result fields.
- **FR-077**: Workflow retries MUST be bounded and exponential, and MUST rely on callback idempotency rather than creating new call records.
- **FR-078**: Development and test runs MUST use the simulated provider, MUST place zero real calls or messages, and MUST record `mode=simulated` with `estimated_cost_inr=0.00`.

### 3.6 Data model and integrity

- **FR-080**: `public.call_logs` MUST contain `id`, `tenant_id`, `user_id`, `lead_id`, `provider`, `call_status`, `duration_seconds`, `transcript`, `ai_summary`, `next_action`, `estimated_cost_inr`, `mode` and `created_at`.
- **FR-081**: `id` MUST be a UUID primary key with a server-side default; `tenant_id` MUST reference `public.tenants(id)`; `user_id` MUST reference `auth.users(id)`; `lead_id` MUST reference `public.leads(id)`.
- **FR-082**: `provider` MUST be `text` with a default of `vapi_or_n8n` and MUST be constrained to `vapi_or_n8n` or `sandbox_voice_sim`; the sandbox path MUST explicitly write `sandbox_voice_sim`.
- **FR-083**: `call_status` MUST default to `queued` and MUST be constrained to `queued`, `in_progress`, `completed`, `no_answer` or `failed`.
- **FR-084**: `duration_seconds` MUST default to `0`, MUST be an integer and MUST be non-negative.
- **FR-085**: `estimated_cost_inr` MUST be `numeric(10,2)`, MUST default to `0.00`, MUST be non-negative, and any non-zero value MUST carry an approval reference under T-COST-001.
- **FR-086**: `mode` MUST default to `simulated` and MUST be constrained to `simulated` or `live`; `live` MUST require explicit approval.
- **FR-087**: `created_at` MUST default to the database clock and MUST NOT be client-supplied.
- **FR-088**: `public.call_logs` MUST have indexes on `(tenant_id, created_at DESC)`, `lead_id` and `user_id`.
- **FR-089**: `public.call_logs` MUST enable RLS. Authenticated reads MUST be tenant-scoped; inserts and updates MUST be tenant-scoped and limited to the owning user unless a trusted server-side role performs the operation.
- **FR-090**: The database or a trusted server check MUST prevent a call log from referencing a lead in a different tenant.
- **FR-091**: `public.leads` MUST expose `tenant_id`, `consent_given` and a canonical `status`; consent MUST default to false and MUST never be granted by a client-supplied field alone.
- **FR-092**: Schema changes MUST ship as versioned migrations and MUST include RLS policies and indexes.
- **FR-093**: Audit events for consent changes, lead-status changes, call dispatch, callback processing and export MUST be append-only and tenant-scoped.

### 3.7 Security, privacy and observability

- **FR-100**: All voice endpoints MUST enforce tenant isolation on the server; client-supplied identifiers MUST NOT be trusted as authorization.
- **FR-101**: The service-role key MUST remain server-side only and MUST NOT appear in browser code, public environment variables or logs.
- **FR-102**: Webhook and trigger secrets MUST come from environment variables and MUST NOT be committed or returned in responses.
- **FR-103**: Errors MUST be actionable for the operator but MUST NOT disclose secrets, tokens, full transcripts or another tenant's data.
- **FR-104**: Call dispatch, callback acceptance, callback rejection, blocked consent, duplicate trigger and export events MUST be observable through structured logs or audit records.
- **FR-105**: Transcripts and summaries MUST be treated as restricted data and MUST NOT be written to application logs by default.
- **FR-106**: The system MUST remain functional with the sandbox provider when no external AI, voice or telephony service is configured.

### 3.8 Non-functional requirements

- **NFR-001**: Security: HTTPS in deployed environments, validated inputs, authenticated webhooks and no secret exposure.
- **NFR-002**: Privacy: synthetic data in development, data minimization, no real customer contact without approval.
- **NFR-003**: Reliability: idempotent callbacks, bounded retries, deterministic sandbox output and no partial writes.
- **NFR-004**: Performance: a simulated trigger SHOULD return within 2 seconds at p95; an external dispatch MUST respect the configured timeout and MUST NOT hang indefinitely.
- **NFR-005**: Cost: every call log MUST record mode and cost; simulated and free-tier paths MUST record `0.00` INR.
- **NFR-006**: Maintainability: the provider layer MUST remain replaceable through the documented webhook contract.
- **NFR-007**: Compliance: no live calling, recording retention or WhatsApp behavior is enabled by this feature.
- **NFR-008**: Testability: every requirement above MUST be verifiable without a real voice provider.

## 4. Interface Contracts

These contracts are binding because `docs/PRD.md` Task 1.3 names the endpoints and schema. Framework choice remains an implementation detail.

### 4.1 `POST /api/voice/trigger`

| Item | Contract |
|---|---|
| Authentication | Supabase Auth bearer token in `Authorization: Bearer <token>` |
| Request body | `{ "lead_id": "<uuid>" }` |
| Success | `200` with `{ "call_id": "<uuid>", "status": "queued" }`; sandbox may return `status: "completed"`, `mode: "sandbox"` and `ai_summary` |
| Missing session | `401` |
| No tenant membership | `403` |
| Missing or malformed `lead_id` | `400` |
| Foreign or unknown lead | `404` |
| Consent or eligibility blocked | `403` |
| Duplicate active call | `409` |
| Dispatch failure | `5xx` with `call_id` when a row was created |
| Tenant source | Resolved from the authenticated user's `public.users` membership only |

### 4.2 `POST /api/voice/webhook`

| Item | Contract |
|---|---|
| Authentication | `x-webhook-secret: <secret>` |
| Request body | `{ "call_id": "<uuid>", "call_status": "completed", "duration_seconds": 45, "transcript": "...", "ai_summary": "...", "next_action": "site_visit", "lead_status": "site_visit_requested" }` |
| Success | `200` with `{ "ok": true, "call": { ... } }` |
| Missing or invalid secret | `401` |
| Secret not configured | `503` |
| Malformed body, missing `call_id`, invalid status, invalid duration or invalid lead status | `400` |
| Unknown call | `404` |
| Tenant source | Derived from the stored `call_logs` row only |
| Idempotency | Repeated terminal callbacks return `200` without duplicate effects |
| State rule | Terminal states are not regressed by late callbacks |

### 4.3 `GET /api/tenant/call_logs/export`

| Item | Contract |
|---|---|
| Authentication | Supabase Auth bearer token |
| Response | `200`, `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="call_logs_<tenant_id>.csv"`, `Cache-Control: no-store` |
| Missing session | `401` |
| No tenant membership | `403` |
| Query failure | `500` |
| Tenant source | Authenticated user's `public.users` membership only |
| Ordering | `created_at DESC` |
| CSV safety | Formula prefixes neutralized; quotes, commas and newlines escaped |

### 4.4 Outbound workflow contract (`VOICE_AGENT_WEBHOOK_URL`)

| Item | Contract |
|---|---|
| Method | `POST` |
| Authentication | Configured trigger secret header; secret value is environment-managed |
| Payload | `call_id`, `tenant_id`, `lead` identity and contact context, `consent` evidence, backend `eligibility` decision, `callback_url` |
| Must not include | Service-role key, inbound webhook secret, database credentials, unrelated tenant data |
| Timeout | Bounded by `VOICE_AGENT_TIMEOUT_SECONDS` |
| Failure behavior | Mark the call failed and surface an actionable error |
| Provider modes | Simulated by default; live only after explicit approval |
| Callback | `POST /api/voice/webhook` with `x-webhook-secret` |

## 5. Data Model

### 5.1 `public.call_logs`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key, server default |
| `tenant_id` | `uuid` | Required, references `public.tenants(id)` on delete cascade |
| `user_id` | `uuid` | Required, references `auth.users(id)` on delete cascade |
| `lead_id` | `uuid` | Required, references `public.leads(id)` on delete cascade |
| `provider` | `text` | Required, default `vapi_or_n8n`, allowed `vapi_or_n8n` or `sandbox_voice_sim` |
| `call_status` | `text` | Required, default `queued`, allowed `queued`, `in_progress`, `completed`, `no_answer`, `failed` |
| `duration_seconds` | `integer` | Required, default `0`, non-negative |
| `transcript` | `text` | Optional, length-limited, restricted data |
| `ai_summary` | `text` | Optional, length-limited, restricted data |
| `next_action` | `text` | Optional, length-limited |
| `estimated_cost_inr` | `numeric(10,2)` | Required, default `0.00`, non-negative; non-zero requires approval reference |
| `mode` | `text` | Required, default `simulated`, allowed `simulated` or `live` |
| `created_at` | `timestamptz` | Required, server default |

**Relationships**:

- One tenant has many call logs.
- One lead has many call logs.
- One user may create many call logs.
- A call log's tenant MUST match the tenant of its lead.

**RLS summary**:

- `SELECT`: authenticated users may read call logs for their own tenant.
- `INSERT`: authenticated users may insert only for their own tenant and own `user_id`.
- `UPDATE`: authenticated users may update only their own tenant and own `user_id`.
- `DELETE`: no authenticated policy; deletion occurs through cascade or trusted server-side operations.
- Service-role access is server-side only and MUST still scope queries by the resolved call or tenant.

### 5.2 Related lead fields

| Field | Rule |
|---|---|
| `tenant_id` | Required tenant boundary |
| `consent_given` | Required boolean, default false; only explicit evidence sets true |
| `status` | Canonical ADR-0001 status |
| `phone` | Normalized before deduplication |
| `user_id` / owner | Used for attribution, not as a substitute for tenant isolation |

## 6. Configuration

| Variable | Purpose | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public browser config |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Public browser config |
| `SUPABASE_URL` | Server-side Supabase URL | Server only |
| `SUPABASE_ANON_KEY` | Server-side anon key | Server only |
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server operations such as webhook updates | Server only; never browser or logs |
| `VOICE_AGENT_WEBHOOK_URL` | n8n/Vapi/Retell workflow endpoint | Server only |
| `VOICE_WEBHOOK_SECRET` | Shared secret for inbound callbacks | Server only; fail closed when absent |
| `VOICE_AGENT_TRIGGER_SECRET` | Secret sent to the external workflow | Server only |
| `VOICE_AGENT_TIMEOUT_SECONDS` | Outbound dispatch timeout | Server only; documented default |
| `VOICE_AGENT_MODE` | `simulated` or approved `live` | Server only; default `simulated` |

## 7. Test Matrix

| Test ID | Type | Scenario | Expected Result | PRD Mapping |
|---|---|---|---|---|
| E2E-AUTH-001 | Live E2E | Register a new business workspace | One tenant and one owner membership; dashboard reached | Task 1.1, FR-002/FR-003 |
| E2E-AUTH-002 | Live E2E | Sign in with valid and invalid credentials | Valid succeeds; invalid rejected safely | Task 1.1, FR-002 |
| E2E-AUTH-003 | Live E2E | Open `/dashboard` without a session | Redirect to `/login` | Task 1.1 |
| E2E-AUTH-004 | Live E2E | Sign out | Session cleared; dashboard inaccessible | Task 1.1 |
| E2E-ISO-001 | Live E2E | Tenant A reads tenant B leads/users/tenants/call logs | Zero rows or authorization error | T-ISO-001, FR-005 |
| E2E-ISO-002 | Live E2E | Tenant A updates or deletes tenant B data | Zero affected rows or rejection; no change | T-ISO-002, FR-005 |
| E2E-ISO-003 | Live E2E | Inspect browser bundle for secrets | No service-role key or backend secret | NFR-001 |
| E2E-LEAD-001 | Live E2E | Create lead with consent | Lead stored in own tenant and visible | Task 1.2 |
| E2E-LEAD-002 | Live E2E | Create lead without consent | Blocked; no row stored | Task 1.2, FR-016 |
| E2E-LEAD-003 | Live E2E | Update lead status | Valid stage persists after reload | Task 1.2 |
| E2E-LEAD-004 | Live E2E | Delete own lead | Removed and no longer readable | Task 1.2 |
| E2E-LEAD-005 | Live E2E | Cross-tenant lead update/delete | Denied; target unchanged | Task 1.2, T-ISO-002 |
| VOICE-TRIG-001 | API | Trigger without session | `401`, no call log | FR-020 |
| VOICE-TRIG-002 | API | Trigger without tenant membership | `403`, no call log | FR-022 |
| VOICE-TRIG-003 | API | Trigger with missing or malformed `lead_id` | `400`, no call log | FR-023 |
| VOICE-TRIG-004 | API | Trigger a foreign lead | `404`, no call log, no existence leak | FR-024 |
| VOICE-TRIG-005 | API | Trigger a lead without consent | `403`, no call log, no dispatch | FR-025 |
| VOICE-TRIG-006 | API | Trigger an excluded or review-required lead | `403`, no call log, no dispatch | FR-026 |
| VOICE-TRIG-007 | API | Trigger an eligible lead in sandbox mode | One completed simulation, deterministic summary, lead contacted | FR-027/FR-031 |
| VOICE-TRIG-008 | API | Trigger an eligible lead with a test webhook | One queued row and one authenticated dispatch | FR-030 |
| VOICE-TRIG-009 | API | Trigger twice while active | `409`, no second dispatch | FR-029 |
| VOICE-TRIG-010 | API | Withdraw consent between queue and dispatch | No call placed; blocked outcome recorded | FR-028, T-CONS-002 |
| VOICE-WH-001 | API | Valid callback | Call log updated; response `200` | FR-040/FR-049 |
| VOICE-WH-002 | API | Missing or invalid secret | `401`, no change | FR-040 |
| VOICE-WH-003 | API | Secret not configured | `503`, no change | FR-041 |
| VOICE-WH-004 | API | Unknown `call_id` | `404`, no row created | FR-044 |
| VOICE-WH-005 | API | Malformed body, invalid status or invalid duration | `400`, no partial update | FR-043/FR-046/FR-047 |
| VOICE-WH-006 | API | Valid callback with supported lead status | Lead updated in the same tenant | FR-050/FR-051 |
| VOICE-WH-007 | API | Legacy `site_visit` alias | Normalized to `site_visit_requested` | FR-050 |
| VOICE-WH-008 | API | Unsupported lead status | `400`, no partial update | FR-050 |
| VOICE-WH-009 | API | Duplicate terminal callback | `200`, no duplicate effects | FR-052 |
| VOICE-WH-010 | API | Late queued callback after terminal | Terminal state preserved | FR-053 |
| VOICE-WH-011 | API | Callback supplies foreign `tenant_id` | Ignored or rejected; stored tenant wins | FR-045 |
| VOICE-EXP-001 | API | Export without session | `401`, no CSV | FR-060 |
| VOICE-EXP-002 | API | Export without membership | `403`, no CSV | FR-061 |
| VOICE-EXP-003 | API | Export tenant A with tenant B rows present | Only tenant A rows; newest first | FR-063 |
| VOICE-EXP-004 | API | Export headers and filename | Exact CSV contract | FR-064/FR-065 |
| VOICE-EXP-005 | API | Formula-prefixed transcript | Cell neutralized | FR-066 |
| VOICE-EXP-006 | API | Export query failure | `500`, no partial file | FR-067 |
| N8N-001 | Integration | No workflow configured | Sandbox path, no boot failure | FR-070 |
| N8N-002 | Integration | Valid workflow dispatch | Documented payload and secret header | FR-071/FR-073 |
| N8N-003 | Integration | Missing workflow secret | Workflow rejects; no session | FR-073 |
| N8N-004 | Integration | Unapproved price or availability request | No invented fact; human follow-up | FR-075 |
| N8N-005 | Integration | Callback retry and duplicate delivery | Bounded retries; idempotent callback | FR-077 |
| N8N-006 | Integration | Development mode | Zero live calls; `mode=simulated`; cost `0.00` | FR-078, T-SIM-001 |
| COST-001 | API/DB | Simulated call log | `estimated_cost_inr=0.00` | T-COST-001 |
| AUDIT-001 | API/DB | Callback changes lead status | Audit event records actor, tenant, old/new status and call | FR-055 |

## 8. Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of the live E2E scenarios in this specification pass against `https://web-olive-delta-41.vercel.app`.
- **SC-002**: 100% of cross-tenant read and write attempts in the E2E suite are denied, with zero rows changed in the target tenant.
- **SC-003**: 100% of trigger attempts without explicit consent, or with an excluded/review-required lead, are blocked and create zero call logs and zero provider dispatches.
- **SC-004**: 100% of webhook attempts with a missing, invalid or unconfigured secret are rejected without changing business data.
- **SC-005**: 100% of duplicate terminal callbacks produce zero duplicate call logs, duplicate lead transitions or duplicate audit events.
- **SC-006**: 100% of call-log exports contain zero rows from another tenant and preserve newest-first ordering.
- **SC-007**: A simulated trigger returns a result within 2 seconds at p95, and an external dispatch never exceeds the configured timeout.
- **SC-008**: Development and test runs place zero real calls, send zero messages and record `0.00` INR estimated cost.
- **SC-009**: Every blocked or failed voice action produces an actionable, non-secret-bearing error or audit record.
- **SC-010**: Tasks 1.1, 1.2 and 1.3 remain open until their unit and live E2E gates pass; no task is reported complete on offline checks alone.

## 9. Assumptions

- The Task 1.1 and Task 1.2 implementations already exist in the repository; this feature verifies them live and fixes defects exposed by the gate rather than rebuilding them from scratch.
- Task 1.3 routes and a partial `call_logs` migration already exist; this specification defines the required end state and treats deviations as defects.
- ADR-0001 is authoritative for lead statuses. The legacy `site_visit` value in Task 1.3 is treated as an alias for `site_visit_requested`, not as a new canonical status.
- The PRD's `provider` default is `vapi_or_n8n`; the sandbox path explicitly writes `sandbox_voice_sim` so simulated records are distinguishable.
- The PRD's `call_status` enum is sufficient; cancellation or consent-withdrawal blocks are recorded as `failed` with a descriptive `next_action`.
- A single user belongs to exactly one tenant. Multi-tenant membership is out of scope.
- `public.current_tenant_id()` and the existing tenant membership model are available for RLS.
- The live deployment and Supabase Free project are reachable during the E2E gate; if not, the gate fails and the tasks remain open.
- n8n is an external, replaceable orchestrator. The application remains the source of truth for consent, eligibility, tenant ownership and lead status.
- No real telephony provider, recording storage or transcript retention policy is approved by this feature.
- Test data is synthetic and may be cleaned up after each E2E run.

## 10. Dependencies

- Supabase Auth, PostgreSQL, RLS and a Free-tier project.
- Existing `public.tenants`, `public.users` and `public.leads` tables and their migrations.
- Existing login page, dashboard and Supabase browser client.
- Playwright and a browser runtime for the live E2E gate.
- Existing Next.js route handlers for voice trigger, webhook and export.
- Optional n8n/Vapi/Retell endpoint and secrets, configured outside the repository.
- `docs/PRD.md` Task 1.3, ADR-0001, ADR-0002, `docs/DATABASE.md`, `WORKFLOW.md` and the project constitution.

## 11. Out of Scope

- Real calls, real WhatsApp messages, paid voice APIs and production telephony onboarding.
- AI model selection, prompt quality, language evaluation and conversation scoring.
- Campaign approval, queue workers, retry scheduling and calling-hour enforcement.
- Billing, subscriptions and cost recovery.
- Recording storage, retention automation and legal review.
- Reworking the dashboard design beyond what the E2E checks require.
- Changing the public API shape beyond the contracts in this specification.

## 12. Risks and Known Gaps

- **RLS mismatch**: The live database may differ from the offline migration checks. The E2E gate must inspect actual behavior, not only source files.
- **Status drift**: The codebase currently mixes `site_visit` with ADR-0001 statuses. The webhook must normalize or reject aliases explicitly.
- **Provider default drift**: The PRD default for `provider` differs from the current sandbox migration default. The spec resolves this by requiring explicit provider values per path.
- **Webhook fail-open risk**: Accepting callbacks when `VOICE_WEBHOOK_SECRET` is absent would be a security defect; this spec requires fail-closed behavior.
- **Service-role exposure**: The webhook requires trusted server access; any use of the service role in browser code is a release blocker.
- **n8n trust boundary**: n8n must never become the source of truth for consent or business facts. Its output is untrusted input until validated by the webhook.
- **Live E2E availability**: A deployment outage or Supabase quota issue will block task completion; this must be reported, not hidden.
- **Duplicate dispatch**: Without an active-call guard, repeated clicks can place multiple calls. The `409` rule is a safety default and must be verified.
- **Transcript privacy**: Transcripts are restricted data; logging them or exporting them to unauthorized users is a privacy defect.

## 13. Definition of Done

- [ ] All live E2E scenarios for Task 1.1 pass against the deployed URL.
- [ ] All live E2E scenarios for Task 1.2 pass against the deployed URL.
- [ ] The `call_logs` migration, constraints, indexes and RLS policies are applied and verified.
- [ ] The trigger endpoint enforces tenant, consent and eligibility rules with tests.
- [ ] The webhook endpoint enforces secret authentication, validation, idempotency and tenant-safe lead updates with tests.
- [ ] The export endpoint is tenant-scoped, safe and covered by tests.
- [ ] The sandbox path is deterministic, network-free and costed at `0.00`.
- [ ] The n8n contract is documented and exercised with a test workflow or a stub.
- [ ] No secret is present in the repository, browser bundle or logs.
- [ ] No real call, message or paid API was used.
- [ ] Documentation and task status are updated only after the gates pass.
