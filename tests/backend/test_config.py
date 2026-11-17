import logging
from pathlib import Path

import pytest

from app import core
from app.core.config import ConfigError, is_placeholder, load_settings

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_FILE = ROOT / "services" / "api" / ".env.example"
GITIGNORE_FILE = ROOT / ".gitignore"
SECRET_KEYS = (
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
)


def _read_example() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in EXAMPLE_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def test_example_file_contains_only_placeholders() -> None:
    values = _read_example()

    assert values["APP_ENV"] == "development"
    assert values["AI_PROVIDER"] == "stub"
    assert is_placeholder(values["SUPABASE_URL"])
    for key in SECRET_KEYS:
        assert is_placeholder(values[key])


def test_example_values_load_without_real_secrets() -> None:
    settings = load_settings(_read_example())

    assert settings.app_env == "development"
    assert settings.ai_provider == "stub"
    assert settings.supabase_url is not None
    for key in SECRET_KEYS:
        assert is_placeholder(getattr(settings, key.lower()).get_secret_value())


def test_missing_required_variable_fails_clearly() -> None:
    with pytest.raises(ConfigError, match="APP_ENV") as exc_info:
        load_settings({})

    assert "Missing required environment variable" in str(exc_info.value)


def test_invalid_environment_fails_clearly() -> None:
    with pytest.raises(ConfigError) as exc_info:
        load_settings({"APP_ENV": "prod"})

    message = str(exc_info.value)
    assert "APP_ENV" in message
    assert "development" in message


def test_removed_provider_is_rejected() -> None:
    with pytest.raises(ConfigError) as exc_info:
        load_settings({"APP_ENV": "development", "AI_PROVIDER": "openrouter"})

    message = str(exc_info.value)
    assert "AI_PROVIDER" in message
    assert "stub" in message


def test_selected_provider_requires_its_key() -> None:
    with pytest.raises(ConfigError, match="GROQ_API_KEY"):
        load_settings({"APP_ENV": "development", "AI_PROVIDER": "groq"})


def test_placeholder_provider_key_is_rejected() -> None:
    with pytest.raises(ConfigError, match="placeholder"):
        load_settings(
            {
                "APP_ENV": "development",
                "AI_PROVIDER": "groq",
                "GROQ_API_KEY": "REPLACE_ME_GROQ_API_KEY",
            }
        )


def test_valid_provider_key_is_masked() -> None:
    secret = "gsk_freeTierKeyValue123"
    settings = load_settings(
        {
            "APP_ENV": "development",
            "AI_PROVIDER": "groq",
            "GROQ_API_KEY": secret,
        }
    )

    assert settings.groq_api_key is not None
    assert settings.groq_api_key.get_secret_value() == secret
    assert secret not in repr(settings)
    assert secret not in str(settings)


def test_secret_values_are_collected_for_redaction(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "gsk_redactMe123"
    captured: dict[str, set[str]] = {}
    original = core.config._format_validation_error

    def capture(exc: object, secrets: set[str]) -> str:
        captured["secrets"] = secrets
        return original(exc, secrets)

    monkeypatch.setattr(core.config, "_format_validation_error", capture)
    with pytest.raises(ConfigError):
        load_settings({"APP_ENV": "prod", "GROQ_API_KEY": secret})

    assert secret in captured["secrets"]


def test_secret_is_not_logged_or_leaked_in_errors(caplog: pytest.LogCaptureFixture) -> None:
    secret = "gsk_superSecretValue456"
    with caplog.at_level(logging.DEBUG):
        with pytest.raises(ConfigError) as exc_info:
            load_settings({"APP_ENV": "prod", "GROQ_API_KEY": secret})

    assert secret not in caplog.text
    assert secret not in str(exc_info.value)


def test_invalid_supabase_url_fails_clearly() -> None:
    with pytest.raises(ConfigError, match="SUPABASE_URL"):
        load_settings({"APP_ENV": "development", "SUPABASE_URL": "not-a-url"})


def test_enum_values_are_case_insensitive() -> None:
    settings = load_settings(
        {"APP_ENV": "Development", "LOG_LEVEL": "debug", "AI_PROVIDER": "STUB"}
    )

    assert settings.app_env == "development"
    assert settings.log_level == "DEBUG"
    assert settings.ai_provider == "stub"


def test_unrelated_environment_variables_are_ignored() -> None:
    settings = load_settings({"APP_ENV": "test", "SOME_OTHER_TOOL": "value"})

    assert settings.app_env == "test"


def test_env_files_are_ignored_by_git() -> None:
    patterns = {
        line.strip()
        for line in GITIGNORE_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    }

    assert ".env" in patterns
    assert ".env.*" in patterns
    assert "!.env.example" in patterns
