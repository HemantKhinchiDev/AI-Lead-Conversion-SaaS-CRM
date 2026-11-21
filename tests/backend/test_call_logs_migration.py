from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20261121_align_call_logs_spec.sql"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def _normalised() -> str:
    return re.sub(r"\s+", " ", _read(MIGRATION)).strip()


def test_call_logs_migration_defines_expected_columns() -> None:
    sql = _normalised().lower()
    assert "create table if not exists public.call_logs" in sql
    for prefix in (
        "id uuid primary key default gen_random_uuid",
        "user_id uuid not null",
        "lead_id uuid not null",
        "provider text",
        "call_status text",
        "duration_seconds integer",
        "transcript text",
        "ai_summary text",
        "next_action text",
        "estimated_cost_inr numeric(10,2) not null default 0.00",
        "mode text not null default",
        "created_at timestamptz not null default now",
    ):
        assert prefix in sql


def test_call_logs_migration_adds_lookup_indexes() -> None:
    sql = _normalised().lower()
    assert "create index" in sql
    assert "idx_call_logs_lead_id" in sql
    assert "idx_call_logs_user_id" in sql
    assert "tenant_id, created_at" in sql


def test_call_logs_migration_enables_rls_with_tenant_owner_policies() -> None:
    sql = _normalised().lower()
    assert "enable row level security" in sql
    for prefix in (
        "create policy",
        "auth.uid() = user_id",
    ):
        assert prefix in sql
    assert "for delete" not in sql
    assert "using (auth.uid()" in sql


def test_call_logs_migration_reloads_postgrest_schema_on_writes() -> None:
    sql = _normalised().lower()
    assert "notify pgrst, 'reload schema'" in sql