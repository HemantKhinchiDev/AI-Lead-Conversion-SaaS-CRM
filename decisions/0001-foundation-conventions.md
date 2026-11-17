# ADR-0001 — Foundation conventions

**Status:** Accepted
**Date:** 2026-11-17
**Decider:** Project owner

## Context

The project owner approved the phase 0 foundation conventions. Several of them override text in the
current `DATABASE.md` and `README.md`. This record is the implementation source of truth until those
documents are updated.

## Decisions

1. **Repository layout:** `apps/web` (Next.js) and `services/api` (FastAPI). Tests are grouped under
   `tests/backend`, `tests/frontend` and `tests/integration`.
2. **Documentation location:** project docs live in `docs/`; numbered decision records live in
   `decisions/`.
3. **Roles — follow the PRD**, not `DATABASE.md` §4.2/§6:
   `platform_admin`, `business_owner`, `sales_manager`, `sales_rep`.
4. **Status enums — follow the PRD**, not `DATABASE.md` §4.5/§4.10:
   - Lead status: `new`, `contact_pending`, `contacted`, `interested`, `hot_lead`, `warm_lead`,
     `cold_lead`, `follow_up_required`, `site_visit_requested`, `site_visit_scheduled`, `converted`,
     `not_interested`, `do_not_contact`.
   - Call outcome: `interested`, `highly_interested`, `follow_up_required`, `not_interested`,
     `no_answer`, `busy`, `invalid_number`, `wrong_person`, `do_not_contact`,
     `needs_human_assistance`.
5. **Projects are Phase 1 scope**, overriding `DATABASE.md` §11, which lists them in Phase 3.
6. **Supabase:** free-tier development project only. No paid resources or API activation.
7. **Queue:** PostgreSQL-backed job records with row locking (`DATABASE.md` §8). No Redis.

## Consequences

- `DATABASE.md` role/status values and project phasing must be updated before Phase 1 migrations.
- Root-level documentation copies are legacy; `docs/` is authoritative. `WORKFLOW.md` still needs to
  be placed in `docs/` and the duplicates reconciled.
- No secrets, live providers or real customer data are used during development.
