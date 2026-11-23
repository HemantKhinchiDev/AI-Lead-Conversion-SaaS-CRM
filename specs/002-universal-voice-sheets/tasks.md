# Phase 2 Autonomous Execution Queue

- [x] **T011: Vobiz API Client (`apps/web/src/lib/vobiz.ts`)**
  - **Goal:** Create `apps/web/src/lib/vobiz.ts` using `VOBIZ_AUTH_ID`, `VOBIZ_AUTH_TOKEN`, `VOBIZ_FROM_NUMBER` from `process.env`, referencing the existing `plivo.ts` implementation.
  - **Verify:** File exists and uses the specified environment variables with secrets kept server-side.

- [x] **T012: Vobiz Outbound Trigger (`apps/web/src/app/api/voice/trigger/route.ts`)**
  - **Goal:** Update `apps/web/src/app/api/voice/trigger/route.ts` to place Vobiz outbound calls and log `provider: "vobiz"` in `call_logs`.
  - **Verify:** Outbound call path and `call_logs` provider value verified.

- [x] **T013: VobizXML Endpoint & Webhook Update**
  - **Goal:** Create `apps/web/src/app/api/voice/vobiz-xml/route.ts` (VobizXML + Groq + `edge-tts`) and update `apps/web/src/app/api/voice/webhook/route.ts`.
  - **Verify:** New endpoint and webhook updates in place.

- [x] **T014: Vobiz Bridge Tests (`apps/web/tests/vobiz-bridge.test.mjs`)**
  - **Goal:** Add `apps/web/tests/vobiz-bridge.test.mjs` and ensure `npm test && npm run typecheck && npm run build` pass.
  - **Verify:** `cd apps/web && npm test && npm run typecheck && npm run build` passes with 0 errors/failures.

- [x] **T007: Vobiz API Client (`apps/web/src/lib/vobiz.ts`)**
  - **Goal:** Create `apps/web/src/lib/vobiz.ts` with functions for outbound call trigger (POST to Vobiz `/calls`), VobizXML generation for the Groq + `edge-tts` TTS pipeline, a webhook handler for call status updates, and proper error handling with fallbacks. Use env vars `VOBIz_API_KEY`, `VOBIz_ACCOUNT_ID`, `VOBIz_FROM_NUMBER`, `GROQ_API_KEY`, `EDGE_TTS_VOICE`. Keep all secrets server-side and preserve simulated-provider fallback when keys are absent.
  - **Verify:** `cd apps/web && npm run build` passes with 0 errors.

- [ ] **T008: Vobiz Outbound Trigger (`apps/web/src/app/api/voice/trigger/route.ts`)**
  - **Goal:** Update `apps/web/src/app/api/voice/trigger/route.ts` to integrate `vobiz.ts` and make actual outbound calls via the Vobiz API instead of the mock. Handle success/failure responses, log the call ID, and return a proper JSON response while preserving consent gating and tenant isolation.
  - **Verify:** `cd apps/web && npm run build` passes with 0 errors.

- [ ] **T009: VobizXML Endpoint & Webhook Events**
  - **Goal:** Create `apps/web/src/app/api/voice/vobiz-xml/route.ts` generating VobizXML (Twilio-like XML) for the voice agent flow: play TTS via `edge-tts`, capture user input, route to Groq for the AI response, and loop until hangup. Also update `apps/web/src/app/api/voice/webhook/route.ts` to handle Vobiz webhook events (call completed, hangup, DTMF) and trigger Groq analysis on hangup.
  - **Verify:** `cd apps/web && npm run build` passes with 0 errors.

- [ ] **T010: Vobiz Bridge Unit Tests (`apps/web/tests/vobiz-bridge.test.mjs`)**
  - **Goal:** Add unit tests in `apps/web/tests/vobiz-bridge.test.mjs` covering the `vobiz.ts` functions (mock `fetch`), the trigger route, VobizXML generation, and the webhook handler. Ensure all tests pass with `npm test`.
  - **Verify:** `cd apps/web && npm test` passes with 0 failures.

- [x] **T001: Database Migration (SQL Gatekeeper)**
  - **Goal:** Create `supabase/migrations/002_universal_kb_and_outcomes.sql` defining `public.knowledge_bases` (with RLS) and adding `call_outcome`, `callback_datetime`, `ai_summary`, `full_transcript`, `sheet_id`, `sheet_row_index` to `public.leads` and `public.call_logs`.
  - **Verify:** File exists and is valid SQL; emit `[ACTION_REQUIRED: RUN_SQL_IN_SUPABASE]` with the exact SQL block and pause for user confirmation.

- [x] **T002: Universal Knowledge Base Auto-Trainer (`POST /api/kb/train` + Dashboard UI)**
  - **Goal:** Build `/api/kb/train` to fetch website text (`https://r.jina.ai/<url>` with fetch fallback), extract structured business profile, FAQs & call script via Groq (`llama-3.3-70b-versatile`), and upsert into `knowledge_bases`. Add "Train AI Agent" panel to Dashboard (Website URL, Google Map link, Call Goal, Script editor) and generalize real-estate-only UI labels.
  - **Verify:** `cd apps/web && npm run build` passes with 0 errors.

- [x] **T003: Multilingual Voice Brain (`POST /api/voice/respond`), `edge-tts` & Plivo Dialer Bridge**
  - **Goal:** Create `/api/voice/respond` grounded in tenant `knowledge_bases` supporting `hi-IN`, `gu-IN`, `en-IN` + wire local `edge-tts` audio synthesis + add "Test AI Voice (Live Demo)" modal on Dashboard + wire optional Plivo outbound call trigger in `/api/voice/trigger` (with `sandbox_voice_sim` fallback when Plivo env keys are absent).
  - **Verify:** `cd apps/web && npm run build` passes with 0 errors.

- [x] **T004: Post-Call Outcome & Summary Extractor (`POST /api/voice/analyze`)**
  - **Goal:** Update `/api/voice/webhook` & `/api/voice/analyze` to extract `call_outcome` (`INTERESTED`, `NOT_INTERESTED`, `CALLBACK_REQUESTED`, `NO_ANSWER`), `callback_datetime`, `ai_summary`, and `full_transcript` via Groq JSON mode, update `leads` & `call_logs`, and render Outcome badges + Callback Time + AI Summary in Dashboard table.
  - **Verify:** `cd apps/web && npm run build` passes and simulated call updates lead outcome & summary.

- [x] **T005: 2-Way Google Sheets Sync (`/api/sheets/import`, Row Auto-Update & `/api/sheets/export`)**
  - **Goal:** Support importing leads from a Google Sheet URL (`+91` normalized, storing `sheet_id` & `sheet_row_index`), auto-updating existing sheet rows after calls when Google Sheets credentials are configured, and 1-click "Export to Google Sheet / CSV" from Dashboard.
  - **Verify:** `cd apps/web && npm run build` passes with 0 errors.

- [x] **T006: Full Phase 2 Live Playwright E2E & Phase 1 Regression Verification**
  - **Goal:** Write and run `apps/web/tests/e2e/phase2-universal-voice.live.spec.ts` verifying KB training, simulated AI call with `INTERESTED` outcome + summary rendering in table, and export button, plus re-run `phase1-full.live.spec.ts`.
  - **Verify:** `cd apps/web && npx playwright test tests/e2e/phase1-full.live.spec.ts tests/e2e/phase2-universal-voice.live.spec.ts --reporter=list` outputs `2 passed`.
