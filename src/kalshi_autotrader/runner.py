"""Entrypoint orchestrating the Kalshi trading loop."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .config.loader import load_app_config
from .config.models import AppConfig
from .infrastructure.kalshi_client import KalshiRestClient, KalshiWebsocketClient
from .services.edge_engine import EdgeEngineService
from .services.execution import ExecutionService
from .services.market_scanner import MarketScannerService
from .services.quant_fusion import FusionInput, QuantFusionService
from .services.research_agent import ResearchAgentService
from .services.risk_limits import RiskManager
from .services.state_ledger import StateLedger
from .services.control import ControlCenter
from .services.strategy_pack import build_strategy_pack
from .telemetry.metrics import TelemetryService
from .telemetry.audit import AuditLogger
from .telemetry.logging_setup import correlation_scope, generate_correlation_id
from .analytics.post_trade import PostTradeAnalytics

logger = logging.getLogger(__name__)


class TradingApp:
    def __init__(self, config: AppConfig):
        self._cfg = config
        self._telemetry = TelemetryService(config.telemetry)
        self._audit = AuditLogger(config.telemetry.audit_log_path)
        self._analytics = PostTradeAnalytics(Path(config.telemetry.analytics_dir))
        self._rest = KalshiRestClient(config.kalshi_api)
        self._ws = KalshiWebsocketClient(config.kalshi_api)
        self._strategy_pack = build_strategy_pack(config.strategy)
        self._scanner = MarketScannerService(
            self._rest,
            self._ws,
            config.scanner,
            strategy_pack=self._strategy_pack,
        )
        self._ledger: StateLedger | None = None
        self._ledger_ready = False
        try:
            self._ledger = StateLedger(config.database)
        except Exception as exc:  # noqa: BLE001
            logger.warning("State ledger unavailable: %s", exc)
            self._ledger = None
        self._research = ResearchAgentService(config.research)
        self._fusion = QuantFusionService(repository=self._ledger)
        self._fusion_warm = False
        self._edge = EdgeEngineService(config.risk, config.execution, strategy_pack=self._strategy_pack)
        self._risk = RiskManager(config.risk, telemetry=self._telemetry, ledger=self._ledger)
        self._execution = ExecutionService(
            self._rest,
            config.execution,
            ledger=self._ledger,
            telemetry=self._telemetry,
        )
        self._controls = ControlCenter(ledger=self._ledger)
        self._last_correlation_id: str | None = None

    async def run_once(self) -> list[Dict[str, Any]]:
        loop_start = datetime.now(timezone.utc)
        results: list[Dict[str, Any]] = []
        correlation_id = generate_correlation_id()
        self._last_correlation_id = correlation_id
        with correlation_scope(correlation_id=correlation_id):
            if self._ledger and not self._ledger_ready:
                try:
                    await self._ledger.init()
                    self._ledger_ready = True
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Failed to initialize state ledger: %s", exc)
                    self._ledger = None
            if self._ledger and not self._fusion_warm:
                try:
                    await self._fusion.warm_start()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Fusion warm start failed: %s", exc)
                finally:
                    self._fusion_warm = True
            markets = await self._scanner.list_markets()
            analysis_cap = min(len(markets), self._cfg.scanner.fallback_top_n)
            for market in markets[:analysis_cap]:
                if self._risk.within_freeze_window(market.close_ts):
                    continue
                orderbook = await self._scanner.get_orderbook(market.ticker)
                best_yes_bid = orderbook.best_yes_bid
                market_prob = (best_yes_bid or 0) / 100.0
                microstructure = self._edge.analyze_microstructure(market.ticker, orderbook)
                deadline = datetime.now(timezone.utc) + timedelta(minutes=5)
                market_payload = self._serialize_market(market)
                research = await self._research.run_research(market_payload, deadline)
                serialized_research = self._serialize_research(research) if research else None
                self._audit.record_research(
                    correlation_id=correlation_id,
                    market=market_payload,
                    research=serialized_research,
                    prompt=getattr(self._research, "last_prompt", None),
                )
                if research is None:
                    results.append(
                        {
                            "market": market_payload,
                            "research": None,
                            "fusion": None,
                            "decision": None,
                        }
                    )
                    continue
                fusion_output = self._fusion.fuse(
                    FusionInput(
                        research_prob=research.p_yes,
                        base_rate=market_prob,
                        confidence=research.confidence,
                        market_prob=market_prob,
                        microstructure_penalty=microstructure.penalty,
                        confidence_interval=tuple(research.confidence_interval),
                        scenario_tags=tuple(research.scenario_tags),
                    )
                )
                serialized_fusion = self._serialize_fusion(fusion_output)
                bankroll = self._cfg.risk.bankroll_dollars
                strategy_meta = dict(self._scanner.get_strategy_metadata(market.ticker))
                strategy_meta.setdefault("research_confidence", research.confidence)
                strategy_meta.setdefault("scenario_tags", list(research.scenario_tags))
                intent = self._edge.build_intent(
                    market_payload,
                    fusion_output,
                    best_yes_bid,
                    bankroll,
                    microstructure,
                    strategy_meta,
                )
                if not intent:
                    results.append(
                        {
                            "market": market_payload,
                            "research": serialized_research,
                            "fusion": serialized_fusion,
                            "decision": None,
                        }
                    )
                    self._audit.record_decision(
                        correlation_id=correlation_id,
                        market=market_payload,
                        decision=None,
                        fusion=serialized_fusion,
                    )
                    continue
                if intent.strategy_signals:
                    for strategy_name in intent.strategy_signals:
                        self._telemetry.record_strategy_ev(strategy_name, intent.ev_per_contract)
                notional = (intent.price_cents / 100.0) * intent.quantity
                risk_check = self._risk.evaluate_trade(market_payload, notional)
                if not risk_check.allowed:
                    decision_payload = {
                        "status": "blocked_by_risk",
                        "intent": self._serialize_intent(intent),
                        "reason": risk_check.reason,
                        "alerts": risk_check.alerts,
                    }
                    results.append(
                        {
                            "market": market_payload,
                            "research": serialized_research,
                            "fusion": serialized_fusion,
                            "decision": decision_payload,
                        }
                    )
                    self._telemetry.alert(
                        f"Risk blocked trade on {intent.market_ticker}: {risk_check.reason}",
                        severity="WARNING",
                        market=intent.market_ticker,
                    )
                    self._audit.record_decision(
                        correlation_id=correlation_id,
                        market=market_payload,
                        decision=decision_payload,
                        fusion=serialized_fusion,
                    )
                    continue
                orderbook_payload = self._serialize_orderbook(orderbook)
                result = await self._execution.place_order(
                    intent,
                    orderbook=orderbook_payload,
                )
                status = result.get("status", "submitted")
                logger.info("Order result: %s", result)
                self._telemetry.emit_metric(
                    "edge_ev",
                    intent.ev_per_contract,
                    {"market": intent.market_ticker},
                )
                self._risk.record_trade(market_payload, notional)
                decision_payload = {
                    "status": status,
                    "intent": self._serialize_intent(intent),
                }
                results.append(
                    {
                        "market": market_payload,
                        "research": serialized_research,
                        "fusion": serialized_fusion,
                        "decision": decision_payload,
                    }
                )
                self._audit.record_decision(
                    correlation_id=correlation_id,
                    market=market_payload,
                    decision=decision_payload,
                    fusion=serialized_fusion,
                )
            await self._risk.persist_snapshot()
            control_results = await self._controls.process(
                self._scanner,
                self._execution,
                self._risk,
                self._telemetry,
            )
            if control_results:
                for cmd in control_results:
                    payload = {
                        "market": {"ticker": cmd.payload.get("ticker", cmd.type)},
                        "research": None,
                        "fusion": None,
                        "decision": {
                            "status": f"control_{cmd.type}",
                            "intent": {},
                            "command_id": cmd.id,
                        },
                    }
                    results.append(payload)
                    self._audit.record_control(
                        correlation_id=correlation_id,
                        command={
                            "type": cmd.type,
                            "id": cmd.id,
                            "payload": cmd.payload,
                        },
                    )
        self._analytics.record_run(correlation_id, results)
        ev_values: List[float] = []
        top_entries: List[Tuple[str, float]] = []
        for entry in results:
            decision = entry.get("decision") or {}
            intent = decision.get("intent") if isinstance(decision, dict) else None
            if intent and isinstance(intent, dict):
                ev_value = intent.get("ev_per_contract")
                if isinstance(ev_value, (int, float)):
                    ev_values.append(float(ev_value))
                    status = decision.get("status")
                    if status and status != "blocked_by_risk":
                        top_entries.append((intent.get("market_ticker", ""), float(ev_value)))
        if ev_values:
            self._telemetry.update_ev_distribution(ev_values)
        if top_entries:
            self._telemetry.update_top_opportunities(top_entries)
        latency = (datetime.now(timezone.utc) - loop_start).total_seconds()
        self._telemetry.record_latency("trading_loop", latency)
        self._telemetry.render_dashboards()
        return results

    async def close(self) -> None:
        await self._rest.close()
        if self._ledger:
            await self._ledger.close()

    @property
    def last_correlation_id(self) -> str | None:
        return self._last_correlation_id

    @staticmethod
    def _serialize_market(market) -> Dict[str, Any]:
        data = asdict(market)
        for key, value in list(data.items()):
            if isinstance(value, datetime):
                data[key] = value.isoformat()
        return data

    @staticmethod
    def _serialize_orderbook(orderbook) -> Dict[str, Any]:
        best_yes_ask = orderbook.yes_levels[0][0] if orderbook.yes_levels else None
        best_no_bid = orderbook.no_levels[-1][0] if orderbook.no_levels else None
        return {
            "best_yes_bid": orderbook.best_yes_bid,
            "best_yes_ask": best_yes_ask,
            "best_no_bid": best_no_bid,
            "side": "yes",
        }

    @staticmethod
    def _serialize_research(research) -> Dict[str, Any]:
        return {
            "p_yes": research.p_yes,
            "p_range": list(research.p_range),
            "drivers": list(research.drivers),
            "caveats": list(research.caveats),
            "sources": list(research.sources),
            "citations": list(research.citations),
            "confidence": research.confidence,
            "confidence_interval": list(research.confidence_interval),
            "scenario_tags": list(research.scenario_tags),
        }

    @staticmethod
    def _serialize_fusion(fusion) -> Dict[str, Any]:
        return {
            "p_star": fusion.p_star,
            "sigma": fusion.sigma,
            "z_score": fusion.z_score,
            "confidence_interval": list(getattr(fusion, "confidence_interval", [])),
            "scenario_tags": list(getattr(fusion, "scenario_tags", [])),
            "confidence_weight": getattr(fusion, "confidence_weight", 1.0),
        }

    @staticmethod
    def _serialize_intent(intent) -> Dict[str, Any]:
        return {
            "market_ticker": intent.market_ticker,
            "side": intent.side.value,
            "price_cents": intent.price_cents,
            "quantity": intent.quantity,
            "ev_per_contract": intent.ev_per_contract,
            "reason": intent.reason,
        }


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    config = load_app_config()
    app = TradingApp(config)
    try:
        results = await app.run_once()
        for entry in results:
            market = entry["market"]
            research = entry["research"]
            fusion = entry["fusion"]
            decision = entry["decision"]
            print("\n=== Market", market["ticker"], "===")
            print(f"Title: {market.get('title', '')}")
            if research is None or fusion is None:
                print("Research: unavailable (insufficient sources or LLM failure)")
                print("Fusion: skipped")
                print("Decision: no trade")
                continue
            print(f"Research p_yes={research['p_yes']:.2f} (confidence {research['confidence']:.2f})")
            if research["drivers"]:
                print("Drivers:")
                for driver in research["drivers"]:
                    print(f"  - {driver}")
            if research["caveats"]:
                print("Caveats:")
                for caveat in research["caveats"]:
                    print(f"  - {caveat}")
            print(f"Fusion p*={fusion['p_star']:.2f}, z={fusion['z_score']:.2f}")
            if decision:
                intent = decision["intent"]
                print(
                    f"Decision: {decision['status']} -> {intent['side'].upper()} at {intent['price_cents']}¢ for {intent['quantity']} (EV ${intent['ev_per_contract']:.2f})"
                )
                print(f"Reason: {intent['reason']}")
            else:
                print("Decision: no trade")
    finally:
        await app.close()


if __name__ == "__main__":
    asyncio.run(main())
