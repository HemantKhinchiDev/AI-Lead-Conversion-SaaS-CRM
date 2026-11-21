# Voice API Contracts

**Source**: `specs/001-voice-agent-e2e/spec.md` §4 (Interface Contracts) and §3 (Requirements)

**Defaults**: Simulated sandbox provider. `VOICE_AGENT_MODE=simulated`. No real calls, no paid APIs.

## 4.1 `POST /api/voice/trigger`

| Item | Contract |
|---|---|
| **Authentication** | Supabase Auth bearer token in `Authorization: Bearer <token>` |
| **Request body** | `{ "lead_id": "<uuid>" }` |
| **Success** | `200` with `{ "call_id": "<uuid>", "status": "queued" }`; sandbox may return `status: "completed"`, `mode: "sandbox"` and `ai_summary` |
| **Missing session** | `401` |
| **No tenant membership** | `403` |
| **Missing or malformed `lead_id`** | `400` |
| **Foreign or unknown lead** | `404`; must not reveal whether the lead exists or is foreign |
| **Consent or eligibility blocked** | `403`; created no call log and dispatches nothing |
| **Duplicate active call** | `409`; no second dispatch occurs |
| **Dispatch failure** | `5xx` with `call_id` when a row was created |
| **Tenant source** | Resolved from the authenticated user's `public.users` membership only |

### Acceptance Scenarios (from spec.md §3.2)

- **VOICE-TRIG-001**: Trigger without session → `401`, no call log
- **VOICE-TRIG-002**: Trigger without tenant membership → `403`, no call log
- **VOICE-TRIG-003**: Trigger with missing or malformed `lead_id` → `400`, no call log
- **VOICE-TRIG-004**: Trigger a foreign lead → `404`, no call log, no existence leak
- **VOICE-TRIG-005**: Trigger a lead without consent → `403`, no call log, no dispatch
- **VOICE-TRIG-006**: Trigger an excluded or review-required lead → `403`, no call log, no dispatch
- **VOICE-TRIG-007**: Trigger an eligible lead in sandbox mode → One completed simulation, deterministic summary, lead contacted
- **VOICE-TRIG-008**: Trigger an eligible lead with a test webhook → One queued row and one authenticated dispatch
- **VOICE-TRIG-009**: Trigger twice while active → `409`, no second dispatch
- **VOICE-TRIG-010**: Withdraw consent between queue and dispatch → No call placed; blocked outcome recorded

## 4.2 `POST /api/voice/webhook`

| Item | Contract |
|---|---|
| **Authentication** | `x-webhook-secret: <secret>` |
| **Request body** | `{ "call_id": "<uuid>", "call_status": "completed", "duration_seconds": 45, "transcript": "...", "ai_summary": "...", "next_action": "site_visit", "lead_status": "site_visit_requested" }` |
| **Success** | `200` with `{ "ok": true, "call": { ... } }` |
| **Missing or invalid secret** | `401`; changes nothing |
| **Secret not configured** | `503`; changes nothing |
| **Malformed body, missing `call_id`, invalid status, invalid duration or invalid lead status** | `400`; no partial update |
| **Unknown call** | `404`; no row created |
| **Tenant source** | Derived from the stored `call_logs` row only; `tenant_id` or `lead_id` supplied in callback body is ignored or rejected |
| **Idempotency** | Repeated terminal callbacks return `200` without duplicate effects |
| **State rule** | Terminal states are not regressed by late callbacks |

### Acceptance Scenarios (from spec.md §3.3)

- **VOICE-WH-001**: Valid callback → Call log updated; response `200`
- **VOICE-WH-002**: Missing or invalid secret → `401`, no change
- **VOICE-WH-003**: Secret not configured → `503`, no change
- **VOICE-WH-004**: Unknown `call_id` → `404`, no row created
- **VOICE-WH-005**: Malformed body, invalid status or invalid duration → `400`, no partial update
- **VOICE-WH-006**: Valid callback with supported lead status → Lead updated in the same tenant
- **VOICE-WH-007**: Legacy `site_visit` alias → Normalized to `site_visit_requested`
- **VOICE-WH-008**: Unsupported lead status → `400`, no partial update
- **VOICE-WH-009**: Duplicate terminal callback → `200`, no duplicate effects
- **VOICE-WH-010**: Late queued callback after terminal → Terminal state preserved
- **VOICE-WH-011**: Callback supplies foreign `tenant_id` → Ignored or rejected; stored tenant wins

## 4.3 `GET /api/tenant/call_logs/export`

| Item | Contract |
|---|---|
| **Authentication** | Supabase Auth bearer token |
| **Response** | `200`, `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="call_logs_<tenant_id>.csv"`, `Cache-Control: no-store` |
| **Missing session** | `401`; no CSV |
| **No tenant membership** | `403`; no CSV |
| **Query failure** | `500`; no partial file |
| **Tenant source** | Authenticated user's `public.users` membership only; must NOT read `tenant_id` from query parameters, request body or arbitrary headers |
| **Ordering** | `created_at DESC` (newest first) |
| **CSV safety** | Formula prefixes neutralized (`=`, `+`, `-`, `@`); quotes, commas and newlines escaped |
| **Columns** | call identity, lead identity, provider, status, duration, transcript, summary, next action, cost, mode and creation time |

### Acceptance Scenarios (from spec.md §3.4)

- **VOICE-EXP-001**: Export without session → `401`, no CSV
- **VOICE-EXP-002**: Export without membership → `403`, no CSV
- **VOICE-EXP-003**: Export tenant A with tenant B rows present → Only tenant A rows; newest first
- **VOICE-EXP-004**: Export headers and filename → Exact CSV contract
- **VOICE-EXP-005**: Formula-prefixed transcript → Cell neutralized
- **VOICE-EXP-006**: Export query failure → `500`, no partial file

## 4.4 Outbound workflow contract (`VOICE_AGENT_WEBHOOK_URL`)

| Item | Contract |
|---|---|
| **Method** | `POST` |
| **Authentication** | Configured trigger secret header; secret value is environment-managed |
| **Payload** | `call_id`, `tenant_id`, lead identity and contact context, `consent` evidence, backend `eligibility` decision, `callback_url` |
| **Must not include** | Service-role key, inbound webhook secret, database credentials, unrelated tenant data |
| **Timeout** | Bounded by `VOICE_AGENT_TIMEOUT_SECONDS` |
| **Failure behavior** | Mark the call failed and surface an actionable error |
| **Provider modes** | Simulated by default; live only after explicit approval |
| **Callback** | `POST /api/voice/webhook` with `x-webhook-secret` |

## 4.5 Environment Variables

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

## 5. Data Model Contracts (from spec.md §5)

### 5.1 `public.call_logs`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key, server side default |
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

**RLS summary**:
- `SELECT`: authenticated users may read call logs for their own tenant
- `INSERT`: authenticated users may insert only for their own tenant and own `user_id`
- `UPDATE`: authenticated users may update only their own tenant and own `user_id`
- `DELETE`: no authenticated policy; deletion occurs through cascade or trusted server-side operations
- Service-role access is server-side only and MUST still scope queries by the resolved call or tenant

### 5.2 Related lead fields

| Field | Rule |
|---|---|
| `tenant_id` | Required tenant boundary |
| `consent_given` | Required boolean, default false; only explicit evidence sets true |
| `status` | Canonical ADR-0001 status |
| `phone` | Normalized before deduplication |
| `user_id` / owner | Used for attribution, not as a substitute for tenant isolation |

## 6. Success Criteria (from spec.md §8)

- **SC-001**: 100% of live E2E scenarios pass against `https://web-olive-delta-41.vercel.app`
- **SC-002**: 100% of cross-tenant read and write attempts are denied, with zero rows changed in the target tenant
- **SC-003**: 100% of trigger attempts without explicit consent, or with an excluded/review-required lead, are blocked and create zero call logs and zero provider dispatches
- **SC-004**: 100% of webhook attempts with a missing, invalid or unconfigured secret are rejected without changing business data
- **SC-005**: 100% of duplicate terminal callbacks produce zero duplicate call logs, duplicate lead transitions or duplicate audit events
- **SC-006**: 100% of call-log exports contain zero rows from another tenant and preserve newest-first ordering
- **SC-007**: A simulated trigger returns a result within 2 seconds at p95, and an external dispatch never exceeds the configured timeout
- **SC-008**: Development and test runs place zero real calls, send zero messages and record `0.00` INR estimated cost
- **SC-009**: Every blocked or failed voice action produces an actionable, non-secret-bearing error or audit record
- **SC-010**: Tasks 1.1, 1.2 and 1.3 remain open until their unit and live E2E gates pass; no task is reported complete on offline checks alone