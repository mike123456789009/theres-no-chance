#!/usr/bin/env python3
"""Run repeated dry-run trading cycles and log recommendations."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any, Dict, List

from dotenv import load_dotenv


load_dotenv()

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = REPO_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))

from kalshi_autotrader.runner import TradingApp
from kalshi_autotrader.config.loader import load_app_config


async def run_once(config) -> List[Dict[str, Any]]:
    app = TradingApp(config)
    try:
        return await app.run_once()
    finally:
        await app.close()


def _load_env(env_file: str = ".env") -> None:
    env_path = REPO_ROOT / env_file
    if not env_path.exists():
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    idx = 0
    while idx < len(lines):
        raw = lines[idx]
        stripped = raw.strip()
        idx += 1
        if not stripped or stripped.startswith("#"):
            continue
        if '="""' in raw:
            key, _ = raw.split('=', 1)
            value_lines = []
            while idx < len(lines) and lines[idx].strip() != '"""':
                value_lines.append(lines[idx])
                idx += 1
            if idx < len(lines):
                idx += 1
            os.environ[key] = "\n".join(value_lines)
        else:
            if '=' not in raw:
                continue
            key, value = raw.split('=', 1)
            os.environ.setdefault(key, value)


async def run_loop(duration_minutes: float, interval_seconds: float, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _load_env()
    config = load_app_config()
    start = time.monotonic()
    end = start + duration_minutes * 60
    iteration = 0

    while True:
        iteration += 1
        loop_start = datetime.now(timezone.utc)
        print(f"\n[{loop_start.isoformat()}] Iteration {iteration} starting...")

        try:
            results = await run_once(config)
        except Exception as exc:  # noqa: BLE001
            print(f"Iteration {iteration} failed: {exc!r}")
            results = {"error": repr(exc)}

        record = {
            "iteration": iteration,
            "started_at": loop_start.isoformat(),
            "results": results,
        }
        with output_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
        print(f"Iteration {iteration} recorded. Logged to {output_path}")

        remaining = end - time.monotonic()
        if remaining <= 0:
            break
        sleep_for = min(interval_seconds, remaining)
        if sleep_for > 0:
            await asyncio.sleep(sleep_for)

    print("\nCompleted paper trading loop.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run repeated dry-run trading cycles.")
    parser.add_argument(
        "--duration-minutes",
        type=float,
        default=float(os.getenv("AUTO_DURATION_MIN", 30)),
        help="Total duration to run in minutes (default: 30).",
    )
    parser.add_argument(
        "--interval-seconds",
        type=float,
        default=float(os.getenv("AUTO_INTERVAL_SEC", 60)),
        help="Delay between iterations in seconds (default: 60).",
    )
    default_output = os.getenv(
        "AUTO_OUTPUT",
        f"artifacts/paper_loop_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.jsonl",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(default_output),
        help="Path to the JSONL log file (default: artifacts/paper_loop_<timestamp>.jsonl)",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    await run_loop(args.duration_minutes, args.interval_seconds, args.output)


if __name__ == "__main__":
    asyncio.run(main())
