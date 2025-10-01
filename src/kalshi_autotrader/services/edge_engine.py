"""Edge computation, decision rules, and order sizing."""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Mapping

from ..config.models import ExecutionConfig, RiskConfig
from ..data.models import OrderBook, OrderSide
from .quant_fusion import FusionOutput
from .strategy_pack import StrategyContext, StrategyPack

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class OrderIntent:
    market_ticker: str
    side: OrderSide
    price_cents: int
    quantity: int
    ev_per_contract: float
    reason: str
    strategy_signals: Dict[str, Dict[str, float]] = field(default_factory=dict)


@dataclass(slots=True)
class MicrostructureSignals:
    spread_cents: int
    yes_depth: int
    no_depth: int
    imbalance: float
    momentum: float
    penalty: float
    liquidity_factor: float


class EdgeEngineService:
    """Apply EV gates and produce executable order intents."""

    def __init__(
        self,
        risk_cfg: RiskConfig,
        exec_cfg: ExecutionConfig,
        strategy_pack: StrategyPack | None = None,
    ):
        self._risk_cfg = risk_cfg
        self._exec_cfg = exec_cfg
        self._last_mid: Dict[str, float] = {}
        self._strategy_pack = strategy_pack or StrategyPack(enabled=False)

    @staticmethod
    def taker_fee_dollars(price_dollars: float, contracts: int = 1) -> float:
        raw = 0.07 * contracts * price_dollars * (1 - price_dollars)
        cents = math.ceil(raw * 100)
        return cents / 100.0

    @staticmethod
    def maker_fee_dollars(price_dollars: float, contracts: int = 1, maker_rate: float = 0.02) -> float:
        raw = maker_rate * contracts * price_dollars * (1 - price_dollars)
        cents = math.ceil(raw * 100)
        return cents / 100.0

    def compute_ev(
        self,
        price_cents: int,
        fusion: FusionOutput,
        contracts: int = 1,
        taker: bool = True,
        liquidity_factor: float = 1.0,
    ) -> float:
        price_dollars = price_cents / 100.0
        fee = self.taker_fee_dollars(price_dollars, contracts) if taker else self.maker_fee_dollars(price_dollars, contracts)
        p_star = fusion.p_star
        ev = p_star * (1 - price_dollars) - (1 - p_star) * price_dollars - fee
        ev *= max(0.2, min(1.0, liquidity_factor))
        logger.debug("EV calc -> price: %s, p*: %.4f, fee: %.4f, ev: %.4f", price_dollars, p_star, fee, ev)
        return ev

    def max_pay_price(self, fusion: FusionOutput, taker: bool = True) -> int:
        """Return max cents to pay given target EV threshold."""
        threshold = self._risk_cfg.ev_threshold_cents / 100.0
        low, high = 1, 99
        best = low
        while low <= high:
            mid = (low + high) // 2
            ev = self.compute_ev(mid, fusion, taker=taker)
            if ev >= threshold:
                best = mid
                low = mid + 1
            else:
                high = mid - 1
        return best

    def kelly_size(self, price_cents: int, fusion: FusionOutput, bankroll: float, side: OrderSide) -> int:
        price = price_cents / 100.0
        edge = fusion.p_star - price if side == OrderSide.YES else (1 - fusion.p_star) - (1 - price)
        denominator = 1 - price if side == OrderSide.YES else price
        if denominator <= 0 or edge <= 0:
            return 0
        f = min(self._risk_cfg.kelly_scale * edge / denominator, 1.0)
        position_value = bankroll * f
        price_dollars = price_cents / 100.0
        contracts = int(position_value / price_dollars) if price_dollars else 0
        return max(0, contracts)

    def build_intent(
        self,
        market: Mapping[str, Any],
        fusion: FusionOutput,
        best_yes_bid: Optional[int],
        bankroll: float,
        microstructure: MicrostructureSignals | None = None,
        strategy_metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[OrderIntent]:
        if best_yes_bid is None:
            return None
        post_only = self._exec_cfg.post_only_default
        price_cents = max(best_yes_bid + (0 if post_only else 1), 1)
        liquidity_factor = microstructure.liquidity_factor if microstructure else 1.0
        base_ev = self.compute_ev(
            price_cents,
            fusion,
            contracts=1,
            taker=not post_only,
            liquidity_factor=liquidity_factor,
        )

        metadata = dict(strategy_metadata or {})
        context = StrategyContext(
            market=market,
            fusion=fusion,
            microstructure=microstructure,
            bankroll=bankroll,
            best_yes_bid=best_yes_bid,
            price_cents=price_cents,
            post_only=post_only,
            base_ev=base_ev,
            metadata=metadata,
        )
        decisions = self._strategy_pack.evaluate_execution(context)
        price_offset = 0
        ev_adjust = 0.0
        quantity_multiplier = max(0.2, min(1.5, getattr(fusion, "confidence_weight", 1.0)))
        strategy_notes: list[str] = []
        strategy_signals: Dict[str, Dict[str, float]] = {}
        for decision in decisions:
            if decision.block_trade:
                logger.debug("Strategy %s blocked trade: %s", decision.name, decision.reason)
                return None
            if decision.post_only_override is not None:
                post_only = decision.post_only_override
            price_offset += decision.price_offset_ticks
            liquidity_factor *= decision.liquidity_multiplier
            ev_adjust += decision.ev_adjust
            quantity_multiplier *= decision.size_multiplier
            if decision.reason:
                note = f"{decision.name}:{decision.reason}"
            else:
                note = decision.name
            if decision.tags:
                note += f" ({','.join(decision.tags)})"
            strategy_notes.append(note)
            strategy_signals[decision.name] = {
                "ev_adjust": decision.ev_adjust,
                "liquidity_multiplier": decision.liquidity_multiplier,
                "size_multiplier": decision.size_multiplier,
            }

        price_cents = max(min(99, best_yes_bid + (0 if post_only else 1) + price_offset), 1)
        liquidity_factor = max(0.1, min(1.5, liquidity_factor))
        ev = self.compute_ev(
            price_cents,
            fusion,
            contracts=1,
            taker=not post_only,
            liquidity_factor=liquidity_factor,
        )
        ev += ev_adjust
        if ev < (self._risk_cfg.ev_threshold_cents / 100.0):
            logger.debug("EV %.4f below threshold", ev)
            return None
        quantity = self.kelly_size(price_cents, fusion, bankroll, OrderSide.YES)
        if microstructure:
            quantity = int(quantity * microstructure.liquidity_factor)
        if quantity_multiplier != 1.0:
            quantity = int(quantity * quantity_multiplier)
        quantity = self._apply_trade_caps(price_cents, quantity)
        if quantity == 0:
            return None
        reason = f"p*= {fusion.p_star:.2%}, z {fusion.z_score:.2f}, liq {liquidity_factor:.2f}, cf {getattr(fusion, 'confidence_weight', 1.0):.2f}"
        if strategy_notes:
            reason += "; strategies=" + " | ".join(strategy_notes)
        if isinstance(market, Mapping):
            market_ticker = str(market.get("ticker"))
        elif hasattr(market, "ticker"):
            market_ticker = str(getattr(market, "ticker"))
        else:
            market_ticker = str(market)
        return OrderIntent(
            market_ticker=market_ticker,
            side=OrderSide.YES,
            price_cents=price_cents,
            quantity=quantity,
            ev_per_contract=ev,
            reason=reason,
            strategy_signals=strategy_signals,
        )

    def _apply_trade_caps(self, price_cents: int, quantity: int) -> int:
        if quantity <= 0:
            return 0
        capped = min(quantity, self._risk_cfg.max_contracts_per_trade)
        if price_cents <= 0 or self._risk_cfg.max_notional_per_trade <= 0:
            return capped
        max_by_notional = int(self._risk_cfg.max_notional_per_trade * 100 // price_cents)
        if max_by_notional <= 0:
            return 0
        return min(capped, max_by_notional)

    def analyze_microstructure(self, market_ticker: str, orderbook: OrderBook) -> MicrostructureSignals:
        yes_levels = orderbook.yes_levels
        no_levels = orderbook.no_levels

        best_yes_bid = yes_levels[-1][0] if yes_levels else None
        best_yes_ask = yes_levels[0][0] if yes_levels else None
        spread_cents = 0
        if best_yes_bid is not None and best_yes_ask is not None:
            spread_cents = max(0, best_yes_ask - best_yes_bid)

        yes_depth = sum(level[1] for level in yes_levels[-3:]) if yes_levels else 0
        no_depth = sum(level[1] for level in no_levels[-3:]) if no_levels else 0
        total_depth = yes_depth + no_depth
        imbalance = 0.0
        if total_depth > 0:
            imbalance = (yes_depth - no_depth) / total_depth

        mid_price = None
        if best_yes_bid is not None and best_yes_ask is not None:
            mid_price = (best_yes_ask + best_yes_bid) / 2.0

        last_mid = self._last_mid.get(market_ticker)
        momentum = 0.0
        if mid_price is not None and last_mid is not None:
            momentum = (mid_price - last_mid) / 100.0
        if mid_price is not None:
            self._last_mid[market_ticker] = mid_price

        penalty = 0.0
        if spread_cents > 2:
            penalty += (spread_cents - 2) / 200.0
        if total_depth < 50:
            penalty += 0.05
        if momentum < 0:
            penalty += min(0.05, abs(momentum))

        liquidity_factor = 1.0
        liquidity_factor *= min(1.0, max(0.3, yes_depth / 200.0 if yes_depth else 0.3))
        if spread_cents > 0:
            liquidity_factor *= max(0.4, 1 - spread_cents / 20.0)
        liquidity_factor = max(0.2, min(1.0, liquidity_factor))

        penalty = max(0.0, min(0.3, penalty))
        return MicrostructureSignals(
            spread_cents=spread_cents,
            yes_depth=yes_depth,
            no_depth=no_depth,
            imbalance=imbalance,
            momentum=momentum,
            penalty=penalty,
            liquidity_factor=liquidity_factor,
        )
