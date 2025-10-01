#!/usr/bin/env python3
"""Run probability fusion backtests against historical datasets."""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import List

import pandas as pd

from kalshi_autotrader.analysis.backtest import HistoricalSample, run_backtest
from kalshi_autotrader.services.quant_fusion import QuantFusionService


def load_samples(path: Path) -> List[HistoricalSample]:
    df = pd.read_csv(path)
    required = {"research_prob", "base_rate", "confidence", "market_prob", "outcome"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    samples: List[HistoricalSample] = []
    for row in df.itertuples(index=False):
        samples.append(
            HistoricalSample(
                research_prob=float(getattr(row, "research_prob")),
                base_rate=float(getattr(row, "base_rate")),
                confidence=float(getattr(row, "confidence")),
                market_prob=float(getattr(row, "market_prob")),
                outcome=int(getattr(row, "outcome")),
                microstructure_penalty=float(getattr(row, "microstructure_penalty", 0.0)),
                market_id=getattr(row, "market_id", None),
            )
        )
    return samples


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run fusion backtests over historical samples")
    parser.add_argument("csv", type=Path, help="CSV file with historical samples")
    parser.add_argument("--update-calibration", action="store_true", help="Persist outcomes to calibration store")
    parser.add_argument(
        "--model-version",
        type=str,
        default="backtest",
        help="Model version recorded with calibration outcomes",
    )
    parser.add_argument(
        "--beta-prior",
        type=float,
        nargs=2,
        default=(1.0, 1.0),
        metavar=("ALPHA", "BETA"),
        help="Beta prior parameters for calibration shrinkage",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on calibration observations loaded from the repository",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    samples = load_samples(args.csv)
    fusion = QuantFusionService(beta_prior=tuple(args.beta_prior))

    async def _run() -> None:
        await fusion.warm_start(limit=args.limit)
        report = await run_backtest(
            samples,
            fusion,
            update_calibration=args.update_calibration,
            model_version=args.model_version,
        )
        print("Samples:", report.sample_count)
        print("Brier score:", f"{report.brier_score:.4f}")
        print("Log loss:", f"{report.log_loss:.4f}")
        print("Calibration error:", f"{report.calibration_error:.4f}")
        print("Average confidence:", f"{report.avg_confidence:.3f}")

    asyncio.run(_run())


if __name__ == "__main__":
    main()
