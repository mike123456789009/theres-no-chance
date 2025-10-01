#!/usr/bin/env python3
"""Run configured backtest scenarios and optional out-of-sample validation."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, List

from kalshi_autotrader.analysis.backtest import (
    load_scenario,
    replay_scenario,
    run_out_of_sample_validation,
)
from kalshi_autotrader.config.loader import load_app_config


def _collect_scenarios(args: argparse.Namespace) -> List[Path]:
    scenario_paths: List[Path] = []
    if args.scenario:
        scenario_paths.extend(Path(path) for path in args.scenario)
    if args.scenario_dir:
        scenario_dir = Path(args.scenario_dir)
        scenario_paths.extend(sorted(scenario_dir.glob("*.yml")))
        scenario_paths.extend(sorted(scenario_dir.glob("*.yaml")))
    if not scenario_paths:
        raise ValueError("No scenarios provided; supply --scenario or --scenario-dir")
    return scenario_paths


def _print_metrics(metrics) -> None:
    realized = "N/A" if metrics.realized_pnl is None else f"{metrics.realized_pnl:.2f}"
    hit_rate = "N/A" if metrics.hit_rate is None else f"{metrics.hit_rate:.2%}"
    print(
        f"Scenario={metrics.scenario} trades={metrics.trades} blocked={metrics.blocked} "
        f"expected={metrics.expected_pnl:.2f} realized={realized} hit_rate={hit_rate}"
    )
    print(f"  decisions: {metrics.decisions_path}")
    print(f"  summary:   {metrics.summary_path}")


def run(args: argparse.Namespace) -> None:
    config = load_app_config(args.config)
    scenarios = _collect_scenarios(args)
    output_root = Path(args.output_dir) if args.output_dir else None
    for scenario_path in scenarios:
        scenario = load_scenario(scenario_path)
        metrics = replay_scenario(
            scenario,
            config,
            output_root=output_root,
            update_calibration=args.update_calibration,
        )
        _print_metrics(metrics)
        if args.out_of_sample:
            oos_path = run_out_of_sample_validation(
                scenario,
                config,
                window_size=args.window_size,
                step_size=args.step_size,
                output_root=output_root,
            )
            print(f"  oos report: {oos_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default=None,
        help="Path to app config (defaults to env discovery).",
    )
    parser.add_argument(
        "--scenario",
        action="append",
        help="Path to a scenario YAML (can be supplied multiple times).",
    )
    parser.add_argument(
        "--scenario-dir",
        help="Directory containing scenario YAML files.",
    )
    parser.add_argument(
        "--output-dir",
        help="Optional root directory for generated artefacts.",
    )
    parser.add_argument(
        "--out-of-sample",
        action="store_true",
        help="Run out-of-sample validation after scenario replay.",
    )
    parser.add_argument(
        "--window-size",
        type=int,
        default=50,
        help="Training window size for OOS validation (records).",
    )
    parser.add_argument(
        "--step-size",
        type=int,
        default=25,
        help="Step size between rolling windows for OOS validation.",
    )
    parser.add_argument(
        "--update-calibration",
        action="store_true",
        help="Persist calibration updates while replaying scenarios.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
