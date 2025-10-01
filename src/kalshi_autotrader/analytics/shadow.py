"""Shadow trading performance tracking."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class ShadowPerformanceTracker:
    root_dir: Path
    history_file: Path = field(init=False)
    summary_file: Path = field(init=False)
    decisions_file: Path = field(init=False)
    cumulative_expected: float = 0.0
    trade_count: int = 0

    def __post_init__(self) -> None:
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.history_file = self.root_dir / "shadow_runs.jsonl"
        self.summary_file = self.root_dir / "shadow_summary.json"
        self.decisions_file = self.root_dir / "shadow_decisions.jsonl"
        if self.summary_file.exists():
            try:
                existing = json.loads(self.summary_file.read_text(encoding="utf-8"))
                self.cumulative_expected = float(existing.get("cumulative_expected", 0.0))
                self.trade_count = int(existing.get("trade_count", 0))
            except (json.JSONDecodeError, ValueError):
                pass

    def record(self, correlation_id: str, entries: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        run_expected = 0.0
        run_trades = 0
        executed: list[Dict[str, Any]] = []
        blocked: list[Dict[str, Any]] = []
        positive_ev = 0
        for entry in entries:
            decision = entry.get("decision") or {}
            if not decision or decision.get("status") in {None, "blocked_by_risk"}:
                if decision:
                    blocked.append(
                        {
                            "market": (entry.get("market") or {}).get("ticker"),
                            "status": decision.get("status"),
                            "reason": decision.get("reason"),
                        }
                    )
                continue
            intent = decision.get("intent") or {}
            quantity = intent.get("quantity") or 0
            ev_per_contract = intent.get("ev_per_contract") or 0.0
            run_expected += float(ev_per_contract) * float(quantity)
            run_trades += 1
            if float(ev_per_contract) > 0:
                positive_ev += 1
            executed.append(
                {
                    "market": intent.get("market_ticker"),
                    "price_cents": intent.get("price_cents"),
                    "quantity": quantity,
                    "ev_per_contract": ev_per_contract,
                    "expected_contribution": float(ev_per_contract) * float(quantity),
                    "strategy_signals": intent.get("strategy_signals"),
                    "status": decision.get("status"),
                    "fills": decision.get("fills"),
                }
            )

        self.cumulative_expected += run_expected
        self.trade_count += run_trades

        record = {
            "ts": _utcnow(),
            "correlation_id": correlation_id,
            "expected_pnl": run_expected,
            "trades": run_trades,
            "cumulative_expected": self.cumulative_expected,
            "cumulative_trades": self.trade_count,
            "positive_ev_trades": positive_ev,
            "blocked": len(blocked),
        }
        history_payload = dict(record)
        with self.history_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(history_payload) + "\n")
        if executed or blocked:
            detail_payload = {
                "ts": record["ts"],
                "correlation_id": correlation_id,
                "executed": executed,
                "blocked": blocked,
            }
            with self.decisions_file.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(detail_payload) + "\n")
        self._write_summary()
        record["executed"] = executed
        record["blocked_details"] = blocked
        return record

    def _write_summary(self) -> None:
        mean_ev = self.cumulative_expected / self.trade_count if self.trade_count else 0.0
        payload = {
            "last_updated": _utcnow(),
            "cumulative_expected": self.cumulative_expected,
            "trade_count": self.trade_count,
            "average_ev_per_trade": mean_ev,
        }
        self.summary_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
