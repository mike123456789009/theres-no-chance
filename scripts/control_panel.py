#!/usr/bin/env python3
"""Operational control CLI for overrides, unwinds, and research review."""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import List
from uuid import uuid4

from kalshi_autotrader.config.loader import load_app_config
from kalshi_autotrader.services.state_ledger import StateLedger

CONTROL_COMMANDS = Path("artifacts/control/commands.jsonl")
MANUAL_OVERRIDES = Path("artifacts/control/manual_overrides.json")


def load_override_file(path: Path) -> List[str]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        markets = data.get("markets") if isinstance(data, dict) else data
        if isinstance(markets, list):
            return [str(t) for t in markets]
    except json.JSONDecodeError:
        pass
    return []


def save_override_file(path: Path, markets: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"markets": sorted(set(markets))}
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def overrides_command(args: argparse.Namespace) -> None:
    cfg = load_app_config()
    path = Path(cfg.risk.manual_override_file or MANUAL_OVERRIDES)
    markets = load_override_file(path)
    if args.action == "list":
        print("Manual overrides:")
        for ticker in sorted(markets):
            print(" ", ticker)
        if not markets:
            print(" (none)")
        return
    ticker = args.ticker.upper()
    if args.action == "add":
        if ticker not in markets:
            markets.append(ticker)
            save_override_file(path, markets)
            print(f"Added override for {ticker}")
        else:
            print(f"Override already present for {ticker}")
    elif args.action == "remove":
        if ticker in markets:
            markets.remove(ticker)
            save_override_file(path, markets)
            print(f"Removed override for {ticker}")
        else:
            print(f"No override found for {ticker}")


def append_command(command: dict) -> None:
    CONTROL_COMMANDS.parent.mkdir(parents=True, exist_ok=True)
    with CONTROL_COMMANDS.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(command) + "\n")


def unwind_command(args: argparse.Namespace) -> None:
    command = {
        "id": uuid4().hex,
        "type": "unwind",
        "payload": {
            "ticker": args.ticker.upper(),
            "quantity": args.quantity,
            "side": args.side.lower(),
        },
        "status": "pending",
    }
    append_command(command)
    print(f"Queued unwind command {command['id']} for {args.ticker.upper()}")


def override_command(args: argparse.Namespace) -> None:
    action = "remove" if args.remove else "add"
    command = {
        "id": uuid4().hex,
        "type": "override",
        "payload": {"ticker": args.ticker.upper(), "action": action},
        "status": "pending",
    }
    append_command(command)
    print(f"Queued override command {command['id']} for {args.ticker.upper()} ({action})")


async def review_research_async(limit: int) -> None:
    cfg = load_app_config()
    ledger = StateLedger(cfg.database)
    await ledger.init()
    try:
        rows = await ledger.fetch_recent_research(limit)
    finally:
        await ledger.close()
    if not rows:
        print("No research runs stored.")
        return
    for row in rows:
        print(f"{row['ts']} | {row['market_id']} | p_yes={row['p_yes']:.2f} conf={row['confidence']:.2f}")
        if row["drivers"]:
            print("  Drivers:")
            for driver in row["drivers"]:
                print("   -", driver)
        if row["caveats"]:
            print("  Caveats:")
            for caveat in row["caveats"]:
                print("   -", caveat)
        print()


def research_review_command(args: argparse.Namespace) -> None:
    asyncio.run(review_research_async(args.limit))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Operational control CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    overrides = subparsers.add_parser("overrides", help="Manage manual overrides")
    overrides.add_argument("action", choices=["add", "remove", "list"])
    overrides.add_argument("ticker", nargs="?", default="", help="Market ticker")
    overrides.set_defaults(func=overrides_command)

    unwind = subparsers.add_parser("unwind", help="Submit manual unwind command")
    unwind.add_argument("ticker")
    unwind.add_argument("quantity", type=int)
    unwind.add_argument("--side", choices=["yes", "no"], default="yes")
    unwind.set_defaults(func=unwind_command)

    override_cmd = subparsers.add_parser("override-command", help="Queue override command for runtime execution")
    override_cmd.add_argument("ticker")
    override_cmd.add_argument("--remove", action="store_true")
    override_cmd.set_defaults(func=override_command)

    review = subparsers.add_parser("research", help="Review recent research runs")
    review.add_argument("--limit", type=int, default=5)
    review.set_defaults(func=research_review_command)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
