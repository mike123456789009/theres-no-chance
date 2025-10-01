import asyncio
import copy
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import pytest

from kalshi_autotrader.config.models import AppConfig
from kalshi_autotrader.data.models import Market
from kalshi_autotrader.runner import TradingApp
from kalshi_autotrader.services.research_agent import ResearchResult
from kalshi_autotrader.data.models import OrderBook, OrderSide


class StubScanner:
    def __init__(self):
        now = datetime.now(timezone.utc)
        self._markets: List[Market] = [
            Market(
                ticker="KXTEST",
                event_ticker="EVT",
                title="Test Market",
                subtitle="",
                close_ts=now + timedelta(hours=2),
                open_ts=now,
                rules_primary="1",
                rules_secondary=None,
                category="macro",
                tick_size=1,
                yes_bid=40,
                yes_ask=45,
                no_bid=55,
                no_ask=60,
                volume=1000,
                volume_24h=200,
                open_interest=500,
            )
        ]
        self._orderbook = OrderBook(
            market_ticker="KXTEST",
            ts=now,
            yes_levels=[(44, 20), (42, 50)],
            no_levels=[(56, 30), (58, 40)],
        )
        self._strategy_metadata: Dict[str, Dict[str, Any]] = {"KXTEST": {}}

    async def list_markets(self, limit=None):
        return self._markets

    async def get_orderbook(self, ticker: str) -> OrderBook:
        return self._orderbook

    async def stream_orderbook(self, ticker: str):  # pragma: no cover - unused in test
        yield self._orderbook

    def cached_orderbook(self, ticker: str) -> OrderBook:
        return self._orderbook

    def get_strategy_metadata(self, ticker: str) -> Dict[str, Any]:
        return self._strategy_metadata.get(ticker, {})

    def set_strategy_metadata(self, metadata: Dict[str, Dict[str, Any]]) -> None:
        self._strategy_metadata = metadata


class StubResearch:
    def __init__(self, confidence: float = 0.8, tags: tuple[str, ...] = ("trend_confirmed",), interval: tuple[float, float] = (0.6, 0.7)) -> None:
        self.confidence = confidence
        self.tags = tags
        self.interval = interval

    async def run_research(self, market: Dict[str, Any], deadline: datetime) -> ResearchResult:
        return ResearchResult(
            p_yes=0.65,
            p_range=self.interval,
            drivers=("Driver",),
            caveats=("Caveat",),
            sources=(
                {
                    "title": "Source",
                    "url": "https://example.com",
                    "summary": "",
                    "tags": ["news"],
                },
            ),
            citations=(),
            confidence=self.confidence,
            confidence_interval=self.interval,
            scenario_tags=self.tags,
            raw={"p_yes": 0.65, "scenario_tags": list(self.tags)},
        )


class StubExecution:
    def __init__(self):
        self.orders: List[Dict[str, Any]] = []

    async def place_order(self, intent, **kwargs):
        self.orders.append({"intent": intent, **kwargs})
        return {"status": "submitted", "intent": intent}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "strategy_overrides,metadata_override,research_conf,expect_order",
    [
        ({}, {}, 0.8, True),
        ({}, {"KXTEST": {"event_suppressed": "keyword"}}, 0.8, False),
        ({"momentum_overlay": {"enabled": False}}, {}, 0.6, True),
    ],
)
async def test_trading_app_dry_run(monkeypatch, tmp_path, strategy_overrides, metadata_override, research_conf, expect_order):
    monkeypatch.setenv("KALSHI_API_KEY_ID", "demo")
    monkeypatch.delenv("AUTOTRADER_DATABASE_DSN", raising=False)

    base_cfg = {
        "secrets": {},
        "kalshi_api": {
            "environment": "demo",
            "rest_base_url": "https://example.com",
            "websocket_url": "wss://example.com/ws",
            "api_key_id_env": "KALSHI_API_KEY_ID",
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
    }

    cfg_dict = copy.deepcopy(base_cfg)
    cfg_dict["strategy"] = {"enabled": True, **strategy_overrides}

    cfg = AppConfig.from_dict(cfg_dict)
    app = TradingApp(cfg)
    scanner = StubScanner()
    app._scanner = scanner
    app._research = StubResearch(confidence=research_conf)
    app._execution = StubExecution()
    if metadata_override:
        scanner.set_strategy_metadata(metadata_override)

    results = await app.run_once()
    decision_statuses = [entry.get("decision", {}).get("status") for entry in results if entry.get("decision")]
    if expect_order:
        assert any(status == "submitted" for status in decision_statuses)
        assert app._execution.orders
    else:
        assert not app._execution.orders
    # Strategy EV telemetry should align with whether overlays fired
