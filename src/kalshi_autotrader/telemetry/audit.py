"""Immutable audit logging utilities."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


logger = logging.getLogger(__name__)


class AuditLogger:
    """Append-only JSONL audit sink for research and trading decisions."""

    def __init__(self, path: str) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _write(self, payload: Dict[str, Any]) -> None:
        line = json.dumps(payload, default=str)
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    def record_research(
        self,
        *,
        correlation_id: str,
        market: Dict[str, Any],
        research: Optional[Dict[str, Any]],
        prompt: Optional[str] = None,
    ) -> None:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "type": "research",
            "correlation_id": correlation_id,
            "market": market,
            "research": research,
            "prompt": prompt,
        }
        self._write(entry)

    def record_decision(
        self,
        *,
        correlation_id: str,
        market: Dict[str, Any],
        decision: Optional[Dict[str, Any]],
        fusion: Optional[Dict[str, Any]],
    ) -> None:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "type": "decision",
            "correlation_id": correlation_id,
            "market": market,
            "fusion": fusion,
            "decision": decision,
        }
        self._write(entry)

    def record_control(
        self,
        *,
        correlation_id: str,
        command: Dict[str, Any],
    ) -> None:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "type": "control",
            "correlation_id": correlation_id,
            "command": command,
        }
        self._write(entry)
