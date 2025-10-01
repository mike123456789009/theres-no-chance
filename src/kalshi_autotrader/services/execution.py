"""Execution and order routing logic."""
from __future__ import annotations

import asyncio
import logging
import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple
from uuid import uuid4

from ..config.models import ExecutionConfig
from ..data.models import Fill, Order, OrderSide, Position
from ..infrastructure.kalshi_client import KalshiRestClient
from ..services.state_ledger import StateLedger
from ..telemetry.metrics import TelemetryService
from .edge_engine import OrderIntent

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class OutstandingOrder:
    cl_id: str
    order_id: Optional[str]
    market_ticker: str
    side: OrderSide
    price_cents: int
    total_quantity: int
    remaining_quantity: int
    filled_quantity: int = 0
    iceberg_parent: Optional[str] = None
    pegged: bool = False


@dataclass(slots=True)
class PositionSummary:
    quantity: int = 0
    avg_price_cents: float = 0.0


class ExecutionService:
    def __init__(
        self,
        client: KalshiRestClient,
        config: ExecutionConfig,
        ledger: StateLedger | None = None,
        telemetry: TelemetryService | None = None,
    ) -> None:
        self._client = client
        self._cfg = config
        self._ledger = ledger
        self._telemetry = telemetry
        self._open_orders: Dict[str, OutstandingOrder] = {}
        self._positions: Dict[str, PositionSummary] = defaultdict(PositionSummary)
        self._cancel_timestamps: Deque[datetime] = deque()

    # ------------------------------------------------------------------
    async def place_order(
        self,
        intent: OrderIntent,
        *,
        pegged: bool = True,
        iceberg: bool = True,
        orderbook: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        await self._prevent_self_trade(intent)

        if iceberg and intent.quantity > self._cfg.iceberg_clip_size:
            return await self._place_iceberg(intent, pegged=pegged, orderbook=orderbook)
        return await self._submit_child_order(intent, pegged=pegged, orderbook=orderbook)

    async def cancel_order(self, client_order_id: str) -> None:
        if not self._can_cancel():
            logger.debug("Cancel throttled for %s", client_order_id)
            return
        order = self._open_orders.get(client_order_id)
        if not order:
            logger.warning("Order %s not found for cancellation", client_order_id)
            return
        if not order.order_id:
            logger.info("No remote order id for %s; skipping cancel", client_order_id)
            return
        await self._client.cancel_order(order.order_id)
        self._cancel_timestamps.append(datetime.now(timezone.utc))
        self._open_orders.pop(client_order_id, None)

    async def replace_order(self, client_order_id: str, new_price_cents: int) -> None:
        existing = self._open_orders.get(client_order_id)
        if not existing:
            logger.warning("Cannot replace missing order %s", client_order_id)
            return
        intent = OrderIntent(
            market_ticker=existing.market_ticker,
            side=existing.side,
            price_cents=new_price_cents,
            quantity=existing.remaining_quantity,
            ev_per_contract=0.0,
            reason=f"repriced_{client_order_id}",
        )
        await self.cancel_order(client_order_id)
        await asyncio.sleep(0)
        await self._submit_child_order(intent, pegged=False)

    # ------------------------------------------------------------------
    async def _submit_child_order(
        self,
        intent: OrderIntent,
        *,
        pegged: bool,
        orderbook: Optional[Dict[str, Any]] = None,
        parent: Optional[str] = None,
    ) -> Dict[str, str]:
        client_order_id = self._generate_client_id(intent, parent)
        price_cents = self._apply_pegged_price(intent.price_cents, intent.side, orderbook if pegged else None)

        payload = {
            "ticker": intent.market_ticker,
            "action": "buy" if intent.side == OrderSide.YES else "sell",
            "side": intent.side.value,
            "type": "limit",
            "count": intent.quantity,
            "price": price_cents,
            "client_order_id": client_order_id,
        }
        payload = {k: v for k, v in payload.items() if v is not None}
        logger.info("Submitting order %s", payload)
        response = await self._client.create_order(payload)

        order_id = response.get("order", {}).get("order_id")
        filled = int(response.get("order", {}).get("filled", 0))
        remaining = max(intent.quantity - filled, 0)

        outstanding = OutstandingOrder(
            cl_id=client_order_id,
            order_id=order_id,
            market_ticker=intent.market_ticker,
            side=intent.side,
            price_cents=price_cents,
            total_quantity=intent.quantity,
            remaining_quantity=remaining,
            filled_quantity=filled,
            iceberg_parent=parent,
            pegged=pegged,
        )
        self._open_orders[client_order_id] = outstanding

        await self._persist_order(outstanding)

        if self._telemetry and intent.quantity:
            fill_ratio = filled / float(intent.quantity)
            self._telemetry.emit_metric(
                "fill_ratio",
                fill_ratio,
                {"market": intent.market_ticker, "side": intent.side.value},
            )
        if pegged and remaining > 0:
            asyncio.create_task(self._monitor_pegged_order(outstanding))

        status = response.get("status", "submitted")
        if self._telemetry:
            self._telemetry.count_order(status)
        return {"client_order_id": client_order_id, "status": status}

    async def _place_iceberg(
        self,
        intent: OrderIntent,
        *,
        pegged: bool,
        orderbook: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        remaining = intent.quantity
        results: List[Dict[str, str]] = []
        child_index = 0
        while remaining > 0 and child_index < self._cfg.max_child_orders:
            clip = min(remaining, self._cfg.iceberg_clip_size)
            child_intent = OrderIntent(
                market_ticker=intent.market_ticker,
                side=intent.side,
                price_cents=intent.price_cents,
                quantity=clip,
                ev_per_contract=intent.ev_per_contract,
                reason=f"iceberg_{intent.market_ticker}_{child_index}",
            )
            result = await self._submit_child_order(
                child_intent,
                pegged=pegged,
                orderbook=orderbook,
                parent=intent.reason,
            )
            results.append(result)
            remaining -= clip
            if remaining > 0:
                await asyncio.sleep(0.1)
            child_index += 1
        return results[-1] if results else {"status": "skipped"}

    async def _monitor_pegged_order(self, order: OutstandingOrder) -> None:
        try:
            while order.cl_id in self._open_orders and self._open_orders[order.cl_id].remaining_quantity > 0:
                await asyncio.sleep(1)
                # In a full implementation we would read the latest orderbook snapshot.
                # Here we simply reprice based on the configured tick spacing.
                new_price = max(1, order.price_cents - self._cfg.reprice_tick)
                if new_price != order.price_cents:
                    await self.replace_order(order.cl_id, new_price)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Pegged monitor failed for %s: %s", order.cl_id, exc)

    async def apply_fill_event(self, fill: Dict[str, Any]) -> None:
        cl_id = fill.get("client_order_id")
        if not cl_id:
            return
        order = self._open_orders.get(cl_id)
        if not order:
            return
        qty = int(fill.get("quantity", 0))
        price_cents = int(fill.get("price", order.price_cents))
        order.filled_quantity += qty
        order.remaining_quantity = max(order.remaining_quantity - qty, 0)
        fee = self._compute_fee(price_cents)
        await self._persist_fill(order, qty, price_cents, fee)
        self._update_position(order.market_ticker, order.side, qty, price_cents)
        if order.remaining_quantity <= 0:
            self._open_orders.pop(cl_id, None)

    async def reconcile_orders(self, open_orders: Iterable[Dict[str, Any]]) -> None:
        active_ids = {item.get("client_order_id") for item in open_orders if item.get("client_order_id")}
        for client_id in list(self._open_orders.keys()):
            if client_id not in active_ids:
                logger.info("Removing stale order %s via reconciliation", client_id)
                self._open_orders.pop(client_id, None)

    def get_open_orders(self) -> Dict[str, OutstandingOrder]:
        return dict(self._open_orders)

    # ------------------------------------------------------------------
    async def _prevent_self_trade(self, intent: OrderIntent) -> None:
        for order in list(self._open_orders.values()):
            if order.market_ticker != intent.market_ticker:
                continue
            if order.side == intent.side:
                continue
            if not self._can_cancel():
                continue
            await self.cancel_order(order.cl_id)

    def _apply_pegged_price(self, price_cents: int, side: OrderSide, orderbook: Optional[Dict[str, Any]]) -> int:
        if not orderbook:
            return price_cents
        if side == OrderSide.YES:
            reference = orderbook.get("best_yes_bid")
            if reference is not None:
                price_cents = reference
        else:
            reference = orderbook.get("best_no_bid")
            if reference is not None:
                price_cents = reference
        price_cents = max(1, price_cents - self._cfg.pegged_offset_ticks)
        return price_cents

    def _generate_client_id(self, intent: OrderIntent, parent: Optional[str]) -> str:
        suffix = uuid4().hex[:8]
        base = parent or intent.reason or "edge_order"
        client_id = f"{base}_{suffix}"[:32]
        return client_id

    def _can_cancel(self) -> bool:
        now = datetime.now(timezone.utc)
        window = timedelta(seconds=self._cfg.cancel_window_seconds)
        while self._cancel_timestamps and now - self._cancel_timestamps[0] > window:
            self._cancel_timestamps.popleft()
        return len(self._cancel_timestamps) < self._cfg.max_cancels_per_min

    async def _persist_order(self, order: OutstandingOrder) -> None:
        if not self._ledger:
            return
        order_record = Order(
            id=order.order_id or order.cl_id,
            cl_id=order.cl_id,
            market_id=order.market_ticker,
            side=order.side,
            price_cents=order.price_cents,
            quantity=order.total_quantity,
            status="open" if order.remaining_quantity else "filled",
            fee_estimate=self._estimate_fee(order.price_cents),
        )
        try:
            await self._ledger.upsert_order(order_record)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to persist order %s: %s", order.cl_id, exc)

    async def _persist_fill(
        self,
        order: OutstandingOrder,
        quantity: int,
        price_cents: int,
        fee: float,
    ) -> None:
        if not self._ledger:
            return
        fill_record = Fill(
            order_id=order.order_id or order.cl_id,
            price_cents=price_cents,
            quantity=quantity,
            fee_actual=fee,
            filled_ts=datetime.now(timezone.utc),
        )
        try:
            await self._ledger.record_fill(fill_record)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to persist fill for %s: %s", order.cl_id, exc)

    def _update_position(self, market: str, side: OrderSide, qty: int, price_cents: int) -> None:
        summary = self._positions[market]
        direction = 1 if side == OrderSide.YES else -1
        net_qty = summary.quantity + direction * qty
        if net_qty == 0:
            summary.quantity = 0
            summary.avg_price_cents = 0.0
        elif summary.quantity == 0:
            summary.quantity = direction * qty
            summary.avg_price_cents = price_cents
        else:
            total_cost = summary.avg_price_cents * abs(summary.quantity) + price_cents * qty
            summary.quantity = net_qty
            summary.avg_price_cents = total_cost / abs(summary.quantity)
        if self._ledger:
            position = Position(
                market_id=market,
                side=OrderSide.YES if summary.quantity >= 0 else OrderSide.NO,
                quantity=abs(summary.quantity),
                avg_price_cents=summary.avg_price_cents,
            )
            asyncio.create_task(self._ledger.upsert_position(position))

    def _estimate_fee(self, price_cents: int) -> float:
        price = price_cents / 100.0
        return math.ceil(price * (1 - price) * self._cfg.maker_fee_rate * 100) / 100.0

    def _compute_fee(self, price_cents: int) -> float:
        price = price_cents / 100.0
        return round(self._cfg.taker_fee_rate * price * (1 - price), 4)
