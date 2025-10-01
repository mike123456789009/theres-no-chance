"""Strategy pack abstractions for modular overlays."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Protocol, Sequence

from ..config.models import (
    EventSuppressorStrategyConfig,
    MomentumStrategyConfig,
    PairTradeArbStrategyConfig,
    StrategyConfig,
)
from ..data.models import Market


@dataclass(slots=True)
class StrategyDecision:
    """Result produced by a strategy overlay."""

    name: str
    ev_adjust: float = 0.0
    liquidity_multiplier: float = 1.0
    size_multiplier: float = 1.0
    price_offset_ticks: int = 0
    post_only_override: Optional[bool] = None
    block_trade: bool = False
    reason: Optional[str] = None
    tags: tuple[str, ...] = ()


@dataclass(slots=True)
class StrategyContext:
    """Context passed to execution strategies."""

    market: Mapping[str, Any]
    fusion: Any
    microstructure: Any
    bankroll: float
    best_yes_bid: Optional[int]
    price_cents: int
    post_only: bool
    base_ev: float
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def ticker(self) -> str:
        return str(self.market.get("ticker", ""))


class ExecutionStrategy(Protocol):
    """Protocol for execution-time overlays."""

    name: str

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        ...


class ScannerStrategy(Protocol):
    """Protocol for scanner-time market filters or annotators."""

    name: str

    def filter_markets(
        self,
        markets: Sequence[Market],
        metadata: Dict[str, Dict[str, Any]],
    ) -> List[Market]:
        ...


@dataclass(slots=True)
class StrategyPack:
    """Container for scanner and execution strategies."""

    enabled: bool = True
    execution_strategies: List[ExecutionStrategy] = field(default_factory=list)
    scanner_strategies: List[ScannerStrategy] = field(default_factory=list)

    def apply_scan_filters(self, markets: Sequence[Market]) -> tuple[List[Market], Dict[str, Dict[str, Any]]]:
        if not self.enabled or not markets:
            return list(markets), {}
        metadata: Dict[str, Dict[str, Any]] = {m.ticker: {} for m in markets}
        filtered: List[Market] = list(markets)
        for strategy in self.scanner_strategies:
            filtered = strategy.filter_markets(filtered, metadata)
            if not filtered:
                break
        metadata = {m.ticker: metadata.get(m.ticker, {}) for m in filtered}
        return filtered, metadata

    def evaluate_execution(self, context: StrategyContext) -> List[StrategyDecision]:
        if not self.enabled or not self.execution_strategies:
            return []
        decisions: List[StrategyDecision] = []
        for strategy in self.execution_strategies:
            decision = strategy.evaluate(context)
            if decision is None:
                continue
            decisions.append(decision)
            if decision.block_trade:
                break
        return decisions


class MomentumOverlayStrategy(ExecutionStrategy):
    name = "momentum_overlay"

    def __init__(self, cfg: MomentumStrategyConfig) -> None:
        self._cfg = cfg

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        micro = context.microstructure
        if not micro:
            return None
        momentum = getattr(micro, "momentum", 0.0)
        if abs(momentum) < self._cfg.threshold:
            return None
        if momentum > 0:
            return StrategyDecision(
                name=self.name,
                ev_adjust=self._cfg.ev_boost,
                liquidity_multiplier=1 + self._cfg.liquidity_boost,
                size_multiplier=1 + self._cfg.size_boost,
                reason=f"momentum {momentum:.4f}",
            )
        return StrategyDecision(
            name=self.name,
            ev_adjust=-self._cfg.negative_ev_penalty,
            liquidity_multiplier=max(0.2, 1 - self._cfg.negative_liquidity_penalty),
            size_multiplier=max(0.1, 1 - self._cfg.negative_size_penalty),
            reason=f"negative momentum {momentum:.4f}",
        )


class EventSuppressorStrategy(ExecutionStrategy, ScannerStrategy):
    name = "event_suppressor"

    def __init__(self, cfg: EventSuppressorStrategyConfig) -> None:
        self._cfg = cfg
        self._keywords = {kw.lower() for kw in cfg.suppressed_keywords}
        self._categories = {cat.lower() for cat in cfg.category_blocks}

    def filter_markets(
        self,
        markets: Sequence[Market],
        metadata: Dict[str, Dict[str, Any]],
    ) -> List[Market]:
        if not markets:
            return []
        now = datetime.now(timezone.utc)
        filtered: List[Market] = []
        for market in markets:
            entry = metadata.setdefault(market.ticker, {})
            text = " ".join(filter(None, [market.title, market.subtitle or ""])).lower()
            if self._keywords and any(kw in text for kw in self._keywords):
                entry["event_suppressed"] = "keyword"
                continue
            category = (market.category or "").lower()
            if category and category in self._categories:
                entry["event_suppressed"] = "category"
                continue
            minutes_to_close = (market.close_ts - now).total_seconds() / 60.0
            entry["minutes_to_close"] = minutes_to_close
            filtered.append(market)
        return filtered

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        metadata = context.metadata or {}
        if metadata.get("event_suppressed"):
            return StrategyDecision(
                name=self.name,
                block_trade=True,
                reason=str(metadata["event_suppressed"]),
            )
        minutes_to_close = metadata.get("minutes_to_close")
        close_raw = context.market.get("close_ts")
        if minutes_to_close is None and close_raw:
            try:
                close_ts = datetime.fromisoformat(str(close_raw))
                if close_ts.tzinfo is None:
                    close_ts = close_ts.replace(tzinfo=timezone.utc)
                minutes_to_close = (close_ts - datetime.now(timezone.utc)).total_seconds() / 60.0
            except ValueError:
                minutes_to_close = None
        if minutes_to_close is not None and minutes_to_close <= self._cfg.cooldown_minutes:
            return StrategyDecision(
                name=self.name,
                block_trade=True,
                reason=f"close in {minutes_to_close:.1f}m",
            )
        confidence = metadata.get("research_confidence")
        if confidence is not None and confidence < self._cfg.confidence_floor:
            return StrategyDecision(
                name=self.name,
                size_multiplier=max(0.0, self._cfg.low_confidence_size_multiplier),
                reason=f"low confidence {confidence:.2f}",
            )
        return None


class PairTradeArbStrategy(ExecutionStrategy, ScannerStrategy):
    name = "pair_trade_arb"

    def __init__(self, cfg: PairTradeArbStrategyConfig) -> None:
        self._cfg = cfg
        self._group_map: Dict[str, str] = {}
        for group, tickers in cfg.groups.items():
            for ticker in tickers:
                self._group_map[ticker] = group

    def filter_markets(
        self,
        markets: Sequence[Market],
        metadata: Dict[str, Dict[str, Any]],
    ) -> List[Market]:
        if not markets or not self._group_map:
            return list(markets)
        ticker_map = {market.ticker: market for market in markets}
        group_presence: Dict[str, List[str]] = {}
        for ticker, group in self._group_map.items():
            group_presence.setdefault(group, [])
            if ticker in ticker_map:
                group_presence[group].append(ticker)
        filtered: List[Market] = []
        for market in markets:
            entry = metadata.setdefault(market.ticker, {})
            group = self._group_map.get(market.ticker)
            if not group:
                filtered.append(market)
                continue
            expected = set(self._cfg.groups.get(group, []))
            present = set(group_presence.get(group, []))
            if present and present != expected:
                entry["pair_incomplete"] = True
                continue
            prices = {ticker: (ticker_map[ticker].yes_bid or 0) / 100.0 for ticker in expected if ticker in ticker_map}
            if prices:
                entry["pair_prices"] = prices
            entry["pair_group"] = group
            filtered.append(market)
        return filtered

    def evaluate(self, context: StrategyContext) -> Optional[StrategyDecision]:
        metadata = context.metadata or {}
        if metadata.get("pair_incomplete"):
            return StrategyDecision(
                name=self.name,
                block_trade=True,
                reason="pair missing counterpart",
            )
        prices = metadata.get("pair_prices")
        if not prices:
            return None
        ticker = context.ticker
        current_price = prices.get(ticker)
        if current_price is None:
            return None
        others = [price for key, price in prices.items() if key != ticker]
        if not others:
            return None
        avg_other = sum(others) / len(others)
        spread = current_price - avg_other
        threshold = self._cfg.spread_threshold
        if spread > threshold:
            reduction = max(0.1, 1 - self._cfg.size_penalty)
            return StrategyDecision(
                name=self.name,
                ev_adjust=-spread / 2,
                liquidity_multiplier=max(0.2, reduction),
                size_multiplier=reduction,
                reason=f"rich vs pair {spread:.3f}",
            )
        if spread < -threshold:
            return StrategyDecision(
                name=self.name,
                ev_adjust=self._cfg.ev_boost,
                liquidity_multiplier=1 + self._cfg.liquidity_boost,
                size_multiplier=1 + (1 - self._cfg.size_penalty),
                reason=f"cheap vs pair {spread:.3f}",
            )
        return None


def build_strategy_pack(cfg: StrategyConfig | None) -> StrategyPack:
    if cfg is None or not cfg.enabled:
        return StrategyPack(enabled=False)
    execution: List[ExecutionStrategy] = []
    scanner: List[ScannerStrategy] = []
    packs = {pack.lower() for pack in cfg.packs}
    enable_core = not packs or "core" in packs
    if enable_core and cfg.momentum_overlay.enabled:
        execution.append(MomentumOverlayStrategy(cfg.momentum_overlay))
    if enable_core and cfg.event_suppressor.enabled:
        event_strategy = EventSuppressorStrategy(cfg.event_suppressor)
        execution.append(event_strategy)
        scanner.append(event_strategy)
    if enable_core and cfg.pair_trade_arb.enabled:
        pair_strategy = PairTradeArbStrategy(cfg.pair_trade_arb)
        execution.append(pair_strategy)
        scanner.append(pair_strategy)
    return StrategyPack(
        enabled=bool(execution or scanner),
        execution_strategies=execution,
        scanner_strategies=scanner,
    )
