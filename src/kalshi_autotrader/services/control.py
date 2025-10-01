"""Operational control center for manual overrides and commands."""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from uuid import uuid4

from ..data.models import OrderSide
from ..services.market_scanner import MarketScannerService
from ..services.state_ledger import StateLedger
from ..services.execution import ExecutionService
from ..services.risk_limits import RiskManager
from ..telemetry.metrics import TelemetryService
from .edge_engine import OrderIntent

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ControlCommand:
    id: str
    type: str
    payload: Dict[str, object]
    status: str = "pending"


class ControlCenter:
    """Loads operational commands from disk and applies them in the trading loop."""

    def __init__(
        self,
        commands_path: Optional[str] = None,
        ledger: StateLedger | None = None,
    ) -> None:
        default_path = Path("artifacts/control/commands.jsonl")
        self._path = Path(commands_path).expanduser() if commands_path else default_path
        self._processed: set[str] = set()
        self._ledger = ledger
        self._path.parent.mkdir(parents=True, exist_ok=True)

    async def process(
        self,
        scanner: MarketScannerService,
        execution: ExecutionService,
        risk: RiskManager,
        telemetry: TelemetryService,
    ) -> List[ControlCommand]:
        commands = self._load_commands()
        executed: List[ControlCommand] = []
        for command in commands:
            if command.status == "done" or command.id in self._processed:
                continue
            try:
                if command.type == "unwind":
                    await self._execute_unwind(command, scanner, execution, risk)
                elif command.type == "override":
                    await self._execute_override(command, risk)
                else:
                    logger.warning("Unknown control command type %s", command.type)
                    continue
                command.status = "done"
                executed.append(command)
                self._processed.add(command.id)
                telemetry.alert(f"Control command executed: {command.type} -> {command.id}")
            except Exception as exc:  # pragma: no cover
                command.status = "error"
                command.payload["error"] = str(exc)
                telemetry.alert(f"Control command failed: {command.type} ({exc})")
        self._write_commands(commands)
        return executed

    def _load_commands(self) -> List[ControlCommand]:
        if not self._path.exists():
            return []
        commands: List[ControlCommand] = []
        with self._path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                    commands.append(
                        ControlCommand(
                            id=payload.get("id", uuid4().hex),
                            type=payload.get("type", ""),
                            payload=payload.get("payload", {}),
                            status=payload.get("status", "pending"),
                        )
                    )
                except json.JSONDecodeError:
                    logger.warning("Skipping malformed command line: %s", line)
        return commands

    def _write_commands(self, commands: Iterable[ControlCommand]) -> None:
        with self._path.open("w", encoding="utf-8") as handle:
            for command in commands:
                handle.write(
                    json.dumps(
                        {
                            "id": command.id,
                            "type": command.type,
                            "payload": command.payload,
                            "status": command.status,
                        }
                    )
                    + "\n"
                )

    async def _execute_unwind(
        self,
        command: ControlCommand,
        scanner: MarketScannerService,
        execution: ExecutionService,
        risk: RiskManager,
    ) -> None:
        payload = command.payload
        ticker = str(payload.get("ticker", "")).upper()
        quantity = int(payload.get("quantity", 0))
        side_raw = str(payload.get("side", "yes")).lower()
        if quantity <= 0:
            raise ValueError("Quantity must be positive")
        side = OrderSide.YES if side_raw == "yes" else OrderSide.NO
        unwind_side = OrderSide.NO if side == OrderSide.YES else OrderSide.YES

        orderbook = scanner.cached_orderbook(ticker)
        if orderbook is None:
            orderbook = await scanner.get_orderbook(ticker)
        best_price = orderbook.best_yes_bid if unwind_side == OrderSide.NO else orderbook.best_yes_ask
        if best_price is None:
            raise ValueError("Unable to determine price for unwind")
        intent = OrderIntent(
            market_ticker=ticker,
            side=unwind_side,
            price_cents=best_price,
            quantity=quantity,
            ev_per_contract=0.0,
            reason=f"unwind_{ticker}_{command.id[:6]}",
        )
        notional = (best_price / 100.0) * quantity
        risk_check = risk.evaluate_trade({"ticker": ticker}, notional)
        if not risk_check.allowed:
            raise ValueError(risk_check.reason or "blocked")
        await execution.place_order(intent, pegged=False, iceberg=False, orderbook={
            "best_yes_bid": orderbook.best_yes_bid,
            "best_no_bid": orderbook.no_levels[-1][0] if orderbook.no_levels else None,
        })

    async def _execute_override(self, command: ControlCommand, risk: RiskManager) -> None:
        action = command.payload.get("action", "add")
        ticker = str(command.payload.get("ticker", "")).upper()
        if not ticker:
            raise ValueError("Override command missing ticker")
        if action == "remove":
            risk.revoke_manual_override(ticker)
        else:
            risk.grant_manual_override(ticker)
        await asyncio.sleep(0)


__all__ = ["ControlCenter", "ControlCommand"]
