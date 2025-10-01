import os
from pathlib import Path

import pytest

from kalshi_autotrader.config.loader import load_app_config


def test_load_app_config(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv("KALSHI_API_KEY_ID", "demo-key")
    monkeypatch.setenv("OPENAI_API_KEY", "demo-openai")
    monkeypatch.setenv("KALSHI_PRIVATE_KEY_PEM", "-----BEGIN RSA PRIVATE KEY-----\nDEMO\n-----END RSA PRIVATE KEY-----")

    cfg_path = tmp_path / "config.yml"
    cfg_path.write_text(
        """
secrets:
  provider: env

kalshi_api:
  environment: demo
  rest_base_url: "https://demo-api.kalshi.co/trade-api/v2"
  websocket_url: "wss://demo-api.kalshi.co/trade-api/v2/ws"
  api_key_id: "secret://env/KALSHI_API_KEY_ID"
  private_key: "secret://env/KALSHI_PRIVATE_KEY_PEM"
  dry_run: true
  request_timeout_seconds: 10
  max_retries: 3

research:
  provider: openai
  model: gpt-4.1-mini
  temperature: 0.1
  min_sources: 0
  approved_domains: []
  request_timeout_seconds: 600
  api_key: "secret://env/OPENAI_API_KEY"
  reasoning_effort: medium
  max_output_tokens: 2048
  verbosity: medium

risk:
  max_notional_per_market: 1000
  max_theme_exposure: 5000
  freeze_minutes: 5
  kelly_scale: 0.2
  ev_threshold_cents: 1
  max_contracts_per_trade: 500
  max_notional_per_trade: 500.0
  bankroll_dollars: 1000.0

execution:
  post_only_default: true
  reprice_tick: 1
  max_child_orders: 3
  max_cancels_per_min: 10

telemetry:
  enable_metrics: true
  metrics_endpoint: null
  enable_alerts: true
  alert_channels: []
  log_level: info

database:
  dsn_env: DATABASE_URL
  pool_min_size: 1
  pool_max_size: 5

scanner:
  limit: 100
  include_keywords:
    - "cpi"
    - "inflation"
    - "trump"
  exclude_prefixes:
    - "KXQUICKSETTLE"
  exclude_keywords:
    - "press"
  target_prefixes:
    - "KXUS"
  min_open_interest: 3
  min_volume_24h: 0
  fallback_top_n: 5
""",
        encoding="utf-8",
    )
    config = load_app_config(cfg_path)
    assert config.kalshi_api.environment == "demo"
    assert config.execution.max_child_orders == 3
    assert config.scanner.min_open_interest == 3
    assert config.telemetry.log_level == "INFO"


def test_optional_secret_reference(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.delenv("UNSET_SECRET", raising=False)

    cfg_path = tmp_path / "config.yml"
    cfg_path.write_text(
        """
secrets:
  provider: env

kalshi_api:
  environment: demo
  rest_base_url: "https://demo-api.kalshi.co/trade-api/v2"
  websocket_url: "wss://demo-api.kalshi.co/trade-api/v2/ws"
  api_key_id: "secret://env/KALSHI_API_KEY_ID?optional=true&default=demo"
  private_key: "secret://env/UNSET_SECRET?optional=true"
  dry_run: true
  request_timeout_seconds: 10
  max_retries: 3

research:
  provider: openai
  model: gpt-4.1-mini
  temperature: 0.1
  min_sources: 0
  approved_domains: []
  request_timeout_seconds: 600
  api_key: "secret://env/OPENAI_API_KEY?optional=true"
  reasoning_effort: medium
  max_output_tokens: 2048
  verbosity: medium

risk:
  max_notional_per_market: 1000
  max_theme_exposure: 5000
  freeze_minutes: 5
  kelly_scale: 0.2
  ev_threshold_cents: 1
  max_contracts_per_trade: 500
  max_notional_per_trade: 500.0
  bankroll_dollars: 1000.0

execution:
  post_only_default: true
  reprice_tick: 1
  max_child_orders: 3
  max_cancels_per_min: 10

telemetry:
  enable_metrics: true
  metrics_endpoint: null
  enable_alerts: true
  alert_channels: []

database:
  dsn_env: DATABASE_URL
  pool_min_size: 1
  pool_max_size: 5

scanner:
  limit: 100
  include_keywords:
    - "cpi"
    - "inflation"
    - "trump"
  exclude_prefixes:
    - "KXQUICKSETTLE"
  exclude_keywords:
    - "press"
  target_prefixes:
    - "KXUS"
  min_open_interest: 3
  min_volume_24h: 0
  fallback_top_n: 5
""",
        encoding="utf-8",
    )
    config = load_app_config(cfg_path)
    assert config.kalshi_api.api_key_id == "demo"
    assert config.kalshi_api.private_key is None


def test_load_missing_file():
    with pytest.raises(FileNotFoundError):
        load_app_config(Path("missing.yml"))
