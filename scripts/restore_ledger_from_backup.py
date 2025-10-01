#!/usr/bin/env python3
"""Restore ledger tables from a JSON backup artifact."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from sqlalchemy import delete, insert
from sqlalchemy.sql.sqltypes import DateTime

from kalshi_autotrader.config.models import DatabaseConfig
from kalshi_autotrader.services.state_ledger import (
    SCHEMA_VERSION,
    StateLedger,
    ResearchRunRecord,
    OrderRecord,
    FillRecord,
    PositionRecord,
    RiskSnapshotRecord,
    LedgerMetadata,
)


DELETE_ORDER = [FillRecord, OrderRecord, PositionRecord, ResearchRunRecord, RiskSnapshotRecord]
INSERT_ORDER = [LedgerMetadata, ResearchRunRecord, OrderRecord, FillRecord, PositionRecord, RiskSnapshotRecord]


def _coerce_value(column, value):
    if value is None:
        return None
    if isinstance(column.type, DateTime) and isinstance(value, str):
        return datetime.fromisoformat(value)
    return value


def _prepare_payload(model, raw_row: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for column in model.__table__.columns:
        if column.name in raw_row:
            payload[column.name] = _coerce_value(column, raw_row[column.name])
    return payload


async def restore(args: argparse.Namespace) -> None:
    backup_path = Path(args.input)
    data = json.loads(backup_path.read_text(encoding="utf-8"))

    schema_rows = data.get("ledger_metadata", [])
    schema_version = None
    for row in schema_rows:
        if row.get("key") == "schema_version":
            schema_version = row.get("value")
            break
    if schema_version and int(schema_version) != SCHEMA_VERSION:
        raise RuntimeError(
            f"Schema version mismatch (backup={schema_version} expected={SCHEMA_VERSION})."
        )

    db_cfg = DatabaseConfig(
        dsn_env=args.dsn_env,
        pool_min_size=1,
        pool_max_size=5,
    )
    os.environ[db_cfg.dsn_env] = args.dsn

    ledger = StateLedger(db_cfg)
    try:
        await ledger.init()
        async with ledger.session() as session:
            async with session.begin():
                for model in DELETE_ORDER:
                    await session.execute(delete(model))
            async with session.begin():
                for model in INSERT_ORDER:
                    rows = data.get(model.__tablename__, [])
                    if not rows:
                        continue
                    payloads = [_prepare_payload(model, row) for row in rows]
                    await session.execute(insert(model), payloads)
    finally:
        await ledger.close()

    print(f"Ledger restore complete from {backup_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Path to the JSON backup artifact.")
    parser.add_argument("--dsn", required=True, help="Database connection string for restore target.")
    parser.add_argument(
        "--dsn-env",
        default="AUTOTRADER_DATABASE_DSN",
        help="Environment variable name consumed by the ledger (default: AUTOTRADER_DATABASE_DSN).",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    asyncio.run(restore(args))


if __name__ == "__main__":
    main()

