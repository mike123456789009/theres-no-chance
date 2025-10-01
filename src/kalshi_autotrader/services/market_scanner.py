"""Market discovery and streaming utilities."""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Deque, Dict, Iterable, List, Optional

from ..config.models import ScannerConfig
from ..data.models import Market, OrderBook
from ..infrastructure.kalshi_client import KalshiRestClient, KalshiWebsocketClient, resilient_stream
from .strategy_pack import StrategyPack

logger = logging.getLogger(__name__)


class MarketScannerService:
    """Discovers markets and maintains live order books."""

    def __init__(
        self,
        rest_client: KalshiRestClient,
        ws_client: KalshiWebsocketClient,
        scanner_cfg: ScannerConfig,
        strategy_pack: StrategyPack | None = None,
    ):
        self._rest = rest_client
        self._ws = ws_client
        self._cfg = scanner_cfg
        self._strategies = strategy_pack or StrategyPack(enabled=False)
        self._orderbook_cache: Dict[str, OrderBook] = {}
        self._last_heartbeat: Dict[str, datetime] = {}
        self._snapshot_history: Dict[str, Deque[Path]] = defaultdict(lambda: deque(maxlen=self._cfg.snapshot_retention))
        self._snapshot_dir: Optional[Path] = None
        self._strategy_metadata: Dict[str, Dict[str, Any]] = {}
        if self._cfg.snapshot_path:
            self._snapshot_dir = Path(self._cfg.snapshot_path).expanduser()
            self._snapshot_dir.mkdir(parents=True, exist_ok=True)

    async def list_markets(self, limit: Optional[int] = None) -> List[Market]:
        fetch_limit = self._cfg.limit
        payload = await self._rest.get_markets(limit=fetch_limit)
        markets = []
        for item in payload.get("markets", []):
            close_time = datetime.fromisoformat(item["close_time"].replace("Z", "+00:00")).astimezone(timezone.utc)
            open_time = datetime.fromisoformat(item["open_time"].replace("Z", "+00:00")).astimezone(timezone.utc)
            market = Market(
                ticker=item["ticker"],
                event_ticker=item.get("event_ticker", ""),
                title=item.get("title", ""),
                subtitle=item.get("subtitle"),
                close_ts=close_time,
                open_ts=open_time,
                rules_primary=item.get("rules_primary", ""),
                rules_secondary=item.get("rules_secondary"),
                category=item.get("category"),
                tick_size=int(item.get("tick_size", 1)),
                yes_bid=self._safe_int(item.get("yes_bid")),
                yes_ask=self._safe_int(item.get("yes_ask")),
                no_bid=self._safe_int(item.get("no_bid")),
                no_ask=self._safe_int(item.get("no_ask")),
                volume=self._safe_int(item.get("volume")),
                volume_24h=self._safe_int(item.get("volume_24h")),
                open_interest=self._safe_int(item.get("open_interest")),
            )
            markets.append((market, item))

        filtered = self._apply_filters(markets)
        strategy_metadata: Dict[str, Dict[str, Any]] = {}
        if filtered and self._strategies.enabled:
            filtered, strategy_metadata = self._strategies.apply_scan_filters(filtered)
        self._strategy_metadata = strategy_metadata
        if not filtered:
            logger.warning("No markets matched filters; falling back to top by open interest")
            filtered = self._fallback_markets(markets)
            self._strategy_metadata = {}
        if limit is not None:
            return filtered[:limit]
        return filtered

    async def get_orderbook(self, market_ticker: str) -> OrderBook:
        payload = await self._rest.get_market_order_book(market_ticker)
        return self._parse_orderbook(market_ticker, payload.get("orderbook", {}))

    async def stream_orderbook(self, market_ticker: str) -> AsyncIterator[OrderBook]:
        """Yield order book snapshots, emitting only meaningful deltas."""

        queue: asyncio.Queue[tuple[str, Optional[dict]]] = asyncio.Queue()

        async def _pump() -> None:
            async for message in resilient_stream(
                self._ws,
                channel="orderbook_updates",
                payload={"market_ticker": market_ticker},
            ):
                await queue.put(("update", message))

        async def _heartbeat() -> None:
            if self._cfg.heartbeat_seconds <= 0:
                return
            while True:
                await asyncio.sleep(self._cfg.heartbeat_seconds)
                await queue.put(("heartbeat", None))

        pump_task = asyncio.create_task(_pump())
        heartbeat_task = asyncio.create_task(_heartbeat())

        try:
            while True:
                kind, payload = await queue.get()
                if kind == "heartbeat":
                    last = self._last_heartbeat.get(market_ticker)
                    now = datetime.now(timezone.utc)
                    if last and (now - last).total_seconds() < self._cfg.heartbeat_seconds:
                        continue
                    cached = self._orderbook_cache.get(market_ticker)
                    if cached:
                        yield cached
                    continue

                orderbook_data = (payload or {}).get("orderbook") if payload else None
                if not orderbook_data:
                    continue
                parsed = self._parse_orderbook(market_ticker, orderbook_data)
                if not self._should_emit(market_ticker, parsed):
                    continue
                self._orderbook_cache[market_ticker] = parsed
                self._last_heartbeat[market_ticker] = parsed.ts
                await self._record_snapshot(parsed)
                yield parsed
        finally:
            pump_task.cancel()
            heartbeat_task.cancel()
            await asyncio.gather(pump_task, heartbeat_task, return_exceptions=True)

    def _parse_orderbook(self, market_ticker: str, data: Dict[str, Any]) -> OrderBook:
        timestamp_raw = data.get("timestamp")
        if timestamp_raw:
            ts = datetime.fromisoformat(timestamp_raw.replace("Z", "+00:00")).astimezone(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        yes_levels_raw = data.get("yes") or []
        no_levels_raw = data.get("no") or []
        yes_levels = [(int(level[0]), int(level[1])) for level in yes_levels_raw]
        no_levels = [(int(level[0]), int(level[1])) for level in no_levels_raw]
        yes_levels_dollars = [
            (float(level[0]), int(level[1])) for level in (data.get("yes_dollars") or [])
        ]
        no_levels_dollars = [
            (float(level[0]), int(level[1])) for level in (data.get("no_dollars") or [])
        ]

        return OrderBook(
            market_ticker=market_ticker,
            ts=ts,
            yes_levels=yes_levels,
            no_levels=no_levels,
            yes_levels_dollars=yes_levels_dollars,
            no_levels_dollars=no_levels_dollars,
        )

    @staticmethod
    def _safe_int(value: Any) -> Optional[int]:
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _apply_filters(self, markets: List[tuple[Market, Dict[str, Any]]]) -> List[Market]:
        keywords = [kw.lower() for kw in self._cfg.include_keywords]
        exclude_keywords = [kw.lower() for kw in self._cfg.exclude_keywords]
        excluded = tuple(self._cfg.exclude_prefixes)
        preferred_prefixes = tuple(self._cfg.target_prefixes)

        def passes_baseline(market: Market) -> bool:
            if self._cfg.min_open_interest and (market.open_interest or 0) < self._cfg.min_open_interest:
                return False
            if self._cfg.min_volume_24h and (market.volume_24h or 0) < self._cfg.min_volume_24h:
                return False
            return True

        def has_keywords(text: str) -> bool:
            if not keywords:
                return True
            return any(kw in text for kw in keywords)

        def has_excluded(text: str) -> bool:
            return any(bad in text for bad in exclude_keywords)

        preferred: List[Market] = []
        if preferred_prefixes:
            for market, raw in markets:
                if market.ticker.startswith(preferred_prefixes) and not market.ticker.startswith(excluded):
                    text = self._combine_text(market, raw)
                    if has_excluded(text) or not passes_baseline(market):
                        continue
                    preferred.append(market)
            if preferred:
                preferred.sort(key=lambda m: (m.open_interest or 0, m.volume_24h or 0), reverse=True)
                return preferred[: self._cfg.fallback_top_n]

        filtered: List[Market] = []
        for market, raw in markets:
            if market.ticker.startswith(excluded):
                continue
            combined_text = self._combine_text(market, raw)
            if has_excluded(combined_text):
                continue
            if not has_keywords(combined_text):
                continue
            if not passes_baseline(market):
                continue
            filtered.append(market)
        filtered.sort(key=lambda m: (m.open_interest or 0, m.volume_24h or 0), reverse=True)
        return filtered

    def _fallback_markets(self, markets: List[tuple[Market, Dict[str, Any]]]) -> List[Market]:
        excluded = tuple(self._cfg.exclude_prefixes)
        eligible = [
            m
            for m, _ in markets
            if not m.ticker.startswith(excluded)
        ]
        eligible.sort(key=lambda m: (m.open_interest or 0, m.volume_24h or 0), reverse=True)
        return eligible[: self._cfg.fallback_top_n]

    @staticmethod
    def _combine_text(market: Market, raw: Dict[str, Any]) -> str:
        return " ".join(
            filter(
                None,
                [market.title, market.subtitle or "", raw.get("event_ticker", "")],
            )
        ).lower()

    async def watch_markets(self, tickers: Iterable[str]) -> AsyncIterator[OrderBook]:
        """Aggregate order book streams for multiple tickers into a single iterator."""

        queue: asyncio.Queue[OrderBook] = asyncio.Queue()

        async def _consume(ticker: str) -> None:
            async for ob in self.stream_orderbook(ticker):
                await queue.put(ob)

        tasks = [asyncio.create_task(_consume(ticker)) for ticker in tickers]

        try:
            while True:
                orderbook = await queue.get()
                yield orderbook
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    def cached_orderbook(self, market_ticker: str) -> Optional[OrderBook]:
        return self._orderbook_cache.get(market_ticker)

    def get_strategy_metadata(self, market_ticker: str) -> Dict[str, Any]:
        return self._strategy_metadata.get(market_ticker, {})

    def _should_emit(self, ticker: str, latest: OrderBook) -> bool:
        previous = self._orderbook_cache.get(ticker)
        if previous is None:
            return True

        delta_price = abs((latest.best_yes_bid or 0) - (previous.best_yes_bid or 0))
        if delta_price >= self._cfg.delta_price_ticks:
            return True

        prev_bid_size = previous.yes_levels[-1][1] if previous.yes_levels else 0
        new_bid_size = latest.yes_levels[-1][1] if latest.yes_levels else 0
        if abs(new_bid_size - prev_bid_size) >= self._cfg.delta_quantity:
            return True

        prev_no_size = previous.no_levels[-1][1] if previous.no_levels else 0
        new_no_size = latest.no_levels[-1][1] if latest.no_levels else 0
        if abs(new_no_size - prev_no_size) >= self._cfg.delta_quantity:
            return True

        return False

    async def _record_snapshot(self, orderbook: OrderBook) -> None:
        if not self._snapshot_dir:
            return
        ticker = orderbook.market_ticker
        timestamp = orderbook.ts.strftime("%Y%m%dT%H%M%S%f")
        path = self._snapshot_dir / f"{ticker}_{timestamp}.json"
        payload = {
            "ticker": ticker,
            "timestamp": orderbook.ts.isoformat(),
            "yes_levels": orderbook.yes_levels,
            "no_levels": orderbook.no_levels,
        }
        try:
            await asyncio.to_thread(path.write_text, json.dumps(payload))
            history = self._snapshot_history[ticker]
            if history.maxlen and len(history) == history.maxlen and history:
                old_path = history[0]
                try:
                    old_path.unlink(missing_ok=True)
                except Exception:  # pragma: no cover
                    logger.debug("Failed to remove snapshot %s", old_path)
            history.append(path)
        except Exception as exc:  # pragma: no cover
            logger.debug("Snapshot write failed for %s: %s", ticker, exc)
