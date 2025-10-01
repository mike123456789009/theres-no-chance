from datetime import datetime, timedelta, timezone

import pytest

from kalshi_autotrader.config.models import RiskConfig
from kalshi_autotrader.services.risk_limits import RiskManager


@pytest.fixture()
def risk_cfg(tmp_path) -> RiskConfig:
    return RiskConfig(
        max_notional_per_market=500.0,
        max_theme_exposure=1000.0,
        theme_limits={"energy": 600.0},
        market_theme_map={"KXOIL": "energy"},
        max_daily_loss=200.0,
        stop_out_drawdown=400.0,
        cooldown_minutes=5,
        restricted_markets=["KXBLOCK"],
        manual_override_markets=[],
        restricted_categories=["prohibited"],
        bankroll_dollars=1000.0,
        manual_override_file=str(tmp_path / "overrides.json"),
    )


def _market(ticker: str, category: str = "energy", minutes: int = 120) -> dict:
    close = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return {
        "ticker": ticker,
        "category": category,
        "close_ts": close.isoformat(),
    }


def test_theme_limit_enforced(risk_cfg: RiskConfig):
    rm = RiskManager(risk_cfg)
    market = _market("KXOIL")
    result = rm.evaluate_trade(market, proposed_notional=300.0)
    assert result.allowed
    rm.record_trade(market, 300.0)

    blocked = rm.evaluate_trade(market, proposed_notional=400.0)
    assert not blocked.allowed
    assert "exposure" in (blocked.reason or "").lower()


def test_manual_override_required(risk_cfg: RiskConfig):
    rm = RiskManager(risk_cfg)
    market = _market("KXBLOCK")
    blocked = rm.evaluate_trade(market, proposed_notional=100.0)
    assert not blocked.allowed
    rm.grant_manual_override("KXBLOCK")
    allowed = rm.evaluate_trade(market, proposed_notional=100.0)
    assert allowed.allowed


def test_stop_out_triggers_cooldown(risk_cfg: RiskConfig):
    rm = RiskManager(risk_cfg)
    rm.adjust_realized_pnl(-500.0)
    market = _market("KXTEST")
    blocked = rm.evaluate_trade(market, proposed_notional=50.0)
    assert not blocked.allowed
    assert "cooldown" in (blocked.reason or "").lower()
    # After cooldown expiry trades allowed again
    rm.adjust_realized_pnl(400.0)
    rm._state.cooldown_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    future = datetime.now(timezone.utc) + timedelta(minutes=risk_cfg.cooldown_minutes + 1)
    allowed = rm.evaluate_trade(market, proposed_notional=50.0, now=future)
    assert allowed.allowed


class StubLedger:
    def __init__(self):
        self.snapshots = []

    async def record_risk_snapshot(
        self,
        *,
        timestamp,
        realized_pnl,
        unrealized_pnl,
        equity,
        margin_used,
        drawdown,
        exposures,
    ) -> None:
        self.snapshots.append(
            {
                "timestamp": timestamp,
                "realized_pnl": realized_pnl,
                "unrealized_pnl": unrealized_pnl,
                "equity": equity,
                "margin_used": margin_used,
                "drawdown": drawdown,
                "exposures": exposures,
            }
        )


@pytest.mark.asyncio
async def test_persist_snapshot_records_theme_exposure(risk_cfg: RiskConfig):
    ledger = StubLedger()
    rm = RiskManager(risk_cfg, ledger=ledger)
    market = _market("KXOIL")
    rm.record_trade(market, 150.0)

    await rm.persist_snapshot()

    assert ledger.snapshots
    exposures = ledger.snapshots[-1]["exposures"]
    assert exposures.get("energy") == pytest.approx(150.0)
