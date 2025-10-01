"""Source adapters for research agent."""
from __future__ import annotations

import abc
import asyncio
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class ResearchSource(abc.ABC):
    """Abstract base class for structured source adapters."""

    @abc.abstractmethod
    async def gather(self, market_ticker: str) -> List[Dict[str, Any]]:
        """Return a list of source dicts with title, url, and summary."""


class _RateLimitedCachedAdapter(ResearchSource):
    """Common helper implementing simple rate limiting and TTL caching."""

    def __init__(
        self,
        name: str,
        ttl_seconds: int = 600,
        min_interval_seconds: float = 1.0,
    ) -> None:
        self._name = name
        self._ttl = ttl_seconds
        self._min_interval = max(min_interval_seconds, 0.0)
        self._cache: dict[str, tuple[float, List[Dict[str, Any]]]] = {}
        self._rate_lock = asyncio.Lock()
        self._last_call = 0.0
        self._logger = logging.getLogger(f"{__name__}.{name}")

    async def gather(self, market_ticker: str) -> List[Dict[str, Any]]:
        key = self._cache_key(market_ticker)
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

        await self._throttle()
        raw_sources = await self._fetch(market_ticker)
        deduped = self._deduplicate(raw_sources)
        if deduped:
            self._cache[key] = (now + self._ttl, deduped)
        return deduped

    async def _throttle(self) -> None:
        if self._min_interval <= 0:
            return
        async with self._rate_lock:
            now = time.monotonic()
            elapsed = now - self._last_call
            wait_for = self._min_interval - elapsed
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._last_call = time.monotonic()

    def _cache_key(self, market_ticker: str) -> str:
        return market_ticker

    def _deduplicate(self, sources: List[Dict[str, str]]) -> List[Dict[str, str]]:
        seen: set[str] = set()
        deduped: List[Dict[str, str]] = []
        for src in sources:
            url = (src.get("url") or "").strip()
            if not url:
                continue
            if url.lower() in seen:
                continue
            seen.add(url.lower())
            deduped.append(src)
        return deduped

    @abc.abstractmethod
    async def _fetch(self, market_ticker: str) -> List[Dict[str, Any]]:
        raise NotImplementedError


class StaticSourceAdapter(ResearchSource):
    """Simple adapter returning pre-configured sources (useful for testing)."""

    def __init__(self, sources: List[Dict[str, Any]]):
        self._sources = sources

    async def gather(self, market_ticker: str) -> List[Dict[str, Any]]:
        return self._sources


class NewsApiAdapter(_RateLimitedCachedAdapter):
    """Adapter for news APIs (e.g., NewsAPI, Bloomberg, custom endpoints)."""

    def __init__(
        self,
        endpoint: Optional[str],
        api_key_env: Optional[str] = None,
        auth_header: str = "X-Api-Key",
        language: str = "en",
        max_results: int = 5,
        ttl_seconds: int = 900,
        min_interval_seconds: float = 0.5,
    ) -> None:
        super().__init__("news", ttl_seconds=ttl_seconds, min_interval_seconds=min_interval_seconds)
        self._endpoint = endpoint
        self._language = language
        self._max_results = max_results
        self._auth_header = auth_header
        self._api_key_env = api_key_env
        self._api_key = os.getenv(api_key_env) if api_key_env else None
        self._timeout = 10.0

    async def _fetch(self, market_ticker: str) -> List[Dict[str, Any]]:
        if not self._endpoint or not self._api_key:
            return self._fallback_news(market_ticker, reason="missing endpoint or API key")

        params = {
            "q": market_ticker,
            "language": self._language,
            "pageSize": self._max_results,
        }

        headers = {self._auth_header: self._api_key}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(self._endpoint, params=params, headers=headers)
                response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            self._logger.warning("News fetch failed for %s (%s)", market_ticker, exc)
            return self._fallback_news(market_ticker, reason=str(exc))

        data = response.json()
        articles = data.get("articles") or data.get("data") or []
        sources: List[Dict[str, Any]] = []
        for article in articles[: self._max_results]:
            if not isinstance(article, dict):
                continue
            url = article.get("url") or article.get("link")
            if not url:
                continue
            title = article.get("title") or article.get("headline") or "News update"
            summary = article.get("description") or article.get("summary") or ""
            source_name = None
            source_payload = article.get("source")
            if isinstance(source_payload, dict):
                source_name = source_payload.get("name")
            elif isinstance(source_payload, str):
                source_name = source_payload
            sources.append(
                {
                    "title": title,
                    "url": url,
                    "summary": summary,
                    "source": source_name or "news-feed",
                    "tags": ["news", "headline"],
                }
            )

        return sources or self._fallback_news(market_ticker, reason="no results")

    def _fallback_news(self, market_ticker: str, reason: str) -> List[Dict[str, Any]]:
        self._logger.debug("Using news fallback for %s (%s)", market_ticker, reason)
        return [
            {
                "title": f"Key headlines for {market_ticker}",
                "url": f"https://news.google.com/search?q={market_ticker}",
                "summary": "Review recent headlines to validate narrative shifts and sentiment.",
                "source": "public-feed",
                "tags": ["news", "fallback"],
            }
        ]


class EconomicCalendarAdapter(_RateLimitedCachedAdapter):
    """Adapter for economic calendar APIs (e.g., FinancialModelingPrep, TradingEconomics)."""

    def __init__(
        self,
        endpoint: Optional[str],
        api_key_env: Optional[str] = None,
        ttl_seconds: int = 1800,
        min_interval_seconds: float = 1.0,
    ) -> None:
        super().__init__("calendar", ttl_seconds=ttl_seconds, min_interval_seconds=min_interval_seconds)
        self._endpoint = endpoint
        self._api_key_env = api_key_env
        self._api_key = os.getenv(api_key_env) if api_key_env else None
        self._timeout = 10.0

    async def _fetch(self, market_ticker: str) -> List[Dict[str, str]]:
        if not self._endpoint or not self._api_key:
            return self._fallback_calendar(market_ticker, "missing endpoint or API key")

        params = {
            "ticker": market_ticker,
            "limit": 5,
        }
        headers = {"Authorization": self._api_key}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(self._endpoint, params=params, headers=headers)
                response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            self._logger.warning("Calendar fetch failed for %s (%s)", market_ticker, exc)
            return self._fallback_calendar(market_ticker, str(exc))

        data = response.json()
        items = data.get("events") if isinstance(data, dict) else data
        sources: List[Dict[str, Any]] = []
        if isinstance(items, list):
            for item in items[:5]:
                if not isinstance(item, dict):
                    continue
                title = item.get("title") or item.get("event") or "Economic release"
                release_ts = item.get("datetime") or item.get("date")
                summary = item.get("description") or item.get("impact") or "Upcoming release"
                url = item.get("url") or "https://www.bls.gov/schedule/"
                sources.append(
                    {
                        "title": title,
                        "url": url,
                        "summary": f"{summary} (release: {release_ts})",
                        "source": "economic-calendar",
                        "tags": ["macro_calendar"],
                    }
                )

        return sources or self._fallback_calendar(market_ticker, "no events returned")

    def _fallback_calendar(self, market_ticker: str, reason: str) -> List[Dict[str, Any]]:
        self._logger.debug("Using calendar fallback for %s (%s)", market_ticker, reason)
        now = datetime.utcnow().isoformat()
        return [
            {
                "title": "Reference BLS release calendar",
                "url": "https://www.bls.gov/schedule/",
                "summary": f"Check official BLS releases near {market_ticker}. fetched at {now}",
                "source": "economic-calendar",
                "tags": ["macro_calendar", "fallback"],
            },
            {
                "title": "Federal Reserve FOMC calendar",
                "url": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
                "summary": "Validate proximity to FOMC decisions for rate-sensitive markets.",
                "source": "economic-calendar",
                "tags": ["macro_calendar", "policy"],
            },
        ]


class PollingDataAdapter(_RateLimitedCachedAdapter):
    """Adapter for polling/forecast data (e.g., FiveThirtyEight, DecisionDesk)."""

    def __init__(
        self,
        endpoint: Optional[str],
        api_key_env: Optional[str] = None,
        ttl_seconds: int = 3600,
        min_interval_seconds: float = 1.0,
    ) -> None:
        super().__init__("polling", ttl_seconds=ttl_seconds, min_interval_seconds=min_interval_seconds)
        self._endpoint = endpoint
        self._api_key_env = api_key_env
        self._api_key = os.getenv(api_key_env) if api_key_env else None
        self._timeout = 10.0

    async def _fetch(self, market_ticker: str) -> List[Dict[str, Any]]:
        if not self._endpoint:
            return self._fallback_polls(market_ticker, "missing endpoint")

        params = {"ticker": market_ticker}
        headers = {"Authorization": self._api_key} if self._api_key else {}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(self._endpoint, params=params, headers=headers)
                response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            self._logger.warning("Polling fetch failed for %s (%s)", market_ticker, exc)
            return self._fallback_polls(market_ticker, str(exc))

        data = response.json()
        polls = data.get("polls") if isinstance(data, dict) else data
        sources: List[Dict[str, Any]] = []
        if isinstance(polls, list):
            for poll in polls[:5]:
                if not isinstance(poll, dict):
                    continue
                candidate = poll.get("candidate") or poll.get("subject") or "Aggregate"
                pct = poll.get("pct") or poll.get("value")
                url = poll.get("url") or poll.get("source_url")
                if not url:
                    continue
                summary = f"{candidate} polling snapshot"
                if pct is not None:
                    summary = f"{candidate} polling average at {pct}%"
                sources.append(
                    {
                        "title": f"Polling update: {candidate}",
                        "url": url,
                        "summary": summary,
                        "source": poll.get("source") or "polling-data",
                        "tags": ["polling", "sentiment"],
                    }
                )

        return sources or self._fallback_polls(market_ticker, "no polling data")

    def _fallback_polls(self, market_ticker: str, reason: str) -> List[Dict[str, Any]]:
        self._logger.debug("Using polling fallback for %s (%s)", market_ticker, reason)
        return [
            {
                "title": "FiveThirtyEight elections polling average",
                "url": "https://projects.fivethirtyeight.com/polls/",
                "summary": f"Review polling trend for markets like {market_ticker} via public aggregators.",
                "source": "polling-data",
                "tags": ["polling", "fallback"],
            }
        ]


class KalshiRulebookAdapter(_RateLimitedCachedAdapter):
    """Adapter that surfaces the latest Kalshi rule text for a market."""

    def __init__(
        self,
        endpoint: Optional[str] = "https://api.elections.kalshi.com/trade-api/v2/markets",
        ttl_seconds: int = 3600,
        min_interval_seconds: float = 0.2,
    ) -> None:
        super().__init__("kalshi-rules", ttl_seconds=ttl_seconds, min_interval_seconds=min_interval_seconds)
        self._endpoint = endpoint.rstrip("/") if endpoint else None
        self._timeout = 10.0

    async def _fetch(self, market_ticker: str) -> List[Dict[str, str]]:
        if not self._endpoint:
            return self._fallback_rules(market_ticker, "missing endpoint")

        url = f"{self._endpoint}/{market_ticker}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(url)
                response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            self._logger.debug("Kalshi rule fetch failed for %s (%s)", market_ticker, exc)
            return self._fallback_rules(market_ticker, str(exc))

        data = response.json()
        market = data.get("market") if isinstance(data, dict) else data
        if isinstance(market, dict):
            primary = market.get("rules_primary") or "Refer to Kalshi rulebook"
            secondary = market.get("rules_secondary")
            summary = primary if not secondary else f"{primary}\nSecondary: {secondary}"
        else:
            summary = "Refer to Kalshi rulebook"

        return [
            {
                "title": f"Kalshi rule summary for {market_ticker}",
                "url": f"https://kalshi.com/markets/{market_ticker}",
                "summary": summary,
                "source": "kalshi-rulebook",
                "tags": ["rules"],
            }
        ]

    def _fallback_rules(self, market_ticker: str, reason: str) -> List[Dict[str, Any]]:
        self._logger.debug("Using Kalshi rule fallback for %s (%s)", market_ticker, reason)
        return [
            {
                "title": f"Kalshi market page for {market_ticker}",
                "url": f"https://kalshi.com/markets/{market_ticker}",
                "summary": "Review official Kalshi market description and rulebook page.",
                "source": "kalshi-rulebook",
                "tags": ["rules", "fallback"],
            }
        ]


class CalendarAdapter(EconomicCalendarAdapter):
    """Backwards compatible alias for EconomicCalendarAdapter."""

    def __init__(self, calendar_api: str | None = None):
        super().__init__(calendar_api)


__all__ = [
    "ResearchSource",
    "StaticSourceAdapter",
    "NewsApiAdapter",
    "EconomicCalendarAdapter",
    "PollingDataAdapter",
    "KalshiRulebookAdapter",
    "CalendarAdapter",
]
