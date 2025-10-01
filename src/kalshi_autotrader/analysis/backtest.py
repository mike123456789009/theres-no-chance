"""Historical backtesting utilities for fusion and execution strategies."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import yaml

from ..config.models import AppConfig
from ..data.models import Market, OrderBook
from ..services.edge_engine import EdgeEngineService, MicrostructureSignals
from ..services.quant_fusion import CalibrationDatum, FusionInput, QuantFusionService
from ..services.strategy_pack import build_strategy_pack


@dataclass(slots=True)
class HistoricalSample:
    research_prob: float
    base_rate: float
    confidence: float
    market_prob: float
    outcome: int
    microstructure_penalty: float = 0.0
    market_id: str | None = None


@dataclass(slots=True)
class BacktestReport:
    sample_count: int
    brier_score: float
    log_loss: float
    avg_confidence: float
    calibration_error: float


@dataclass(slots=True)
class ReplayRecord:
    """Single replay datapoint assembled from archived decisions."""

    market: Market
    orderbook: OrderBook
    research: Dict[str, Any]
    outcome: Optional[int] = None
    microstructure_penalty: float = 0.0
    scenario_tags: Tuple[str, ...] = ()
    timestamp: Optional[datetime] = None


@dataclass(slots=True)
class ScenarioAdjustments:
    microstructure_penalty_add: float = 0.0
    slippage_bps: float = 0.0
    liquidity_scalar: float = 1.0
    spread_multiplier: float = 1.0
    scenario_tags: Tuple[str, ...] = ()


@dataclass(slots=True)
class ScenarioDefinition:
    name: str
    dataset_path: Path
    description: str | None = None
    adjustments: ScenarioAdjustments = field(default_factory=ScenarioAdjustments)
    overrides: Dict[str, Any] = field(default_factory=dict)
    output_dir: Optional[Path] = None


@dataclass(slots=True)
class ScenarioReplayMetrics:
    scenario: str
    trades: int
    blocked: int
    expected_pnl: float
    realized_pnl: Optional[float]
    hit_rate: Optional[float]
    avg_size: float
    avg_ev: float
    dataset_count: int
    decisions_path: Path
    summary_path: Path


async def run_backtest(
    samples: Sequence[HistoricalSample],
    fusion: QuantFusionService,
    *,
    update_calibration: bool = False,
    model_version: str = "backtest",
) -> BacktestReport:
    probabilities: List[float] = []
    outcomes: List[int] = []
    confidences: List[float] = []

    for sample in samples:
        fusion_output = fusion.fuse(
            FusionInput(
                research_prob=sample.research_prob,
                base_rate=sample.base_rate,
                confidence=sample.confidence,
                market_prob=sample.market_prob,
                microstructure_penalty=sample.microstructure_penalty,
            )
        )
        prob = float(np.clip(fusion_output.p_star, 1e-4, 1 - 1e-4))
        probabilities.append(prob)
        outcomes.append(int(bool(sample.outcome)))
        confidences.append(sample.confidence)

        if update_calibration:
            await fusion.record_calibration(
                CalibrationDatum(
                    predicted=prob,
                    outcome=sample.outcome,
                    market_id=sample.market_id,
                    model_version=model_version,
                )
            )

    probabilities_arr = np.array(probabilities, dtype=float)
    outcomes_arr = np.array(outcomes, dtype=float)

    brier = float(np.mean((probabilities_arr - outcomes_arr) ** 2))
    log_losses = -(outcomes_arr * np.log(probabilities_arr) + (1 - outcomes_arr) * np.log(1 - probabilities_arr))
    log_loss = float(np.mean(log_losses))

    if probabilities:
        bins = np.linspace(0, 1, num=6)
        calibration_error = 0.0
        for idx in range(len(bins) - 1):
            mask = (probabilities_arr >= bins[idx]) & (probabilities_arr < bins[idx + 1])
            if not np.any(mask):
                continue
            bucket_prob = float(np.mean(probabilities_arr[mask]))
            bucket_outcome = float(np.mean(outcomes_arr[mask]))
            calibration_error += abs(bucket_prob - bucket_outcome)
        calibration_error /= max(1, len(bins) - 1)
    else:
        calibration_error = 0.0

    avg_conf = float(np.mean(confidences)) if confidences else 0.0

    return BacktestReport(
        sample_count=len(samples),
        brier_score=brier,
        log_loss=log_loss,
        avg_confidence=avg_conf,
        calibration_error=calibration_error,
    )


def run_backtest_sync(
    samples: Sequence[HistoricalSample],
    fusion: QuantFusionService,
    *,
    update_calibration: bool = False,
    model_version: str = "backtest",
) -> BacktestReport:
    """Blocking wrapper for environments without an event loop."""

    return asyncio.run(
        run_backtest(
            samples,
            fusion,
            update_calibration=update_calibration,
            model_version=model_version,
        )
    )


__all__ = [
    "HistoricalSample",
    "BacktestReport",
    "run_backtest",
    "run_backtest_sync",
    "ScenarioDefinition",
    "ScenarioReplayMetrics",
    "load_scenario",
    "replay_scenario",
    "run_out_of_sample_validation",
]


# ---------------------------------------------------------------------------
# Scenario utilities


def _deep_merge(base: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(base)
    for key, value in overrides.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_scenario(path: Path) -> ScenarioDefinition:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    name = str(data.get("name") or path.stem)
    dataset = Path(data.get("dataset"))
    description = data.get("description")
    adjustments_cfg = data.get("adjustments") or {}
    adjustments = ScenarioAdjustments(
        microstructure_penalty_add=float(adjustments_cfg.get("microstructure_penalty_add", 0.0)),
        slippage_bps=float(adjustments_cfg.get("slippage_bps", 0.0)),
        liquidity_scalar=float(adjustments_cfg.get("liquidity_scalar", 1.0)),
        spread_multiplier=float(adjustments_cfg.get("spread_multiplier", 1.0)),
        scenario_tags=tuple(adjustments_cfg.get("scenario_tags", []) or []),
    )
    overrides = data.get("overrides") or {}
    output_dir = Path(data["output_dir"]) if data.get("output_dir") else None
    return ScenarioDefinition(
        name=name,
        dataset_path=dataset,
        description=description,
        adjustments=adjustments,
        overrides=overrides,
        output_dir=output_dir,
    )


def _coerce_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _load_dataset(dataset_path: Path) -> List[ReplayRecord]:
    records: List[ReplayRecord] = []
    with dataset_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            raw = json.loads(line)
            market_payload = raw.get("market") or {}
            close_ts = _coerce_datetime(market_payload.get("close_ts"))
            open_ts = _coerce_datetime(market_payload.get("open_ts"))
            market = Market(
                ticker=market_payload.get("ticker", "UNKNOWN"),
                event_ticker=market_payload.get("event_ticker", ""),
                title=market_payload.get("title", ""),
                subtitle=market_payload.get("subtitle"),
                close_ts=close_ts or datetime.now(timezone.utc),
                open_ts=open_ts or datetime.now(timezone.utc),
                rules_primary=market_payload.get("rules_primary", ""),
                rules_secondary=market_payload.get("rules_secondary"),
                category=market_payload.get("category"),
                tick_size=int(market_payload.get("tick_size", 1)),
                yes_bid=market_payload.get("yes_bid"),
                yes_ask=market_payload.get("yes_ask"),
                no_bid=market_payload.get("no_bid"),
                no_ask=market_payload.get("no_ask"),
                volume=market_payload.get("volume"),
                volume_24h=market_payload.get("volume_24h"),
                open_interest=market_payload.get("open_interest"),
            )
            orderbook_payload = raw.get("orderbook") or {}
            yes_levels = orderbook_payload.get("yes_levels") or []
            no_levels = orderbook_payload.get("no_levels") or []
            orderbook = OrderBook(
                market_ticker=market.ticker,
                ts=_coerce_datetime(orderbook_payload.get("ts")) or market.close_ts,
                yes_levels=[(int(p), int(q)) for p, q in yes_levels],
                no_levels=[(int(p), int(q)) for p, q in no_levels],
            )
            research_payload = raw.get("research") or {}
            outcome = raw.get("outcome")
            micro_penalty = float(raw.get("microstructure_penalty", 0.0))
            scenario_tags = tuple(research_payload.get("scenario_tags") or [])
            timestamp = _coerce_datetime(raw.get("timestamp"))
            records.append(
                ReplayRecord(
                    market=market,
                    orderbook=orderbook,
                    research=research_payload,
                    outcome=outcome,
                    microstructure_penalty=micro_penalty,
                    scenario_tags=scenario_tags,
                    timestamp=timestamp,
                )
            )
    return records


def _apply_slippage(price_cents: int, slippage_bps: float) -> int:
    if slippage_bps == 0:
        return price_cents
    adjusted = price_cents * (1 + slippage_bps / 10_000.0)
    return int(round(max(1, min(99, adjusted))))


def _compute_realized_pnl(price_cents: int, quantity: int, outcome: Optional[int]) -> Optional[float]:
    if outcome is None:
        return None
    price = price_cents / 100.0
    if outcome not in (0, 1):
        return None
    if quantity == 0:
        return 0.0
    return float(outcome * (1 - price) - (1 - outcome) * price) * quantity


def _serialize_market(market: Market) -> Dict[str, Any]:
    payload = asdict(market)
    for key in ("close_ts", "open_ts"):
        value = payload.get(key)
        if isinstance(value, datetime):
            payload[key] = value.isoformat()
    return payload


def _serialize_orderbook(orderbook: OrderBook) -> Dict[str, Any]:
    payload = {
        "yes_levels": orderbook.yes_levels,
        "no_levels": orderbook.no_levels,
        "ts": orderbook.ts.isoformat(),
    }
    return payload


def replay_scenario(
    scenario: ScenarioDefinition,
    base_config: AppConfig,
    *,
    output_root: Optional[Path] = None,
    update_calibration: bool = False,
) -> ScenarioReplayMetrics:
    records = _load_dataset(scenario.dataset_path)
    base_dict = base_config.model_dump(mode="json")
    merged_dict = _deep_merge(base_dict, scenario.overrides)
    config = AppConfig.from_dict(merged_dict)

    strategy_pack = build_strategy_pack(config.strategy)
    fusion = QuantFusionService()
    edge_engine = EdgeEngineService(config.risk, config.execution, strategy_pack=strategy_pack)

    decisions_dir = (output_root or Path(config.telemetry.analytics_dir) / "backtests") / scenario.name
    decisions_dir.mkdir(parents=True, exist_ok=True)
    decisions_path = decisions_dir / "decisions.jsonl"
    summary_path = decisions_dir / "summary.json"

    trades = 0
    blocked = 0
    expected_pnl = 0.0
    realized_pnl = 0.0
    realized_samples = 0
    hit_wins = 0
    total_size = 0
    total_ev = 0.0

    with decisions_path.open("w", encoding="utf-8") as fh:
        for record in records:
            microstructure = edge_engine.analyze_microstructure(record.market.ticker, record.orderbook)
            if scenario.adjustments.spread_multiplier != 1.0:
                microstructure = MicrostructureSignals(
                    spread_cents=int(microstructure.spread_cents * scenario.adjustments.spread_multiplier),
                    yes_depth=int(microstructure.yes_depth * scenario.adjustments.liquidity_scalar),
                    no_depth=int(microstructure.no_depth * scenario.adjustments.liquidity_scalar),
                    imbalance=microstructure.imbalance,
                    momentum=microstructure.momentum,
                    penalty=microstructure.penalty + scenario.adjustments.microstructure_penalty_add,
                    liquidity_factor=max(
                        0.1,
                        min(1.5, microstructure.liquidity_factor * scenario.adjustments.liquidity_scalar),
                    ),
                )
            fusion_input = FusionInput(
                research_prob=float(record.research.get("p_yes", 0.5)),
                base_rate=float((record.market.yes_bid or 0) / 100.0),
                confidence=float(record.research.get("confidence", 0.5)),
                market_prob=float((record.orderbook.best_yes_bid or 0) / 100.0),
                microstructure_penalty=record.microstructure_penalty + scenario.adjustments.microstructure_penalty_add,
                confidence_interval=tuple(record.research.get("confidence_interval", [])) or None,
                scenario_tags=tuple(set(record.scenario_tags + scenario.adjustments.scenario_tags)),
            )
            fusion_output = fusion.fuse(fusion_input)
            if update_calibration and record.outcome is not None:
                asyncio.run(
                    fusion.record_calibration(
                        CalibrationDatum(
                            predicted=fusion_output.p_star,
                            outcome=int(record.outcome),
                            market_id=record.market.ticker,
                            model_version=f"scenario:{scenario.name}",
                        )
                    )
                )

            best_yes_bid = record.orderbook.best_yes_bid
            price_cents = best_yes_bid if best_yes_bid is not None else 50
            market_dict = _serialize_market(record.market)
            intent = edge_engine.build_intent(
                market_dict,
                fusion_output,
                best_yes_bid,
                bankroll=config.risk.bankroll_dollars,
                microstructure=microstructure,
                strategy_metadata={"research_confidence": fusion_input.confidence},
            )

            decision_payload: Dict[str, Any]
            if intent is None:
                blocked += 1
                decision_payload = {
                    "status": "blocked",
                    "reason": "intent_filtered",
                }
            else:
                trades += 1
                total_size += intent.quantity
                total_ev += intent.ev_per_contract
                slippage_adjusted_price = _apply_slippage(intent.price_cents, scenario.adjustments.slippage_bps)
                expected_pnl += intent.ev_per_contract * intent.quantity
                realized = _compute_realized_pnl(slippage_adjusted_price, intent.quantity, record.outcome)
                if realized is not None:
                    realized_pnl += realized
                    realized_samples += 1
                    if realized > 0:
                        hit_wins += 1
                decision_payload = {
                    "status": "submitted",
                    "intent": {
                        "market_ticker": intent.market_ticker,
                        "price_cents": intent.price_cents,
                        "quantity": intent.quantity,
                        "ev_per_contract": intent.ev_per_contract,
                        "strategy_signals": intent.strategy_signals,
                    },
                    "slippage_price_cents": slippage_adjusted_price,
                    "realized_pnl": realized,
                }

            record_payload = {
                "market": market_dict,
                "research": record.research,
                "fusion": {
                    "p_star": fusion_output.p_star,
                    "sigma": fusion_output.sigma,
                    "z_score": fusion_output.z_score,
                    "confidence_interval": list(fusion_output.confidence_interval),
                    "confidence_weight": fusion_output.confidence_weight,
                    "scenario_tags": list(fusion_output.scenario_tags),
                },
                "orderbook": _serialize_orderbook(record.orderbook),
                "decision": decision_payload,
                "timestamp": record.timestamp.isoformat() if record.timestamp else None,
            }
            fh.write(json.dumps(record_payload, default=str) + "\n")

    avg_size = total_size / trades if trades else 0.0
    avg_ev = total_ev / trades if trades else 0.0
    hit_rate = hit_wins / realized_samples if realized_samples else None
    realized_total = realized_pnl if realized_samples else None

    summary = {
        "scenario": scenario.name,
        "description": scenario.description,
        "trades": trades,
        "blocked": blocked,
        "expected_pnl": expected_pnl,
        "realized_pnl": realized_total,
        "hit_rate": hit_rate,
        "average_size": avg_size,
        "average_ev": avg_ev,
        "dataset_records": len(records),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    summary_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

    return ScenarioReplayMetrics(
        scenario=scenario.name,
        trades=trades,
        blocked=blocked,
        expected_pnl=expected_pnl,
        realized_pnl=realized_total,
        hit_rate=hit_rate,
        avg_size=avg_size,
        avg_ev=avg_ev,
        dataset_count=len(records),
        decisions_path=decisions_path,
        summary_path=summary_path,
    )


# ---------------------------------------------------------------------------
# Out-of-sample validation


def _records_to_samples(records: Sequence[ReplayRecord]) -> List[HistoricalSample]:
    samples: List[HistoricalSample] = []
    for record in records:
        samples.append(
            HistoricalSample(
                research_prob=float(record.research.get("p_yes", 0.5)),
                base_rate=float((record.market.yes_bid or 0) / 100.0),
                confidence=float(record.research.get("confidence", 0.5)),
                market_prob=float((record.orderbook.best_yes_bid or 0) / 100.0),
                outcome=int(record.outcome) if record.outcome is not None else 0,
                microstructure_penalty=record.microstructure_penalty,
                market_id=record.market.ticker,
            )
        )
    return samples


def run_out_of_sample_validation(
    scenario: ScenarioDefinition,
    base_config: AppConfig,
    *,
    window_size: int = 50,
    step_size: int = 25,
    output_root: Optional[Path] = None,
) -> Path:
    records = _load_dataset(scenario.dataset_path)
    if not records:
        raise ValueError("Scenario dataset is empty; cannot run OOS validation")

    records = sorted(records, key=lambda r: r.timestamp or datetime.min)
    windows: List[Tuple[int, int]] = []
    start = 0
    total = len(records)
    while start + window_size < total:
        train_end = start + window_size
        validation_end = min(train_end + step_size, total)
        windows.append((start, validation_end))
        start += step_size
        if validation_end == total:
            break

    if not windows:
        windows.append((0, total))

    base_dict = base_config.model_dump(mode="json")
    merged_dict = _deep_merge(base_dict, scenario.overrides)
    config = AppConfig.from_dict(merged_dict)

    oos_dir = (output_root or Path(config.telemetry.analytics_dir) / "oos") / scenario.name
    oos_dir.mkdir(parents=True, exist_ok=True)
    report_path = oos_dir / "oos_summary.json"

    window_reports = []
    for idx, (start_idx, end_idx) in enumerate(windows):
        train_records = records[start_idx : start_idx + window_size]
        validation_records = records[start_idx + window_size : end_idx]
        fusion = QuantFusionService()
        samples = _records_to_samples(train_records)
        if samples:
            asyncio.run(run_backtest(samples, fusion, update_calibration=True, model_version=f"oos:{scenario.name}:{idx}"))
        validation_samples = _records_to_samples(validation_records)
        validation_report = asyncio.run(run_backtest(validation_samples, fusion, model_version=f"oos:{scenario.name}:{idx}"))
        window_reports.append(
            {
                "window": idx,
                "train_records": len(train_records),
                "validation_records": len(validation_records),
                "brier_score": validation_report.brier_score,
                "log_loss": validation_report.log_loss,
                "calibration_error": validation_report.calibration_error,
                "avg_confidence": validation_report.avg_confidence,
            }
        )

    report_payload = {
        "scenario": scenario.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "windows": window_reports,
    }
    report_path.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")
    return report_path
