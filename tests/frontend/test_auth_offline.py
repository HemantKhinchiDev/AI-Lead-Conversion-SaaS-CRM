from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps" / "web"
MIGRATIONS = ROOT / "services" / "api" / "migrations"
LOGIN = WEB / "src" / "app" / "login" / "page.tsx"
SUPABASE_LIB = WEB / "src" / "lib" / "supabase.ts"
HOME = WEB / "src" / "app" / "page.tsx"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def test_login_route_imports_usestate_from_react() -> None:
    page = _read(LOGIN)
    assert '"use client"' in page
    assert re.search(r'import \{[^}]*\buseState\b[^}]*\} from "react";', page)
    assert "useState<AuthMode>" in page
    assert "useState(" in page


def test_login_uses_supabase_auth_and_redirects_to_dashboard() -> None:
    page = _read(LOGIN)
    for marker in (
        "signInWithPassword",
        "signUp(",
        "signOut(",
        "business_name",
        "full_name",
        'router.push("/dashboard")',
        'href="/dashboard"',
    ):
        assert marker in page


def test_browser_supabase_client_uses_public_environment_only() -> None:
    library = _read(SUPABASE_LIB)
    assert "createClient" in library
    assert "NEXT_PUBLIC_SUPABASE_URL" in library
    assert "NEXT_PUBLIC_SUPABASE_ANON_KEY" in library
    assert "SUPABASE_SERVICE_ROLE_KEY" not in library
    assert "DATABASE_URL" not in library

    env_references = set(re.findall(r"process\.env\.([A-Z0-9_]+)", library))
    assert env_references == {"NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"}


def test_frontend_has_no_service_role_credentials() -> None:
    sources = "\n".join(
        _read(path)
        for path in (WEB / "src").rglob("*")
        if path.suffix in {".ts", ".tsx"} or path.name == ".env.example"
    )
    assert "SUPABASE_SERVICE_ROLE_KEY" not in sources
    assert "service_role" not in sources


def test_env_example_contains_supabase_placeholders() -> None:
    env_example = _read(WEB / ".env.example")
    assert "NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co" in env_example
    assert "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key" in env_example


def test_tenants_and_users_migrations_exist() -> None:
    tenants_sql = _read(MIGRATIONS / "001_create_tenants.sql")
    users_sql = _read(MIGRATIONS / "002_create_users.sql")

    assert "create table public.tenants" in tenants_sql
    assert "create table public.users" in users_sql
    assert "references auth.users(id) on delete cascade" in users_sql
    assert "references public.tenants(id) on delete cascade" in users_sql
    assert "business_owner" in users_sql
    assert "sales_manager" in users_sql
    assert "sales_rep" in users_sql
    assert "platform_admin" in users_sql


def test_rls_is_enabled_with_tenant_scoped_policies() -> None:
    tenants_sql = _read(MIGRATIONS / "001_create_tenants.sql")
    users_sql = _read(MIGRATIONS / "002_create_users.sql")

    assert "alter table public.tenants enable row level security" in tenants_sql
    assert "alter table public.users enable row level security" in users_sql
    for policy in (
        "create policy tenants_select_own",
        "create policy tenants_update_owner",
        "create policy users_select_own_tenant",
        "create policy users_update_owner",
    ):
        assert policy in users_sql
    assert "id = public.current_tenant_id()" in users_sql
    assert "tenant_id = public.current_tenant_id()" in users_sql
    assert "security definer" in users_sql
    assert "for insert" not in users_sql
    assert "for delete" not in users_sql
    assert "grant update (name, email, phone, website, timezone, default_language)" in tenants_sql
    assert "grant update (full_name, status)" in users_sql


def test_signup_creates_one_tenant_and_owner_membership() -> None:
    users_sql = _read(MIGRATIONS / "002_create_users.sql")
    for marker in (
        "create trigger on_auth_user_created",
        "after insert on auth.users",
        "raw_user_meta_data->>'business_name'",
        "raw_user_meta_data->>'full_name'",
        "insert into public.tenants",
        "insert into public.users",
        "'business_owner'",
    ):
        assert marker in users_sql


def test_home_page_links_to_login() -> None:
    assert 'href="/login"' in _read(HOME)
