#!/usr/bin/env python3
"""Run the trading app in shadow mode and benchmark expected performance."""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import Optional

from kalshi_autotrader.config.loader import load_app_config
from kalshi_autotrader.runner import TradingApp
from kalshi_autotrader.analytics.shadow import ShadowPerformanceTracker


async def shadow_once(
    app: TradingApp,
    tracker: ShadowPerformanceTracker,
    *,
    label: str,
    hit_rate_floor: float,
    max_blocked_ratio: float,
) -> None:
    results = await app.run_once()
    correlation_id = app.last_correlation_id or "shadow"
    summary = tracker.record(correlation_id, results)
    expected = summary["cumulative_expected"]
    app._telemetry.emit_metric("shadow_pnl_dollars", expected, {"metric": "expected"})  # noqa: SLF001
    executed = summary.get("executed", [])
    trades = summary.get("trades", 0)
    positive = summary.get("positive_ev_trades", 0)
    if trades:
        app._telemetry.record_hit_rate("shadow", positive / trades)
    blocked = summary.get("blocked", 0)
    total_candidates = trades + blocked
    if trades and (positive / trades) < hit_rate_floor:
        app._telemetry.alert(
            "Shadow hit rate below floor",
            severity="ERROR",
            label=label,
            hit_rate=f"{positive / trades:.2f}",
            trades=str(trades),
        )
    if total_candidates and (blocked / total_candidates) > max_blocked_ratio:
        app._telemetry.alert(
            "Shadow blocked ratio above threshold",
            severity="WARNING",
            label=label,
            blocked_ratio=f"{blocked / total_candidates:.2f}",
            blocked=str(blocked),
            trades=str(trades),
        )
    realized_total = 0.0
    realized_observations = 0
    for trade in executed:
        fills = trade.get("fills") or []
        for fill in fills:
            price = fill.get("price_cents")
            quantity = fill.get("quantity")
            if price is None or quantity is None:
                continue
            realized_observations += 1
            realized_total += (100 - int(price)) / 100.0 * int(quantity)
    if realized_observations:
        app._telemetry.record_shadow_divergence("shadow", summary.get("expected_pnl", 0.0), realized_total)
    print(
        f"[{correlation_id}] trades={summary['trades']} expected_pnl={summary['expected_pnl']:.2f} "
        f"cumulative={summary['cumulative_expected']:.2f}"
    )


async def run(args: argparse.Namespace) -> None:
    config = load_app_config(args.config)
    if not config.kalshi_api.dry_run:
        raise RuntimeError("Shadow runner requires kalshi_api.dry_run=true to avoid live orders.")
    label = args.label or config.kalshi_api.environment or "shadow"
    analytics_root = Path(config.telemetry.analytics_dir) / "shadow" / label
    tracker = ShadowPerformanceTracker(analytics_root)
    app = TradingApp(config)
    try:
        iterations = args.iterations or 1
        for _ in range(iterations):
            await shadow_once(
                app,
                tracker,
                label=label,
                hit_rate_floor=args.hit_rate_floor,
                max_blocked_ratio=args.max_blocked_ratio,
            )
            if args.interval:
                await asyncio.sleep(args.interval)
    finally:
        await app.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default=None,
        help="Optional config file path (defaults to env discovery).",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=1,
        help="Number of shadow iterations to execute.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.0,
        help="Seconds to sleep between iterations.",
    )
    parser.add_argument(
        "--label",
        default=None,
        help="Optional label used to namespace shadow artefacts (defaults to kalshi_api.environment).",
    )
    parser.add_argument(
        "--hit-rate-floor",
        type=float,
        default=0.3,
        help="Emit alerts when hit rate (positive EV / trades) falls below this threshold.",
    )
    parser.add_argument(
        "--max-blocked-ratio",
        type=float,
        default=0.5,
        help="Emit alerts when blocked intents exceed this fraction of candidates.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
