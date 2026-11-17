from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps" / "web"
APP = WEB / "src" / "app"
DASHBOARD = APP / "dashboard" / "page.tsx"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def test_dashboard_route_exists() -> None:
    assert DASHBOARD.is_file()


def test_dashboard_uses_static_demo_data_only() -> None:
    page = _read(DASHBOARD)
    assert "Demo data only" in page
    assert "no live calls" in page
    assert "fetch(" not in page
    assert "process.env" not in page
    assert "force-dynamic" not in page


def test_dashboard_shows_required_sections() -> None:
    page = _read(DASHBOARD)
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


def test_dashboard_shows_twenty_unique_dummy_leads() -> None:
    lead_ids = re.findall(r'id: "(LD-\d+)"', _read(DASHBOARD))
    assert len(lead_ids) == 20
    assert len(set(lead_ids)) == 20


def test_dashboard_contains_no_backend_secret_names() -> None:
    page = _read(DASHBOARD)
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
    ):
        assert selector in css
    assert "@import" not in css
    assert "http://" not in css
    assert "https://" not in css


def test_home_page_links_to_dashboard() -> None:
    assert 'href="/dashboard"' in _read(APP / "page.tsx")


def test_pytest_discovers_dashboard_checks() -> None:
    assert "tests/frontend" in _read(ROOT / "pytest.ini")
