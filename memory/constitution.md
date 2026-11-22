# Project Constitution & Autonomous Agent Rules

## 1. Human-in-the-Loop Gatekeeper (STRICT)
You (OpenCode / Hermes) MUST execute autonomously without asking the user for copy-paste help EXCEPT when one of these 3 blockers occurs:
1. **SQL_REQUIRED:** A new database table, column, or RLS migration needs to be executed in Supabase SQL Editor. Output the exact SQL block clearly tagged `[ACTION_REQUIRED: RUN_SQL_IN_SUPABASE]` and pause until confirmed.
2. **SECRET_REQUIRED:** A missing API key or credential (`GROQ_API_KEY`, `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_SOURCE_NUMBER`, `GOOGLE_SERVICE_ACCOUNT_JSON`, etc.) is not in `apps/web/.env.local`. Tag `[ACTION_REQUIRED: ADD_ENV_KEY]` and pause.
3. **PUSH_APPROVAL:** All unit tests, `npm run build`, and Playwright E2E tests for the current task pass (`0 errors`). Do NOT run `git push` automatically—output `[READY_FOR_PUSH]` with a concise summary and ask the user for approval to commit & push.

## 2. Engineering & Architecture Standards
- **Multi-Tenant Security:** Every table and API query MUST enforce `tenant_id` isolation via Supabase RLS. Never trust client-supplied `tenant_id`.
- **Consent Gate:** Outbound voice triggers MUST verify `consent_verified = true` before queuing or dialing.
- **Voice Stack:** Use Groq (`llama-3.3-70b-versatile` + `whisper-large-v3-turbo`) for sub-second intelligence, local `edge-tts` (`hi-IN-SwaraNeural`, `gu-IN-DhwaniNeural`, `en-IN-NeerjaNeural`) for zero-cost multilingual speech, and Plivo API (with `sandbox_voice_sim` fallback when Plivo keys are absent) for outbound calls.
- **Self-Healing & Zero-Regression Loop:** After writing code, ALWAYS run `npm run build` and relevant Playwright tests (including `tests/e2e/phase1-full.live.spec.ts` so Phase 1 never breaks). If any error occurs, read the stack trace/error-context, patch the code, and re-run until green.
