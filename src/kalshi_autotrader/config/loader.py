"""Configuration loader for Kalshi Autotrader."""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Optional

import yaml

from ..secrets import SecretManager, SecretResolutionError
from .models import AppConfig, SecretsConfig

ENV_PATTERN = re.compile(r"\$\{([^}:]+)(:-([^}]*))?\}")


def _resolve_env(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _resolve_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_env(item) for item in value]
    if isinstance(value, str):
        def _replace(match: re.Match[str]) -> str:
            var = match.group(1)
            default = match.group(3) or ""
            return os.getenv(var, default)

        resolved = ENV_PATTERN.sub(_replace, value)
        return resolved if resolved != "" else None
    return value


def _resolve_secrets(value: Any, manager: SecretManager) -> Any:
    if isinstance(value, dict):
        return {k: _resolve_secrets(v, manager) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve_secrets(item, manager) for item in value]
    if isinstance(value, str) and value.startswith("secret://"):
        return manager.resolve_reference(value)
    return value


def _default_config_path() -> Path:
    explicit = os.getenv("KALSHI_AUTOTRADER_CONFIG")
    if explicit:
        return Path(explicit)
    env_name = os.getenv("KALSHI_AUTOTRADER_ENV", "demo")
    return Path("config") / f"{env_name}.yml"


def load_app_config(path: Optional[Path] = None) -> AppConfig:
    """Load configuration from the provided path or default location."""

    config_path = Path(path) if path else _default_config_path()
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    resolved_env = _resolve_env(raw)

    secrets_cfg_dict = (resolved_env or {}).get("secrets") or {}
    secrets_cfg = SecretsConfig(**secrets_cfg_dict)
    secret_manager = SecretManager(secrets_cfg)

    try:
        resolved = _resolve_secrets(resolved_env, secret_manager)
    except SecretResolutionError as exc:
        raise RuntimeError(f"Failed to resolve secret: {exc}") from exc

    openai_cfg = (resolved or {}).get("openai") or {}
    if openai_cfg:
        research_cfg = resolved.setdefault("research", {})
        if openai_cfg.get("api_key"):
            research_cfg.setdefault("api_key", openai_cfg["api_key"])

    app_cfg = (resolved or {}).get("app") or {}
    if app_cfg:
        kalshi_cfg = resolved.setdefault("kalshi_api", {})
        if app_cfg.get("dry_run") is not None:
            kalshi_cfg["dry_run"] = app_cfg["dry_run"]
        if app_cfg.get("log_level"):
            resolved.setdefault("telemetry", {}).setdefault("log_level", app_cfg["log_level"])

    resolved.pop("openai", None)
    resolved.pop("app", None)

    return AppConfig.from_dict(resolved)
