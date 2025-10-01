import asyncio
from datetime import datetime, timezone

import pytest

from kalshi_autotrader.config.models import ExecutionConfig
from kalshi_autotrader.data.models import OrderSide
from kalshi_autotrader.services.execution import ExecutionService, OrderIntent
from kalshi_autotrader.telemetry.metrics import TelemetryService, TelemetryConfig


class StubRestClient:
    def __init__(self):
        self.created = []
        self.cancelled = []

    async def create_order(self, payload):
        self.created.append(payload)
        return {"status": "submitted", "order": {"order_id": f"order-{len(self.created)}", "filled": 0}}

    async def cancel_order(self, order_id: str):
        self.cancelled.append(order_id)


@pytest.mark.asyncio
async def test_execution_pegged_order(monkeypatch):
    rest = StubRestClient()
    exec_cfg = ExecutionConfig(pegged_offset_ticks=1, iceberg_clip_size=50, max_child_orders=3)
    telemetry = TelemetryService(TelemetryConfig(enable_metrics=False, enable_alerts=False))
    service = ExecutionService(rest, exec_cfg, ledger=None, telemetry=telemetry)
    intent = OrderIntent(
        market_ticker="KXTEST",
        side=OrderSide.YES,
        price_cents=60,
        quantity=10,
        ev_per_contract=0.05,
        reason="test_order",
    )
    orderbook = {"best_yes_bid": 55, "best_no_bid": 45}
    await service.place_order(intent, pegged=True, iceberg=False, orderbook=orderbook)
    assert rest.created
    submitted = rest.created[0]
    assert submitted["price"] == 54  # pegged to best bid minus offset
    assert submitted["count"] == 10


@pytest.mark.asyncio
async def test_execution_iceberg(monkeypatch):
    rest = StubRestClient()
    exec_cfg = ExecutionConfig(iceberg_clip_size=20, max_child_orders=5)
    telemetry = TelemetryService(TelemetryConfig(enable_metrics=False, enable_alerts=False))
    service = ExecutionService(rest, exec_cfg, ledger=None, telemetry=telemetry)
    intent = OrderIntent(
        market_ticker="KXTEST",
        side=OrderSide.NO,
        price_cents=40,
        quantity=55,
        ev_per_contract=0.04,
        reason="iceberg_test",
    )
    await service.place_order(intent, pegged=False, iceberg=True, orderbook=None)
    assert len(rest.created) == 3
    counts = [payload["count"] for payload in rest.created]
    assert counts == [20, 20, 15]


@pytest.mark.asyncio
async def test_execution_fill_update(monkeypatch):
    rest = StubRestClient()
    exec_cfg = ExecutionConfig()
    telemetry = TelemetryService(TelemetryConfig(enable_metrics=False, enable_alerts=False))
    service = ExecutionService(rest, exec_cfg, ledger=None, telemetry=telemetry)
    intent = OrderIntent(
        market_ticker="KXTEST",
        side=OrderSide.YES,
        price_cents=50,
        quantity=10,
        ev_per_contract=0.01,
        reason="fill_test",
    )
    await service.place_order(intent, pegged=False, iceberg=False, orderbook=None)
    clid = list(service.get_open_orders().keys())[0]
    await service.apply_fill_event({"client_order_id": clid, "quantity": 5, "price": 50})
    order = service.get_open_orders()[clid]
    assert order.filled_quantity == 5
    assert order.remaining_quantity == 5
