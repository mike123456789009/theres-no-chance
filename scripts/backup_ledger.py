#!/usr/bin/env python3
"""Snapshot the ledger database into a JSON artifact for disaster recovery."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable

from sqlalchemy import select
from sqlalchemy.inspection import inspect

from kalshi_autotrader.config.loader import load_app_config
from kalshi_autotrader.services.state_ledger import (
    StateLedger,
    ResearchRunRecord,
    OrderRecord,
    FillRecord,
    PositionRecord,
    RiskSnapshotRecord,
    LedgerMetadata,
)


TABLES = [
    LedgerMetadata,
    ResearchRunRecord,
    OrderRecord,
    FillRecord,
    PositionRecord,
    RiskSnapshotRecord,
]


def _row_to_dict(row: Any) -> Dict[str, Any]:
    mapper = inspect(row).mapper
    payload: Dict[str, Any] = {}
    for column in mapper.column_attrs:
        value = getattr(row, column.key)
        if hasattr(value, "isoformat"):
            value = value.isoformat()  # datetime serialization
        payload[column.key] = value
    return payload


async def export_ledger(ledger: StateLedger) -> Dict[str, Any]:
    output: Dict[str, Any] = {"exported_at": datetime.now(timezone.utc).isoformat()}
    async with ledger.session() as session:
        for model in TABLES:
            result = await session.execute(select(model))
            rows = result.scalars().all()
            output[model.__tablename__] = [_row_to_dict(row) for row in rows]
    return output


async def main_async(args: argparse.Namespace) -> None:
    app_cfg = load_app_config(args.config)
    if args.dsn:
        os.environ[app_cfg.database.dsn_env] = args.dsn

    ledger = StateLedger(app_cfg.database)
    try:
        await ledger.init()
        snapshot = await export_ledger(ledger)
    finally:
        await ledger.close()

    output_path = Path(args.output or "backups/ledger_snapshot.json")
    if output_path.is_dir():
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        output_path = output_path / f"ledger_snapshot_{timestamp}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(f"Ledger backup written to {output_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default=None,
        help="Optional path to an application config YAML. Defaults to env lookup.",
    )
    parser.add_argument(
        "--dsn",
        default=None,
        help="Override database connection string. If unset the config env var is used.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Directory or file path for the backup artifact (JSON).",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        asyncio.run(main_async(args))
    except RuntimeError as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()

