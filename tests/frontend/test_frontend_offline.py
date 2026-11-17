from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps" / "web"
SRC = WEB / "src" / "app"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing {path.relative_to(ROOT)}"
    return path.read_text(encoding="utf-8")


def test_package_manifest_is_pinned_and_offline_friendly() -> None:
    data = json.loads(_read(WEB / "package.json"))
    assert data["name"] == "ai-lead-conversion-web"
    assert data["private"] is True
    for script in ("dev", "build", "start", "typecheck"):
        assert script in data["scripts"]

    assert (WEB / "package-lock.json").is_file()
    dependencies = data["dependencies"] | data["devDependencies"]
    assert set(dependencies) == {
        "next",
        "react",
        "react-dom",
        "@types/node",
        "@types/react",
        "@types/react-dom",
        "typescript",
    }
    assert all(re.fullmatch(r"\d+\.\d+\.\d+", version) for version in dependencies.values())


def test_app_router_shell_files_exist() -> None:
    for relative_path in (
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/globals.css",
        ".env.example",
        "vercel.json",
    ):
        assert (WEB / relative_path).is_file()

    vercel_config = json.loads(_read(WEB / "vercel.json"))
    assert vercel_config == {"framework": "nextjs"}


def test_typescript_config_is_strict() -> None:
    data = json.loads(_read(WEB / "tsconfig.json"))
    compiler_options = data["compilerOptions"]
    assert compiler_options["strict"] is True
    assert compiler_options["jsx"] == "preserve"
    assert compiler_options["noEmit"] is True
    assert compiler_options["moduleResolution"] == "bundler"


def test_health_page_uses_only_public_api_base_url() -> None:
    page = _read(SRC / "page.tsx")
    assert "NEXT_PUBLIC_API_BASE_URL" in page
    assert "/health" in page
    assert 'export const dynamic = "force-dynamic"' in page

    sources = "\n".join(
        _read(path)
        for path in SRC.rglob("*")
        if path.suffix in {".ts", ".tsx"}
    )
    env_references = set(re.findall(r"process\.env\.([A-Z0-9_]+)", sources))
    assert env_references == {"NEXT_PUBLIC_API_BASE_URL"}


def test_frontend_contains_no_backend_secret_names() -> None:
    forbidden = (
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "GROQ_API_KEY",
        "GEMINI_API_KEY",
        "DATABASE_URL",
    )
    files = [WEB / ".env.example", WEB / "package.json", *SRC.rglob("*.ts"), *SRC.rglob("*.tsx")]
    for path in files:
        text = _read(path)
        for name in forbidden:
            assert name not in text, f"{name} found in {path.relative_to(ROOT)}"


def test_env_example_is_placeholder_only() -> None:
    assert _read(WEB / ".env.example").strip() == "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000"


def test_stylesheet_is_offline() -> None:
    css = _read(SRC / "globals.css")
    assert "@import" not in css
    assert "http://" not in css
    assert "https://" not in css


def test_pytest_discovers_frontend_checks() -> None:
    assert "tests/frontend" in _read(ROOT / "pytest.ini")
