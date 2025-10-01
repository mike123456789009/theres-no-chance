import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

try:  # pragma: no cover - optional dependency guard
    from testcontainers.postgres import PostgresContainer
    try:
        from docker.errors import DockerException
    except Exception:  # pragma: no cover
        DockerException = Exception  # type: ignore
except ImportError:  # pragma: no cover - fallback when testcontainers unavailable
    PostgresContainer = None  # type: ignore
    DockerException = Exception  # type: ignore

from kalshi_autotrader.config.models import DatabaseConfig
from kalshi_autotrader.data.models import Fill, Order, OrderSide, Position, ResearchRun
from kalshi_autotrader.services.state_ledger import (
    FillRecord,
    OrderRecord,
    PositionRecord,
    ResearchRunRecord,
    RiskSnapshotRecord,
    StateLedger,
)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def postgres_container():
    if PostgresContainer is None:  # pragma: no cover - conditional skip
        pytest.skip("testcontainers package not installed")
    try:
        container = PostgresContainer("postgres:15-alpine")
        container.start()
    except DockerException as exc:  # pragma: no cover - integration dependency
        pytest.skip(f"Docker unavailable: {exc}")
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture()
def database_config(monkeypatch: pytest.MonkeyPatch, postgres_container: PostgresContainer) -> DatabaseConfig:
    sync_url = postgres_container.get_connection_url()
    async_url = sync_url.replace("postgresql://", "postgresql+asyncpg://")
    monkeypatch.setenv("AUTOTRADER_DATABASE_DSN", async_url)
    return DatabaseConfig(dsn_env="AUTOTRADER_DATABASE_DSN", pool_min_size=1, pool_max_size=4)


@pytest.fixture()
async def ledger(database_config: DatabaseConfig) -> StateLedger:
    state_ledger = StateLedger(database_config)
    await state_ledger.init()
    try:
        yield state_ledger
    finally:
        await state_ledger.close()


@pytest.mark.asyncio
async def test_upsert_research_and_archive(ledger: StateLedger):
    run_id = str(uuid4())
    initial = ResearchRun(
        id=run_id,
        market_id="KXTEST",
        ts=datetime.now(timezone.utc) - timedelta(hours=1),
        sources=[
            {
                "title": "Macro backdrop",
                "url": "https://example.com/macro",
                "summary": "Macro drivers impacting pricing",
            },
            {
                "title": "Policy update",
                "url": "https://example.com/policy",
                "summary": "Policy discussion relevant to event",
            },
        ],
        p_yes=0.6,
        p_range=(0.5, 0.7),
        confidence=0.65,
        model_version="run-v1",
        raw_json={"mock": True},
        citations=["https://example.com/macro", "https://example.com/policy"],
        drivers=("Macro strength", "Policy easing"),
        caveats=("Volatility risk",),
    )
    await ledger.record_research(initial)

    updated = ResearchRun(
        id=run_id,
        market_id="KXTEST",
        ts=datetime.now(timezone.utc),
        sources=[
            {
                "title": "Macro backdrop",
                "url": "https://example.com/macro",
                "summary": "Macro drivers impacting pricing",
            }
        ],
        p_yes=0.72,
        p_range=(0.6, 0.8),
        confidence=0.75,
        model_version="run-v2",
        raw_json={"mock": False},
        citations=["https://example.com/macro"],
        drivers=("Macro strength",),
        caveats=("Volatility risk",),
    )
    await ledger.record_research(updated)

    async with ledger.session() as session:
        stored = await session.get(ResearchRunRecord, UUID(run_id))
        assert stored is not None
        assert pytest.approx(stored.p_yes, rel=1e-5) == 0.72
        assert stored.model_version == "run-v2"
        assert stored.sources[0]["url"] == "https://example.com/macro"
        assert stored.archived_at is None
        assert stored.drivers == ["Macro strength"]
        assert stored.caveats == ["Volatility risk"]

    archived = await ledger.archive_research_before(datetime.now(timezone.utc) + timedelta(seconds=1))
    assert archived == 1

    async with ledger.session() as session:
        stored = await session.get(ResearchRunRecord, UUID(run_id))
        assert stored.archived_at is not None


@pytest.mark.asyncio
async def test_order_fill_position_flow(ledger: StateLedger):
    order = Order(
        id=str(uuid4()),
        cl_id="order-cl-1",
        market_id="KXTEST",
        side=OrderSide.YES,
        price_cents=45,
        quantity=10,
        status="submitted",
        fee_estimate=0.12,
    )
    await ledger.upsert_order(order)

    order.status = "filled"
    order.quantity = 15
    await ledger.upsert_order(order)

    fill = Fill(
        order_id=order.id,
        price_cents=45,
        quantity=15,
        fee_actual=0.1,
        filled_ts=datetime.now(timezone.utc),
    )
    await ledger.record_fill(fill)

    position = Position(
        market_id="KXTEST",
        side=OrderSide.YES,
        quantity=15,
        avg_price_cents=45.0,
    )
    await ledger.upsert_position(position)

    position.quantity = 30
    position.avg_price_cents = 46.5
    await ledger.upsert_position(position)

    positions = await ledger.repository.list_positions()
    assert len(positions) == 1
    assert positions[0].quantity == 30
    assert positions[0].avg_price_cents == 46.5

    async with ledger.session() as session:
        stored_order = await session.get(OrderRecord, order.id)
        assert stored_order.status == "filled"
        assert stored_order.quantity == 15

        fill_rows = list(
            await session.scalars(select(FillRecord).where(FillRecord.order_id == order.id))
        )
        assert len(fill_rows) == 1
        assert fill_rows[0].fee_actual == pytest.approx(0.1)

        stored_position = await session.get(PositionRecord, (position.market_id, position.side))
        assert stored_position.quantity == 30


@pytest.mark.asyncio
async def test_calibration_records(ledger: StateLedger):
    await ledger.repository.record_calibration(0.6, 1, "KXTEST", "model-A")
    await ledger.repository.record_calibration(0.4, 0, "KXTEST", "model-A")

    records = await ledger.repository.fetch_calibrations()
    assert len(records) >= 2
    assert records[0][0] <= 1


@pytest.mark.asyncio
async def test_risk_snapshot_persistence(ledger: StateLedger):
    now = datetime.now(timezone.utc)
    await ledger.record_risk_snapshot(
        timestamp=now,
        realized_pnl=10.0,
        unrealized_pnl=-5.0,
        equity=2005.0,
        margin_used=500.0,
        drawdown=25.0,
        exposures={"macro": 1000.0},
    )

    async with ledger.session() as session:
        snapshots = list(await session.scalars(select(RiskSnapshotRecord)))
        assert snapshots
        record = snapshots[-1]
        assert record.realized_pnl == pytest.approx(10.0)
