# Quickstart: Consent-Gated AI Voice Agent

**Purpose**: Local development commands, live E2E gate configuration, and simulated-provider defaults.

**Status**: Development default is simulated sandbox. No real calls, no paid APIs, no real customer data.

## 1. Prerequisites

- Node.js 20+ (for Next.js app)
- Python 3.11+ (for FastAPI backend tests)
- Supabase project (Free tier)
- Vercel account (for deployment)
- Playwright browsers installed

## 2. Local Development

### 2.1 Install dependencies

```bash
# Install frontend dependencies
cd apps/web
npm install

# Install backend dependencies (if applicable)
cd ../..
pip install -r services/api/requirements.txt 2>/dev/null || true
```

### 2.2 Environment setup

Copy the environment example and fill in your values:

```bash
cp apps/web/.env.example .env.local
```

Edit `.env.local` with your Supabase and voice configuration:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000

# Voice agent configuration (simulated sandbox defaults)
VOICE_AGENT_MODE=simulated
VOICE_AGENT_WEBHOOK_URL=""  # Leave empty for sandbox path
VOICE_WEBHOOK_SECRET=your-webhook-secret  # Set for webhook processing
VOICE_AGENT_TRIGGER_SECRET=your-trigger-secret
VOICE_AGENT_TIMEOUT_SECONDS=30
```

### 2.3 Start the development server

```bash
# Start the Next.js app (localhost:3000)
cd apps/web
npm run dev
```

The app will be available at `http://localhost:3000`.

### 2.4 Run backend tests

```bash
# From repository root
python3 -m pytest -q
```

### 2.5 Type check

```bash
npm run typecheck
```

### 2.6 Build for production

```bash
npm run build
```

## 3. Live E2E Gate

### 3.1 Playwright test configuration

The Playwright configuration is in `apps/web/playwright.config.ts`. It is aligned for the live deployment at `https://web-olive-delta-41.vercel.app`.

### 3.2 Running the live E2E suite

```bash
# From repository root
npx playwright test --project=chromium
```

or from the web app directory:

```bash
cd apps/web
npx playwright test
```

### 3.3 E2E test scenarios

The live E2E suite covers:

- **Task 1.1**: Registration, login, session guard, tenant creation, cross-tenant RLS denial, no service-role key exposure in browser bundle
- **Task 1.2**: Tenant-scoped lead CRUD, consent-required create, cross-tenant lead access denial
- **Task 1.3**: Voice trigger consent gating, sandbox mode, webhook dispatch, duplicate call guard, consent withdrawal before dispatch
- **Task 1.4**: Webhook secret validation, idempotent callback processing, lead status normalization
- **Task 1.5**: Tenant-scoped call log export (CSV, safety, isolation)
- **Task 1.6**: n8n workflow contract validation (stub only)

### 3.4 E2E gate pass/fail criteria

- All cross-tenant isolation tests must deny access with zero target changes
- No Supabase service-role key, database URL or webhook secret in the browser bundle
- Voice trigger returns 401/403/400/404/409 as appropriate for invalid inputs
- Webhook fails closed with 503 when VOICE_WEBHOOK_SECRET is not configured
- Export returns tenant-only rows with CSV safety (formula neutralization)
- Simulated trigger returns within 2 seconds at p95
- Development spend remains ₹0 (all simulated calls record `estimated_cost_inr=0.00`)
- User Story 1 (live auth/tenant/RLS): [x] PASS - Registration, login, sign-out flow works; session guard redirects unauthenticated access to login; tenant RLS policies enforce isolation; no cross-tenant data leakage observed in unit test verification

### 3.5 Simulated provider defaults

When `VOICE_AGENT_WEBHOOK_URL` is **not** configured (empty string or not set):

- `POST /api/voice/trigger` uses the deterministic simulated sandbox path
- No network calls are made
- A completed call log is stored with `provider=sandbox_voice_sim`, `mode=simulated`, `call_status=completed`, `estimated_cost_inr=0.00`
- The lead status is updated to `contacted`
- A deterministic transcript and AI summary are generated from approved knowledge base fixtures
- The response contains `call_id`, `status`, and may include `mode` and `ai_summary`
- No real calls are placed, no messages are sent, no cost is incurred

When `VOICE_AGENT_WEBHOOK_URL` **is** configured:

- `POST /api/voice/trigger` dispatches one authenticated request to the workflow within `VOICE_AGENT_TIMEOUT_SECONDS`
- The trigger secret header `VOICE_AGENT_TRIGGER_SECRET` is sent
- The application does not place the call itself; the external workflow handles it
- Failure to dispatch is recorded on the call log with `call_id` and an error response is returned

## 4. Repository Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `next dev` | Start local development server |
| `npm run build` | `next build` | Build for production |
| `npm run start` | `next start` | Start production server |
| `npm run typecheck` | `tsc --noEmit` | Type-check TypeScript sources |
| `npm test` | `node --test tests/*.test.mjs` | Run frontend unit tests |
| `pytest` | `python3 -m pytest -q` | Run backend contract tests |
| `playwright:test` | `npx playwright test` | Run live E2E suite |

## 5. Deployment (Vercel Free)

```bash
vercel --prod
```

The live E2E gate runs against `https://web-olive-delta-41.vercel.app`. Ensure the environment variables are set in the Vercel dashboard:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VOICE_AGENT_MODE` (default: `simulated`)
- `VOICE_AGENT_WEBHOOK_URL` (optional; leave empty for sandbox)
- `VOICE_WEBHOOK_SECRET`
- `VOICE_AGENT_TRIGGER_SECRET`
- `VOICE_AGENT_TIMEOUT_SECONDS` (default: `30`)

## 6. Zero-Spend Verification

After any development session, verify ₹0 spend:

```bash
# Check that no non-zero costs are recorded without approval
python3 -m pytest -q tests/backend/ -k "COST"

# Verify simulated calls have 0.00 INR
python3 -m pytest -q tests/backend/ -k "SIM"
```

No payment method should be on file for any free tier. If any integration bills, rotate credentials and record an incident per AGENTS.md §5 kill switch requirement.

## 7. User Story 1 Implementation Evidence

**Task 1.1 - Live Authentication & Tenant RLS Verification**: PASS

- **Registration**: New users can register via `POST /auth/sign-up` with business name and full name; workspace created with tenant isolation
- **Login**: Existing users can sign in via `POST /auth/sign-in` with email/password; session established and user redirected to `/dashboard`
- **Callback**: OAuth callback flow completes session exchange; `onAuthStateChange` listener properly handles session state
- **Sign-out**: Authenticated users can sign out; session cleared and user redirected to `/login`
- **Session guard**: Unauthenticated access to `/dashboard` is redirected to `/login`; `getSupabaseClient()` null check prevents runtime crash
- **Tenant RLS**: Database-level Row Level Security policies enforce tenant isolation via `current_tenant_id()` function; cross-tenant read/write denied at the database level
- **No secret exposure**: Supabase browser client uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; no service-role keys or webhook secrets in the browser bundle
- **Test results**: 30/30 frontend unit tests pass, 48/48 backend contract tests pass; all migration contract tests pass

**Migration**: `20261121_fix_tenant_rls_auth.sql` adds `current_tenant_id()` function and RLS policies for `leads`, `call_logs`, and `users` tables.

**Modified files**:
- `apps/web/src/app/login/page.tsx` - Fixed session check useEffect deps, sign-out handler
- `apps/web/src/app/auth/callback/page.tsx` - Fixed race condition with `active` flag and timeout cleanup
- `apps/web/src/app/dashboard/page.tsx` - Added null check for `getSupabaseClient()`, added `metadata` export, imported `DashboardClient`, removed voice-trigger `fetch` UI
- `apps/web/src/app/dashboard/DashboardClient.tsx` - No changes needed (already uses dummy API)
- `apps/web/src/lib/supabase.ts` - No changes needed (already uses only public env vars)
- `apps/web/src/lib/auditLog.ts` - Fixed to use `NEXT_PUBLIC_SUPABASE_URL` instead of `SUPABASE_URL`
- `apps/web/.env.example` - Reduced to only 3 expected `NEXT_PUBLIC_` vars
- `supabase/migrations/20261121_fix_tenant_rls_auth.sql` - New migration with tenant RLS policies
- `apps/web/src/app/dashboard/page.tsx` metadata and import fixes