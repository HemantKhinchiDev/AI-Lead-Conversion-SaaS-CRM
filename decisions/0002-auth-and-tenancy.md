# ADR-0002 — Authentication, tenant creation and RLS

**Status:** Accepted
**Date:** 2026-11-18
**Decider:** Project owner (implementation task: Supabase Auth + tenants + RLS + login page)
**Related:** ADR-0001, `docs/PRD.md` FR-002/FR-003/FR-005, `docs/DATABASE.md` §6

## Context

Phase 1 needs business registration, login, exactly one workspace per registering owner, and database-enforced tenant isolation. The browser cannot be trusted to supply a `tenant_id`, and the frontend must not hold backend credentials.

## Decisions

1. Supabase Auth is the identity provider. The browser uses `@supabase/supabase-js` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.
2. The Supabase anon key is a public, RLS-protected key, not a backend secret. The service-role key is never referenced in `apps/web`; it remains available only to trusted backend code.
3. Registration sends `business_name` and `full_name` as Auth user metadata. An `AFTER INSERT ON auth.users` trigger (`handle_new_user`) creates the tenant row and the owner's `public.users` membership in one transaction. The client never supplies `tenant_id` or `role`.
4. Roles follow ADR-0001: `platform_admin`, `business_owner`, `sales_manager`, `sales_rep`.
5. `public.tenants` and `public.users` have RLS enabled. Reads are scoped by `current_tenant_id()`; updates require the business owner role. No `INSERT` or `DELETE` policy exists for `authenticated`, so workspaces and memberships can only be created by the trusted trigger or backend service role.
6. Tenant lookup helpers are `SECURITY DEFINER` with a pinned `search_path` to avoid RLS recursion and search-path hijacking.

## Consequences

- A new Auth user always gets one isolated tenant; a failed metadata validation aborts registration.
- Cross-tenant reads and writes are rejected by PostgreSQL even if an API forgets to filter by tenant.
- Browser code can read only the anon key; all privileged operations must go through backend code or RLS-approved SQL.
- The SQL migrations are static-checked offline. Live RLS behaviour still needs a Supabase Free test-project run before real data is used.
