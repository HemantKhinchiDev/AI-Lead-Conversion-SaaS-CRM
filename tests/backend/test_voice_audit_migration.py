from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20261121_create_voice_audit_events.sql"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def _normalised() -> str:
    return re.sub(r"\s+", " ", _read(MIGRATION)).strip()


def test_voice_audit_events_table_exists() -> None:
    sql = _normalised().lower()
    assert "create table if not exists public.voice_audit_events" in sql


def test_voice_audit_events_has_tenant_id() -> None:
    sql = _normalised().lower()
    assert "tenant_id uuid not null" in sql


def test_voice_audit_events_has_action_column() -> None:
    sql = _normalised().lower()
    assert "action text not null" in sql


def test_voice_audit_events_has_resource_type() -> None:
    sql = _normalised().lower()
    assert "resource_type text not null" in sql


def test_voice_audit_events_has_resource_id() -> None:
    sql = _normalised().lower()
    assert "resource_id text not null" in sql


def test_voice_audit_events_has_metadata_jsonb() -> None:
    sql = _normalised().lower()
    assert "metadata jsonb not null default" in sql


def test_voice_audit_events_has_created_at() -> None:
    sql = _normalised().lower()
    assert "created_at timestamptz not null default now" in sql


def test_voice_audit_events_rls_enabled() -> None:
    sql = _normalised().lower()
    assert "enable row level security" in sql


def test_voice_audit_events_select_policy_tenant_scoped() -> None:
    sql = _normalised().lower()
    assert "tenant_select_voice_audit_events" in sql


def test_voice_audit_events_insert_policy_tenant_scoped() -> None:
    sql = _normalised().lower()
    assert "tenant_insert_voice_audit_events" in sql


def test_voice_audit_events_no_update_policy_for_authenticated() -> None:
    sql = _normalised().lower()
    assert "for update" not in sql or "audit_events" not in sql


def test_voice_audit_events_no_delete_policy_for_authenticated() -> None:
    sql = _normalised().lower()
    assert "for delete" not in sql or "audit_events" not in sql


def test_voice_audit_events_select_uses_tenant_subquery() -> None:
    sql = _normalised().lower()
    assert "tenant_id in (select tenant_id from public.users" in sql


def test_voice_audit_events_insert_uses_tenant_subquery() -> None:
    sql = _normalised().lower()
    assert "tenant_id in (select tenant_id from public.users" in sql