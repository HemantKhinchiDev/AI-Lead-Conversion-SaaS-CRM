"""Environment-backed settings for the FastAPI service.

Secrets are stored as ``SecretStr`` so they are masked in ``repr``/``str`` and
never emitted in validation errors or logs. The offline stub is the default
AI provider, so the service needs no API key to boot.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, SecretStr, ValidationError, field_validator

ENV_FIELDS = (
    "APP_ENV",
    "LOG_LEVEL",
    "AI_PROVIDER",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
)

SECRET_FIELDS = frozenset(
    {
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "GROQ_API_KEY",
        "GEMINI_API_KEY",
    }
)

PLACEHOLDER_MARKERS = (
    "REPLACE_ME",
    "CHANGE_ME",
    "CHANGEME",
    "YOUR_",
    "YOUR-",
    "EXAMPLE",
    "DUMMY",
    "PLACEHOLDER",
    "<",
)

PROVIDER_KEY_FIELDS = {"groq": "GROQ_API_KEY", "gemini": "GEMINI_API_KEY"}


class ConfigError(ValueError):
    """Raised when environment configuration is missing or invalid."""


class Settings(BaseModel):
    app_env: Literal["development", "test", "production"]
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    ai_provider: Literal["stub", "groq", "gemini"] = "stub"
    supabase_url: AnyHttpUrl | None = None
    supabase_anon_key: SecretStr | None = None
    supabase_service_role_key: SecretStr | None = None
    groq_api_key: SecretStr | None = None
    gemini_api_key: SecretStr | None = None

    @field_validator("app_env", "ai_provider", mode="before")
    @classmethod
    def _normalise_lower(cls, value: object) -> object:
        return value.lower() if isinstance(value, str) else value

    @field_validator("log_level", mode="before")
    @classmethod
    def _normalise_upper(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value


def is_placeholder(value: str) -> bool:
    """Return True for empty values and documentation-style placeholders."""

    stripped = value.strip()
    if not stripped:
        return True
    upper = stripped.upper()
    return any(marker in upper for marker in PLACEHOLDER_MARKERS)


def _redact(message: str, secrets: set[str]) -> str:
    for secret in sorted(secrets, key=len, reverse=True):
        if secret:
            message = message.replace(secret, "***REDACTED***")
    return message


def _format_validation_error(exc: ValidationError, secrets: set[str]) -> str:
    details = []
    for error in exc.errors():
        location = error.get("loc") or ("config",)
        name = str(location[0]).upper()
        message = (
            "Missing required environment variable"
            if error.get("type") == "missing"
            else error["msg"]
        )
        details.append(f"{name}: {message}")
    return _redact(
        "Invalid environment configuration -> " + "; ".join(details),
        secrets,
    )


def _check_provider_key(settings: Settings) -> None:
    key_field = PROVIDER_KEY_FIELDS.get(settings.ai_provider)
    if key_field is None:
        return

    secret = getattr(settings, key_field.lower())
    if secret is None:
        raise ConfigError(
            f"Missing required environment variable: {key_field} "
            f"(required when AI_PROVIDER={settings.ai_provider})"
        )
    if is_placeholder(secret.get_secret_value()):
        raise ConfigError(
            f"{key_field} is still a placeholder; set a free-tier key "
            "or use AI_PROVIDER=stub"
        )


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """Build and validate settings from a mapping, defaulting to ``os.environ``.

    A ``ConfigError`` always names the offending variable and never contains
    a secret value.
    """

    source = os.environ if env is None else env
    values = {name.lower(): source[name] for name in ENV_FIELDS if name in source}
    secrets = {
        value for name, value in values.items() if name.upper() in SECRET_FIELDS and value
    }

    try:
        settings = Settings(**values)
    except ValidationError as exc:
        raise ConfigError(_format_validation_error(exc, secrets)) from None

    _check_provider_key(settings)
    return settings
