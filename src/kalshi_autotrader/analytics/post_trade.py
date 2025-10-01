"""Post-trade analytics utilities for continuous strategy refinement."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class PostTradeAnalytics:
    root_dir: Path

    def __post_init__(self) -> None:
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self._samples_path = self.root_dir / "post_trade_samples.jsonl"
        self._summary_path = self.root_dir / "post_trade_summary.json"

    def record_run(self, correlation_id: str, entries: Iterable[Dict[str, Any]]) -> None:
        records = []
        for entry in entries:
            market = entry.get("market") or {}
            research = entry.get("research") or {}
            decision = entry.get("decision") or {}
            intent_payload = decision.get("intent") if isinstance(decision, dict) else None
            intent: Dict[str, Any] = intent_payload or {}
            record = {
                "ts": _now_iso(),
                "correlation_id": correlation_id,
                "market_ticker": market.get("ticker"),
                "category": market.get("category"),
                "status": decision.get("status") if isinstance(decision, dict) else None,
                "ev_per_contract": intent.get("ev_per_contract"),
                "confidence": research.get("confidence"),
                "p_yes": research.get("p_yes"),
                "reason": intent.get("reason"),
                "drivers": research.get("drivers"),
                "caveats": research.get("caveats"),
            }
            records.append(record)

        if records:
            with self._samples_path.open("a", encoding="utf-8") as fh:
                for record in records:
                    fh.write(json.dumps(record, default=str) + "\n")
        self._update_summary(records)

    def _update_summary(self, records: Iterable[Dict[str, Any]]) -> None:
        summary = {
            "runs": 0,
            "decisions": {},
            "ev_sum": 0.0,
            "ev_count": 0,
            "confidence_sum": 0.0,
            "confidence_count": 0,
        }
        if self._summary_path.exists():
            try:
                summary.update(json.loads(self._summary_path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                pass

        summary["runs"] += 1
        for record in records:
            status = record.get("status") or "unknown"
            summary.setdefault("decisions", {})
            summary["decisions"][status] = summary["decisions"].get(status, 0) + 1

            ev = record.get("ev_per_contract")
            if isinstance(ev, (int, float)):
                summary["ev_sum"] += float(ev)
                summary["ev_count"] += 1

            confidence = record.get("confidence")
            if isinstance(confidence, (int, float)):
                summary["confidence_sum"] += float(confidence)
                summary["confidence_count"] += 1

        mean_ev = (
            summary["ev_sum"] / summary["ev_count"] if summary.get("ev_count") else None
        )
        mean_conf = (
            summary["confidence_sum"] / summary["confidence_count"]
            if summary.get("confidence_count")
            else None
        )

        output = {
            "runs": summary["runs"],
            "decisions": summary["decisions"],
            "ev": {
                "mean": mean_ev,
                "samples": summary.get("ev_count", 0),
            },
            "confidence": {
                "mean": mean_conf,
                "samples": summary.get("confidence_count", 0),
            },
            "last_updated": _now_iso(),
        }
        self._summary_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
