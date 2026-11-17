from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps" / "web"
APP = WEB / "src" / "app"
DASHBOARD = APP / "dashboard" / "page.tsx"
CLIENT = APP / "dashboard" / "DashboardClient.tsx"
API_LIB = WEB / "src" / "lib" / "leads.ts"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def test_dashboard_route_exists() -> None:
    assert DASHBOARD.is_file()
    assert CLIENT.is_file()
    assert API_LIB.is_file()


def test_dashboard_is_server_wrapper_around_client_component() -> None:
    page = _read(DASHBOARD)
    assert 'export const metadata: Metadata' in page
    assert 'import DashboardClient from "./DashboardClient"' in page
    assert "<DashboardClient />" in page
    assert "fetch(" not in page


def test_dashboard_uses_dummy_api_and_keeps_demo_labelling() -> None:
    client = _read(CLIENT)
    library = _read(API_LIB)

    assert "Demo data only" in client
    assert "no live calls" in client
    assert "/leads" in client
    assert "fetchLeads" in client
    assert "createLead" in client
    assert "fetch(" in library
    assert "leadsEndpoint()" in library


def test_dashboard_shows_required_sections() -> None:
    page = _read(CLIENT)
    for label in (
        "Key numbers",
        "Permission verified",
        "Consent guardrails",
        "Recent leads",
        "Campaigns",
        "Follow-ups",
        "Needs review",
        "Excluded",
    ):
        assert label in page


def test_dashboard_renders_api_leads_with_loading_empty_and_error_states() -> None:
    page = _read(CLIENT)
    for marker in (
        'loadState === "loading"',
        'loadState === "error"',
        "leads.length === 0",
        "leads.map(",
        "Retry",
        "onSubmit={handleSubmit}",
    ):
        assert marker in page


def test_dashboard_has_no_static_lead_ids() -> None:
    assert not re.findall(r"LD-\d+", _read(CLIENT))


def test_dashboard_contains_no_backend_secret_names() -> None:
    page = _read(CLIENT) + _read(API_LIB)
    for name in (
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "GROQ_API_KEY",
        "GEMINI_API_KEY",
        "DATABASE_URL",
    ):
        assert name not in page


def test_dashboard_styles_are_offline_and_present() -> None:
    css = _read(APP / "globals.css")
    for selector in (
        ".dashboard-main",
        ".app-shell",
        ".sidebar",
        ".metrics",
        ".table",
        ".badge",
        ".section-grid",
        ".lead-form",
        ".state-message",
    ):
        assert selector in css
    assert "@import" not in css
    assert "http://" not in css
    assert "https://" not in css


def test_home_page_links_to_dashboard() -> None:
    assert 'href="/dashboard"' in _read(APP / "page.tsx")


def test_pytest_discovers_dashboard_checks() -> None:
    assert "tests/frontend" in _read(ROOT / "pytest.ini")
