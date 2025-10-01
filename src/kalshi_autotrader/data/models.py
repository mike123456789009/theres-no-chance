"""Domain models for Kalshi Autotrader."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4
from enum import Enum
from typing import Dict, List, Optional, Sequence, Tuple


class OrderSide(str, Enum):
    YES = "yes"
    NO = "no"


@dataclass(slots=True)
class Market:
    ticker: str
    event_ticker: str
    title: str
    subtitle: Optional[str]
    close_ts: datetime
    open_ts: datetime
    rules_primary: str
    rules_secondary: Optional[str]
    category: Optional[str]
    tick_size: int
    yes_bid: Optional[int]
    yes_ask: Optional[int]
    no_bid: Optional[int]
    no_ask: Optional[int]
    volume: Optional[int] = None
    volume_24h: Optional[int] = None
    open_interest: Optional[int] = None


@dataclass(slots=True)
class Event:
    ticker: str
    title: str
    close_ts: datetime
    settlement_spec: Optional[str] = None
    theme: Optional[str] = None


@dataclass(slots=True)
class OrderBook:
    market_ticker: str
    ts: datetime
    yes_levels: List[Tuple[int, int]] = field(default_factory=list)
    no_levels: List[Tuple[int, int]] = field(default_factory=list)
    yes_levels_dollars: List[Tuple[float, int]] = field(default_factory=list)
    no_levels_dollars: List[Tuple[float, int]] = field(default_factory=list)

    @property
    def best_yes_bid(self) -> Optional[int]:
        if not self.yes_levels:
            return None
        return self.yes_levels[-1][0]

    @property
    def best_yes_ask(self) -> Optional[int]:
        if not self.yes_levels:
            return None
        return self.yes_levels[0][0]

    def implied_yes_probability(self) -> Optional[float]:
        if self.best_yes_bid is None:
            return None
        return max(min(self.best_yes_bid / 100.0, 0.99), 0.01)


@dataclass(slots=True)
class ResearchRun:
    id: str
    market_id: str
    ts: datetime
    sources: Sequence[Dict[str, str]]
    p_yes: float
    p_range: Sequence[float]
    confidence: float
    model_version: str
    raw_json: Dict[str, object]
    citations: Sequence[str]
    drivers: Sequence[str] = field(default_factory=tuple)
    caveats: Sequence[str] = field(default_factory=tuple)


@dataclass(slots=True)
class Decision:
    id: str
    market_id: str
    ts: datetime
    p_star: float
    ev: float
    reasons: Sequence[str]
    flags: Sequence[str]


@dataclass(slots=True)
class Order:
    id: str
    cl_id: str
    market_id: str
    side: OrderSide
    price_cents: int
    quantity: int
    status: str
    fee_estimate: float


@dataclass(slots=True)
class Fill:
    order_id: str
    price_cents: int
    quantity: int
    fee_actual: float
    filled_ts: datetime | None = None
    id: str = field(default_factory=lambda: str(uuid4()))


@dataclass(slots=True)
class Position:
    market_id: str
    side: OrderSide
    quantity: int
    avg_price_cents: float
