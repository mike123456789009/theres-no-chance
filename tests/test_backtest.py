from pathlib import Path

import pytest

from kalshi_autotrader.analysis.backtest import (
    HistoricalSample,
    load_scenario,
    replay_scenario,
    run_backtest,
    run_out_of_sample_validation,
)
from kalshi_autotrader.config.models import AppConfig
from kalshi_autotrader.services.quant_fusion import QuantFusionService


@pytest.mark.asyncio
async def test_backtest_basic():
    samples = [
        HistoricalSample(0.6, 0.5, 0.7, 0.52, 1),
        HistoricalSample(0.4, 0.5, 0.6, 0.48, 0),
        HistoricalSample(0.55, 0.5, 0.8, 0.5, 1),
    ]
    fusion = QuantFusionService()
    report = await run_backtest(samples, fusion, update_calibration=True)
    assert report.sample_count == 3
    assert 0 <= report.brier_score <= 1
    assert report.avg_confidence > 0


def _build_base_config(tmp_path) -> AppConfig:
    base_dict = {
        "secrets": {},
        "kalshi_api": {
            "environment": "demo",
            "rest_base_url": "https://example.com",
            "websocket_url": "wss://example.com/ws",
            "api_key_id": "demo",
            "dry_run": True,
        },
        "research": {
            "name": "primary",
            "provider": "openai",
            "model": "stub",
            "min_confidence": 0.1,
        },
        "risk": {
            "max_notional_per_market": 1000,
            "max_theme_exposure": 2000,
            "freeze_minutes": 1,
            "kelly_scale": 0.2,
            "ev_threshold_cents": 1,
            "max_contracts_per_trade": 100,
            "max_notional_per_trade": 500,
            "bankroll_dollars": 1000,
            "theme_limits": {},
            "market_theme_map": {},
            "max_daily_loss": 500,
            "stop_out_drawdown": 500,
            "cooldown_minutes": 1,
            "restricted_markets": [],
            "restricted_categories": [],
            "manual_override_markets": [],
            "margin_buffer": 0.2,
            "manual_override_file": str(tmp_path / "overrides.json"),
        },
        "execution": {
            "post_only_default": True,
            "reprice_tick": 1,
            "max_child_orders": 5,
            "max_cancels_per_min": 20,
        },
        "telemetry": {
            "enable_metrics": False,
            "metrics_endpoint": None,
            "metrics_port": 0,
            "enable_alerts": False,
            "alert_channels": [],
            "log_dir": str(tmp_path / "logs"),
            "audit_log_path": str(tmp_path / "audit.jsonl"),
            "analytics_dir": str(tmp_path / "analytics"),
        },
        "database": {
            "dsn_env": "AUTOTRADER_DATABASE_DSN",
            "pool_min_size": 1,
            "pool_max_size": 1,
        },
        "scanner": {
            "limit": 10,
            "include_keywords": ["test"],
            "exclude_prefixes": [],
            "exclude_keywords": [],
            "target_prefixes": [],
            "min_open_interest": 0,
            "min_volume_24h": 0,
            "fallback_top_n": 5,
            "heartbeat_seconds": 0,
            "delta_price_ticks": 1,
            "delta_quantity": 10,
            "snapshot_retention": 5,
        },
        "strategy": {
            "enabled": True,
            "packs": ["core"],
        },
    }
    return AppConfig.from_dict(base_dict)


def test_replay_scenario(tmp_path):
    base_cfg = _build_base_config(tmp_path)
    scenario = load_scenario(Path("config/backtests/baseline.yml"))
    metrics = replay_scenario(scenario, base_cfg, output_root=tmp_path)
    assert metrics.dataset_count > 0
    assert metrics.decisions_path.exists()
    assert metrics.summary_path.exists()


def test_oos_validation(tmp_path):
    base_cfg = _build_base_config(tmp_path)
    scenario = load_scenario(Path("config/backtests/baseline.yml"))
    report_path = run_out_of_sample_validation(scenario, base_cfg, output_root=tmp_path, window_size=2, step_size=1)
    assert report_path.exists()
