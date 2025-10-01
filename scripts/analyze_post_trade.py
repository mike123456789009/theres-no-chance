#!/usr/bin/env python3
"""Summarize post-trade analytics to refine research and hedging tactics."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_summary(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Summary file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--analytics-dir",
        default="artifacts/analytics",
        help="Directory containing analytics artifacts (defaults to artifacts/analytics).",
    )
    args = parser.parse_args()

    analytics_dir = Path(args.analytics_dir)
    summary_path = analytics_dir / "post_trade_summary.json"
    data = load_summary(summary_path)

    print("Post-Trade Analytics Summary\n==============================")
    print(f"Runs Evaluated     : {data.get('runs', 0)}")
    decisions = data.get("decisions", {})
    for status, count in sorted(decisions.items(), key=lambda kv: kv[0]):
        print(f"- {status:<18} {count}")
    ev = data.get("ev", {})
    if ev.get("samples"):
        print(f"Mean EV/contract   : {ev.get('mean'):+.4f} (n={ev.get('samples')})")
    conf = data.get("confidence", {})
    if conf.get("samples"):
        print(f"Mean confidence    : {conf.get('mean'):.3f} (n={conf.get('samples')})")
    print(f"Last updated       : {data.get('last_updated', 'unknown')}")


if __name__ == "__main__":
    main()

