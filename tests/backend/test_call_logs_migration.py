from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20261119_create_call_logs.sql"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def _normalised() -> str:
    return re.sub(r"\s+", " ", _read(MIGRATION)).strip()


def test_call_logs_migration_defines_expected_columns() -> None:
    sql = _normalised()
    assert "create table public.call_logs" in sql
    for column in (
        "id uuid primary key default gen_random_uuid()",
        "user_id uuid not null",
        "lead_id uuid not null",
        "provider text",
        "call_status text",
        "duration_seconds integer",
        "transcript text",
        "ai_summary text",
        "next_action text",
        "created_at timestamptz not null default now()",
    ):
        assert column in sql


def test_call_logs_migration_adds_lookup_indexes() -> None:
    sql = _normalised()
    assert "create index call_logs_lead_id_idx on public.call_logs (lead_id)" in sql
    assert "create index call_logs_user_id_idx on public.call_logs (user_id)" in sql


def test_call_logs_migration_enables_rls_with_tenant_owner_policies() -> None:
    sql = _normalised()
    assert "alter table public.call_logs enable row level security" in sql
    for policy in (
        "create policy call_logs_select_own on public.call_logs for select to authenticated using (auth.uid() = user_id)",
        "create policy call_logs_insert_own on public.call_logs for insert to authenticated with check (auth.uid() = user_id)",
        "create policy call_logs_update_own on public.call_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)",
    ):
        assert policy in sql
    assert "for delete" not in sql
    assert "grant select, insert, update on public.call_logs to authenticated" in sql


def test_call_logs_migration_reloads_postgrest_schema_on_writes() -> None:
    sql = _normalised()
    assert "notify pgrst, 'reload schema'" in sql
    assert (
        "create trigger call_logs_notify_schema_reload after insert or update "
        "on public.call_logs for each statement execute function "
        "public.notify_call_logs_schema_reload()"
    ) in sql
