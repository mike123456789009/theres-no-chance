"""Persistence layer for positions, orders, and research artifacts."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, List
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    String,
    UniqueConstraint,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from ..config.models import DatabaseConfig
from ..data.models import Fill, Order, OrderSide, Position, ResearchRun

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1


class Base(DeclarativeBase):
    metadata = MetaData()


class LedgerMetadata(Base):
    __tablename__ = "ledger_metadata"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str | None] = mapped_column(String(256), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ResearchRunRecord(Base):
    __tablename__ = "research_runs"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    market_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    p_yes: Mapped[float] = mapped_column(Float, nullable=False)
    p_range: Mapped[list[float] | None] = mapped_column(JSONB, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    drivers: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    caveats: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    sources: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    citations: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    raw_json: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)


class OrderRecord(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    client_order_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    market_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide, name="order_side"), nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    fee_estimate: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class FillRecord(Base):
    __tablename__ = "fills"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(64), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    fee_actual: Mapped[float] = mapped_column(Float, nullable=False)
    filled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("order_id", "price_cents", "quantity", name="uq_fill_identity"),)


class PositionRecord(Base):
    __tablename__ = "positions"

    market_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide, name="position_side"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_price_cents: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CalibrationRecord(Base):
    __tablename__ = "fusion_calibration"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    predicted: Mapped[float] = mapped_column(Float, nullable=False)
    outcome: Mapped[int] = mapped_column(Integer, nullable=False)
    market_id: Mapped[str] = mapped_column(String(64), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RiskSnapshotRecord(Base):
    __tablename__ = "risk_snapshots"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    realized_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    equity: Mapped[float] = mapped_column(Float, nullable=False)
    margin_used: Mapped[float] = mapped_column(Float, nullable=False)
    drawdown: Mapped[float] = mapped_column(Float, nullable=False)
    exposures: Mapped[Dict[str, float] | None] = mapped_column(JSONB, nullable=True)


class LedgerRepository:
    """High-level async repository for ledger operations."""

    def __init__(self, session_factory: sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def upsert_research(self, run: ResearchRun) -> None:
        from sqlalchemy.dialects.postgresql import insert

        try:
            run_id = UUID(run.id)
        except ValueError as exc:  # pragma: no cover - input validation
            raise ValueError(f"ResearchRun id must be a valid UUID: {run.id}") from exc

        drivers = list(getattr(run, "drivers", []) or []) or None
        caveats = list(getattr(run, "caveats", []) or []) or None
        sources = list(run.sources) if run.sources else None
        citations = list(run.citations) if run.citations else None

        payload = {
            "id": run_id,
            "market_id": run.market_id,
            "created_at": run.ts,
            "p_yes": run.p_yes,
            "p_range": list(run.p_range),
            "confidence": run.confidence,
            "drivers": drivers,
            "caveats": caveats,
            "sources": sources,
            "citations": citations,
            "raw_json": run.raw_json,
            "model_version": run.model_version,
        }

        stmt = insert(ResearchRunRecord).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=[ResearchRunRecord.id],
            set_={
                "market_id": stmt.excluded.market_id,
                "created_at": stmt.excluded.created_at,
                "p_yes": stmt.excluded.p_yes,
                "p_range": stmt.excluded.p_range,
                "confidence": stmt.excluded.confidence,
                "drivers": stmt.excluded.drivers,
                "caveats": stmt.excluded.caveats,
                "sources": stmt.excluded.sources,
                "citations": stmt.excluded.citations,
                "raw_json": stmt.excluded.raw_json,
                "model_version": stmt.excluded.model_version,
                "archived_at": None,
            },
        )
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(stmt)

    async def upsert_order(self, order: Order) -> None:
        from sqlalchemy.dialects.postgresql import insert

        payload = {
            "id": order.id,
            "client_order_id": order.cl_id,
            "market_id": order.market_id,
            "side": order.side,
            "price_cents": order.price_cents,
            "quantity": order.quantity,
            "status": order.status,
            "fee_estimate": order.fee_estimate,
        }
        stmt = insert(OrderRecord).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=[OrderRecord.id],
            set_={
                "client_order_id": stmt.excluded.client_order_id,
                "market_id": stmt.excluded.market_id,
                "side": stmt.excluded.side,
                "price_cents": stmt.excluded.price_cents,
                "quantity": stmt.excluded.quantity,
                "status": stmt.excluded.status,
                "fee_estimate": stmt.excluded.fee_estimate,
            },
        )
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(stmt)

    async def record_fill(self, fill: Fill) -> None:
        from sqlalchemy.dialects.postgresql import insert

        filled_at = fill.filled_ts or datetime.now(timezone.utc)
        payload = {
            "id": fill.id,
            "order_id": fill.order_id,
            "price_cents": fill.price_cents,
            "quantity": fill.quantity,
            "fee_actual": fill.fee_actual,
            "filled_at": filled_at,
        }
        stmt = insert(FillRecord).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=[FillRecord.id],
            set_={
                "price_cents": stmt.excluded.price_cents,
                "quantity": stmt.excluded.quantity,
                "fee_actual": stmt.excluded.fee_actual,
                "filled_at": stmt.excluded.filled_at,
            },
        )
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(stmt)

    async def upsert_position(self, position: Position) -> None:
        from sqlalchemy.dialects.postgresql import insert

        payload = {
            "market_id": position.market_id,
            "side": position.side,
            "quantity": position.quantity,
            "avg_price_cents": position.avg_price_cents,
        }
        stmt = insert(PositionRecord).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=[PositionRecord.market_id, PositionRecord.side],
            set_={
                "quantity": stmt.excluded.quantity,
                "avg_price_cents": stmt.excluded.avg_price_cents,
            },
        )
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(stmt)

    async def archive_research_before(self, cutoff: datetime) -> int:
        async with self._session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    ResearchRunRecord.__table__.update()
                    .where(
                        ResearchRunRecord.created_at < cutoff,
                        ResearchRunRecord.archived_at.is_(None),
                    )
                    .values(archived_at=datetime.now(timezone.utc))
                )
                return result.rowcount or 0

    async def list_positions(self) -> list[Position]:
        async with self._session_factory() as session:
            result = await session.scalars(select(PositionRecord))
            rows = list(result)
            return [
                Position(
                    market_id=row.market_id,
                    side=row.side,
                    quantity=row.quantity,
                    avg_price_cents=row.avg_price_cents,
                )
                for row in rows
            ]

    async def record_calibration(
        self,
        predicted: float,
        outcome: int,
        market_id: str | None,
        model_version: str | None,
    ) -> None:
        from sqlalchemy.dialects.postgresql import insert

        payload = {
            "id": uuid4(),
            "predicted": float(predicted),
            "outcome": int(outcome),
            "market_id": market_id,
            "model_version": model_version,
        }
        stmt = insert(CalibrationRecord).values(**payload)
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(stmt)

    async def fetch_calibrations(self, limit: int | None = None) -> list[tuple[float, int]]:
        async with self._session_factory() as session:
            query = select(CalibrationRecord.predicted, CalibrationRecord.outcome).order_by(
                CalibrationRecord.recorded_at.desc()
            )
            if limit:
                query = query.limit(limit)
            result = await session.execute(query)
            return [(float(p), int(o)) for p, o in result.fetchall()]

    async def fetch_recent_research(self, limit: int = 10) -> List[Dict[str, Any]]:
        async with self._session_factory() as session:
            query = (
                select(ResearchRunRecord)
                .where(ResearchRunRecord.archived_at.is_(None))
                .order_by(ResearchRunRecord.created_at.desc())
                .limit(limit)
            )
            result = await session.execute(query)
            rows: List[Dict[str, Any]] = []
            for record in result.scalars():
                rows.append(
                    {
                        "id": str(record.id),
                        "market_id": record.market_id,
                        "ts": record.created_at.isoformat(),
                        "p_yes": record.p_yes,
                        "confidence": record.confidence or 0.0,
                        "drivers": record.drivers or [],
                        "caveats": record.caveats or [],
                        "sources": record.sources or [],
                    }
                )
            return rows

    async def record_risk_snapshot(
        self,
        *,
        timestamp: datetime,
        realized_pnl: float,
        unrealized_pnl: float,
        equity: float,
        margin_used: float,
        drawdown: float,
        exposures: Dict[str, float] | None,
    ) -> None:
        from sqlalchemy.dialects.postgresql import insert

        payload = {
            "id": uuid4(),
            "recorded_at": timestamp,
            "realized_pnl": float(realized_pnl),
            "unrealized_pnl": float(unrealized_pnl),
            "equity": float(equity),
            "margin_used": float(margin_used),
            "drawdown": float(drawdown),
            "exposures": exposures,
        }
        stmt = insert(RiskSnapshotRecord).values(**payload)
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(stmt)


class StateLedger:
    def __init__(self, cfg: DatabaseConfig):
        dsn = cfg.dsn_env
        uri = os.getenv(dsn)
        if not uri:
            raise RuntimeError(f"Database DSN env {dsn} not set")
        self._engine: AsyncEngine = create_async_engine(
            uri,
            pool_size=cfg.pool_max_size,
            pool_pre_ping=True,
        )
        self._sessionmaker = sessionmaker(
            self._engine, class_=AsyncSession, expire_on_commit=False
        )
        self._repo = LedgerRepository(self._sessionmaker)
        self._cfg = cfg

    async def init(self) -> None:
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(_ensure_schema_version)

    async def close(self) -> None:
        await self._engine.dispose()

    @property
    def repository(self) -> LedgerRepository:
        return self._repo

    async def record_research(self, run: ResearchRun) -> None:
        await self._repo.upsert_research(run)

    async def upsert_order(self, order: Order) -> None:
        await self._repo.upsert_order(order)

    async def record_fill(self, fill: Fill) -> None:
        await self._repo.record_fill(fill)

    async def upsert_position(self, position: Position) -> None:
        await self._repo.upsert_position(position)

    async def archive_research_before(self, cutoff: datetime) -> int:
        return await self._repo.archive_research_before(cutoff)

    async def record_calibration(
        self,
        predicted: float,
        outcome: int,
        market_id: str | None,
        model_version: str | None,
    ) -> None:
        await self._repo.record_calibration(predicted, outcome, market_id, model_version)

    async def fetch_calibrations(self, limit: int | None = None) -> list[tuple[float, int]]:
        return await self._repo.fetch_calibrations(limit)

    async def record_risk_snapshot(
        self,
        *,
        timestamp: datetime,
        realized_pnl: float,
        unrealized_pnl: float,
        equity: float,
        margin_used: float,
        drawdown: float,
        exposures: Dict[str, float] | None,
    ) -> None:
        await self._repo.record_risk_snapshot(
            timestamp=timestamp,
            realized_pnl=realized_pnl,
            unrealized_pnl=unrealized_pnl,
            equity=equity,
            margin_used=margin_used,
            drawdown=drawdown,
            exposures=exposures,
        )

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._sessionmaker() as session:  # pragma: no cover - helper for power users
            yield session


def _ensure_schema_version(connection) -> None:
    table = LedgerMetadata.__table__
    if not connection.dialect.has_table(connection, table.name):
        table.create(bind=connection)
    row = connection.execute(table.select().where(table.c.key == "schema_version")).fetchone()
    if row is None:
        connection.execute(
            table.insert().values(key="schema_version", value=str(SCHEMA_VERSION))
        )
    else:
        current = int(row.value)
        if current != SCHEMA_VERSION:
            logger.warning(
                "Ledger schema version mismatch detected (db=%s expected=%s)",
                current,
                SCHEMA_VERSION,
            )
