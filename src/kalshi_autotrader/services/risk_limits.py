"""Risk management utilities."""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, TYPE_CHECKING

from ..config.models import RiskConfig
from ..data.models import OrderSide, Position
from ..telemetry.metrics import TelemetryService

if TYPE_CHECKING:  # pragma: no cover
    from ..services.state_ledger import StateLedger

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RiskSnapshot:
    timestamp: datetime
    realized_pnl: float
    unrealized_pnl: float
    equity: float
    margin_used: float
    drawdown: float
    exposures: Dict[str, float]
    alerts: List[str] = field(default_factory=list)


@dataclass(slots=True)
class RiskCheckResult:
    allowed: bool
    reason: Optional[str] = None
    alerts: List[str] = field(default_factory=list)


@dataclass(slots=True)
class RiskState:
    notional_by_market: Dict[str, float]
    notional_by_theme: Dict[str, float]
    realized_pnl: float
    unrealized_pnl: float
    margin_used: float
    daily_realized: float
    day: date
    equity_peak: float
    equity_trough: float
    cooldown_until: Optional[datetime]


class RiskManager:
    def __init__(
        self,
        cfg: RiskConfig,
        telemetry: TelemetryService | None = None,
        ledger: "StateLedger | None" = None,
    ) -> None:
        self._cfg = cfg
        today = datetime.now(timezone.utc).date()
        self._state = RiskState(
            notional_by_market=defaultdict(float),
            notional_by_theme=defaultdict(float),
            realized_pnl=0.0,
            unrealized_pnl=0.0,
            margin_used=0.0,
            daily_realized=0.0,
            day=today,
            equity_peak=cfg.bankroll_dollars,
            equity_trough=cfg.bankroll_dollars,
            cooldown_until=None,
        )
        self._telemetry = telemetry
        self._ledger = ledger
        self._override_path: Optional[Path] = (
            Path(cfg.manual_override_file).expanduser() if cfg.manual_override_file else None
        )
        self._override_mtime: Optional[float] = None
        self._overrides: set[str] = set(cfg.manual_override_markets)
        self._load_overrides()

    # -------------------- Compliance & Limit Checks --------------------
    def evaluate_trade(
        self,
        market: Dict[str, Any],
        proposed_notional: float,
        *,
        now: Optional[datetime] = None,
    ) -> RiskCheckResult:
        now = now or datetime.now(timezone.utc)
        self._reset_daily_if_needed(now)

        ticker = market.get("ticker", "")
        theme = self._resolve_theme(market)

        self._load_overrides()

        if ticker in set(self._cfg.restricted_markets) and ticker not in self._overrides:
            return self._reject("Market requires manual override", ticker)

        category = (market.get("category") or "").lower()
        if category and category in {cat.lower() for cat in self._cfg.restricted_categories}:
            return self._reject("Market category restricted", ticker)

        close_ts_raw = market.get("close_ts")
        if close_ts_raw:
            close_ts = datetime.fromisoformat(close_ts_raw) if isinstance(close_ts_raw, str) else close_ts_raw
            if isinstance(close_ts, datetime) and self.within_freeze_window(close_ts):
                return self._reject("Market inside freeze window", ticker)

        if proposed_notional > self._cfg.max_notional_per_trade:
            return self._reject("Proposed notional exceeds per-trade cap", ticker)

        if self._state.cooldown_until and now < self._state.cooldown_until:
            remaining = int((self._state.cooldown_until - now).total_seconds() // 60) + 1
            return self._reject(f"Cooldown active ({remaining} min remaining)", ticker)

        if self._state.daily_realized <= -self._cfg.max_daily_loss:
            return self._reject("Daily loss limit reached", ticker)

        drawdown = self.current_drawdown()
        if drawdown >= self._cfg.stop_out_drawdown:
            return self._reject("Stop-out drawdown reached", ticker)

        if not self.check_market_limit(ticker, proposed_notional):
            return self._reject("Per-market exposure limit exceeded", ticker)

        if not self.check_theme_limit(theme, proposed_notional):
            return self._reject(f"Theme exposure limit exceeded ({theme})", ticker)

        return RiskCheckResult(True)

    def check_market_limit(self, market_ticker: str, proposed_notional: float) -> bool:
        current = self._state.notional_by_market[market_ticker]
        allowed = current + proposed_notional <= self._cfg.max_notional_per_market
        logger.debug(
            "Risk market=%s proposed=%.2f current=%.2f allowed=%s",
            market_ticker,
            proposed_notional,
            current,
            allowed,
        )
        return allowed

    def check_theme_limit(self, theme: str, proposed_notional: float) -> bool:
        limit = self._cfg.theme_limits.get(theme, self._cfg.max_theme_exposure)
        current = self._state.notional_by_theme[theme]
        return current + proposed_notional <= limit

    def within_freeze_window(self, event_close: datetime) -> bool:
        delta = event_close - datetime.now(timezone.utc)
        return delta.total_seconds() <= self._cfg.freeze_minutes * 60

    # -------------------- State Updates --------------------
    def record_trade(self, market: Dict[str, Any], notional: float) -> None:
        ticker = market.get("ticker", "")
        theme = self._resolve_theme(market)
        self._state.notional_by_market[ticker] += abs(notional)
        self._state.notional_by_theme[theme] += abs(notional)
        self._state.margin_used += abs(notional) * (1 + self._cfg.margin_buffer)

    def grant_manual_override(self, market_ticker: str) -> None:
        self._overrides.add(market_ticker)
        self._persist_overrides()

    def revoke_manual_override(self, market_ticker: str) -> None:
        self._overrides.discard(market_ticker)
        self._persist_overrides()

    def adjust_realized_pnl(self, delta: float, *, now: Optional[datetime] = None) -> None:
        now = now or datetime.now(timezone.utc)
        self._reset_daily_if_needed(now)
        self._state.realized_pnl += delta
        self._state.daily_realized += delta
        self._update_equity_stats(self.current_equity())

    async def update_portfolio(
        self,
        positions: Sequence[Position],
        mark_prices: Dict[str, float],
        *,
        now: Optional[datetime] = None,
    ) -> RiskSnapshot:
        notional_market: Dict[str, float] = defaultdict(float)
        notional_theme: Dict[str, float] = defaultdict(float)
        unrealized = 0.0
        margin = 0.0

        for pos in positions:
            ticker = pos.market_id
            price = mark_prices.get(ticker)
            if price is None:
                continue
            avg_price = pos.avg_price_cents / 100.0
            direction = 1 if pos.side == OrderSide.YES else -1
            qty = pos.quantity
            notional = abs(price * qty)
            margin += notional * (1 + self._cfg.margin_buffer)
            theme = self._cfg.market_theme_map.get(ticker, "default")
            notional_market[ticker] += notional
            notional_theme[theme] += notional
            unrealized += (price - avg_price) * direction * qty

        self._state.notional_by_market = defaultdict(float, notional_market)
        self._state.notional_by_theme = defaultdict(float, notional_theme)
        self._state.unrealized_pnl = unrealized
        self._state.margin_used = margin
        self._update_equity_stats(self.current_equity())

        snapshot = self.snapshot(now=now)
        await self._persist_snapshot(snapshot)
        return snapshot

    # -------------------- Derived Metrics --------------------
    def current_equity(self) -> float:
        return self._cfg.bankroll_dollars + self._state.realized_pnl + self._state.unrealized_pnl

    def current_drawdown(self) -> float:
        equity = self.current_equity()
        return max(0.0, self._state.equity_peak - equity)

    def snapshot(self, *, now: Optional[datetime] = None) -> RiskSnapshot:
        now = now or datetime.now(timezone.utc)
        drawdown = self.current_drawdown()
        exposures = dict(self._state.notional_by_theme)
        return RiskSnapshot(
            timestamp=now,
            realized_pnl=self._state.realized_pnl,
            unrealized_pnl=self._state.unrealized_pnl,
            equity=self.current_equity(),
            margin_used=self._state.margin_used,
            drawdown=drawdown,
            exposures=exposures,
        )

    async def persist_snapshot(self) -> None:
        snapshot = self.snapshot()
        if self._telemetry:
            total_pnl = snapshot.realized_pnl + snapshot.unrealized_pnl
            self._telemetry.emit_metric(
                "shadow_pnl_dollars",
                total_pnl,
                {"metric": "equity"},
            )
            self._telemetry.emit_metric(
                "margin_used",
                snapshot.margin_used,
                {"metric": "margin"},
            )
        await self._persist_snapshot(snapshot)

    # -------------------- Helpers --------------------
    def _resolve_theme(self, market: Dict[str, Any]) -> str:
        ticker = market.get("ticker")
        if ticker and ticker in self._cfg.market_theme_map:
            return self._cfg.market_theme_map[ticker]
        event = market.get("event_ticker")
        if event and event in self._cfg.market_theme_map:
            return self._cfg.market_theme_map[event]
        category = market.get("category")
        if category:
            return category
        return "default"

    def _reset_daily_if_needed(self, now: datetime) -> None:
        if now.date() != self._state.day:
            self._state.day = now.date()
            self._state.daily_realized = 0.0

    def _update_equity_stats(self, equity: float) -> None:
        if equity > self._state.equity_peak:
            self._state.equity_peak = equity
        if equity < self._state.equity_trough:
            self._state.equity_trough = equity
        drawdown = self._state.equity_peak - equity
        if drawdown >= self._cfg.stop_out_drawdown:
            if not self._state.cooldown_until:
                self._state.cooldown_until = datetime.now(timezone.utc) + timedelta(minutes=self._cfg.cooldown_minutes)
                self._fire_alert("Stop-out triggered; entering cooldown")
        else:
            if self._state.cooldown_until and datetime.now(timezone.utc) >= self._state.cooldown_until:
                self._state.cooldown_until = None

    def _reject(self, message: str, ticker: str) -> RiskCheckResult:
        self._fire_alert(f"Trade blocked for {ticker}: {message}")
        return RiskCheckResult(False, reason=message, alerts=[message])

    async def _persist_snapshot(self, snapshot: RiskSnapshot) -> None:
        if not self._ledger:
            return
        try:
            await self._ledger.record_risk_snapshot(
                timestamp=snapshot.timestamp,
                realized_pnl=snapshot.realized_pnl,
                unrealized_pnl=snapshot.unrealized_pnl,
                equity=snapshot.equity,
                margin_used=snapshot.margin_used,
                drawdown=snapshot.drawdown,
                exposures=snapshot.exposures,
            )
        except Exception as exc:  # pragma: no cover - avoid tripping critical path
            logger.warning("Failed to persist risk snapshot: %s", exc)

    def _load_overrides(self) -> None:
        if not self._override_path:
            return
        try:
            mtime = self._override_path.stat().st_mtime
        except FileNotFoundError:
            if self._override_mtime is not None:
                self._override_mtime = None
                self._overrides.clear()
            return
        if self._override_mtime and mtime <= self._override_mtime:
            return
        try:
            data = json.loads(self._override_path.read_text(encoding="utf-8"))
            markets = data.get("markets") if isinstance(data, dict) else data
            if isinstance(markets, list):
                self._overrides = {str(t).strip() for t in markets if str(t).strip()}
            self._override_mtime = mtime
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to load overrides from %s: %s", self._override_path, exc)

    def _persist_overrides(self) -> None:
        if not self._override_path:
            return
        payload = {"markets": sorted(self._overrides)}
        try:
            self._override_path.parent.mkdir(parents=True, exist_ok=True)
            self._override_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            self._override_mtime = self._override_path.stat().st_mtime
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to persist overrides to %s: %s", self._override_path, exc)

    def _fire_alert(self, message: str) -> None:
        logger.warning("RISK ALERT: %s", message)
        if self._telemetry:
            self._telemetry.alert(message)
