"""Research agent orchestrating source gathering and LLM inference."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Sequence, Optional, Tuple, Iterable

from ..config.models import ResearchProviderConfig
from ..research.adapters import ResearchSource
from ..research.prompts import PROMPT_TEMPLATE
from ..research.llm import DeterministicLlmClient, LlmClient, build_llm_client

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ResearchResult:
    p_yes: float
    p_range: Sequence[float]
    drivers: Sequence[str]
    caveats: Sequence[str]
    sources: Sequence[Dict[str, Any]]
    citations: Sequence[str]
    confidence: float
    confidence_interval: Sequence[float]
    scenario_tags: Sequence[str]
    raw: Dict[str, Any]


class ResearchAgentService:
    """High-level coordination of research workflow."""

    def __init__(
        self,
        cfg: ResearchProviderConfig,
        llm_client: LlmClient | None = None,
        source_adapters: Sequence[ResearchSource] | None = None,
    ):
        self._cfg = cfg
        self._adapters = list(source_adapters or [])
        self._provider_chain = self._build_provider_chain(cfg, llm_client)
        self._fallback_llm = DeterministicLlmClient()
        self._min_confidence = cfg.min_confidence
        self._last_prompt: str | None = None

    async def register_adapter(self, adapter: ResearchSource) -> None:
        self._adapters.append(adapter)

    async def run_research(self, market: Dict[str, Any], deadline: datetime) -> Optional[ResearchResult]:
        """Gather sources and query the LLM for a structured probability estimate."""
        sources = await self._gather_sources(market["ticker"])
        prompt = self._compose_prompt(market, deadline, sources)

        for provider_cfg, client in self._provider_chain:
            payload = await self._query_with_retries(prompt, provider_cfg, client)
            if payload is None:
                continue
            result = self._build_result(payload, sources)
            if result.confidence >= provider_cfg.min_confidence:
                logger.debug(
                    "Research provider %s succeeded for %s with confidence %.2f",
                    provider_cfg.name,
                    market.get("ticker"),
                    result.confidence,
                )
                return result
            logger.info(
                "Provider %s confidence %.2f below threshold %.2f for %s", 
                provider_cfg.name,
                result.confidence,
                provider_cfg.min_confidence,
                market.get("ticker"),
            )

        logger.warning(
            "Falling back to deterministic research for %s", market.get("ticker")
        )
        fallback_payload = await self._fallback_llm.complete(prompt)
        fallback_result = self._build_result(
            fallback_payload,
            sources,
            override_confidence=max(self._min_confidence * 0.5, 0.4),
        )
        return fallback_result

    async def _gather_sources(self, market_ticker: str) -> List[Dict[str, str]]:
        collected: List[Dict[str, str]] = []
        for adapter in self._adapters:
            adapter_sources = await adapter.gather(market_ticker)
            for src in adapter_sources:
                if self._is_approved(src):
                    collected.append(src)
        deduped = self._dedupe_sources(collected)
        if len(deduped) < self._cfg.min_sources:
            logger.info(
                "Only %s sources gathered for %s (min required %s)",
                len(deduped),
                market_ticker,
                self._cfg.min_sources,
            )
        return deduped

    def _compose_prompt(
        self,
        market: Dict[str, Any],
        deadline: datetime,
        sources: Sequence[Dict[str, str]],
    ) -> str:
        sources_json = json.dumps(sources, indent=2)
        prompt = PROMPT_TEMPLATE.format(
            title=market.get("title", market.get("ticker", "")),
            settlement_rule=market.get("rules_primary", market.get("rules_text", "N/A")),
            decision_time=deadline.astimezone(timezone.utc).isoformat(),
            sources_json=sources_json,
        )
        prompt = prompt.strip()
        self._last_prompt = prompt
        return prompt

    @property
    def last_prompt(self) -> str | None:
        return self._last_prompt

    def _is_approved(self, source: Dict[str, str]) -> bool:
        url = source.get("url", "")
        if not self._cfg.approved_domains:
            return True
        return any(domain in url for domain in self._cfg.approved_domains)

    async def _query_with_retries(
        self,
        prompt: str,
        provider_cfg: ResearchProviderConfig,
        client: LlmClient,
    ) -> Optional[Dict[str, Any]]:
        attempt = 0
        max_attempts = provider_cfg.max_attempts
        current_prompt = prompt
        while attempt < max_attempts:
            try:
                response = await client.complete(current_prompt)
                return response
            except json.JSONDecodeError as exc:
                attempt += 1
                logger.warning(
                    "Provider %s attempt %s: JSON parsing failed (%s)",
                    provider_cfg.name,
                    attempt,
                    exc,
                )
                current_prompt = current_prompt + "\nReturn ONLY valid JSON."
            except Exception as exc:  # noqa: BLE001
                attempt += 1
                logger.warning(
                    "Provider %s attempt %s: LLM request failed (%s)",
                    provider_cfg.name,
                    attempt,
                    exc,
                )
        return None

    def _build_provider_chain(
        self,
        cfg: ResearchProviderConfig,
        override_client: LlmClient | None,
    ) -> List[Tuple[ResearchProviderConfig, LlmClient]]:
        chain: List[Tuple[ResearchProviderConfig, LlmClient]] = []
        seen: set[Tuple[str, str, str]] = set()

        def _add(config: ResearchProviderConfig, client_override: LlmClient | None = None) -> None:
            key = (config.name, config.provider, config.model)
            if key in seen:
                return
            seen.add(key)
            client = client_override or build_llm_client(config)
            chain.append((config, client))
            for fallback in config.fallbacks:
                _add(fallback)

        _add(cfg, override_client)
        return chain

    def _dedupe_sources(self, sources: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen: set[str] = set()
        deduped: List[Dict[str, Any]] = []
        for src in sources:
            url = (src.get("url") or "").strip()
            if not url:
                continue
            key = url.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(src)
        return deduped

    def _coerce_interval(
        self,
        candidate: Any,
        *,
        center: float,
        default_width: float = 0.1,
        fallback: Tuple[float, float] | None = None,
    ) -> Tuple[float, float]:
        if (
            isinstance(candidate, Sequence)
            and not isinstance(candidate, (str, bytes))
            and len(candidate) == 2
            and all(isinstance(x, (int, float)) for x in candidate)
        ):
            low, high = float(candidate[0]), float(candidate[1])
            low = max(0.0, min(low, 1.0))
            high = max(0.0, min(high, 1.0))
            if low > high:
                low, high = high, low
            return (low, high)
        if fallback is not None:
            return fallback
        width = max(default_width, 0.01)
        return (
            max(0.0, center - width),
            min(1.0, center + width),
        )

    def _collect_scenario_tags(
        self,
        payload: Dict[str, Any],
        sources: Sequence[Dict[str, Any]],
    ) -> Tuple[str, ...]:
        tags: set[str] = set()
        raw_tags = payload.get("scenario_tags") or payload.get("scenarios") or []
        tags.update(self._normalize_tags(raw_tags))
        for source in sources:
            tags.update(self._normalize_tags(source.get("tags")))
        if not tags:
            volatility_flag = payload.get("volatility") or payload.get("risk_level")
            if isinstance(volatility_flag, str) and volatility_flag:
                tags.add(volatility_flag.lower())
        return tuple(sorted(tags))

    @staticmethod
    def _normalize_tags(raw: Any) -> List[str]:
        if raw is None:
            return []
        if isinstance(raw, str):
            raw = [raw]
        if not isinstance(raw, Iterable) or isinstance(raw, (bytes, str)):
            return []
        normalized: List[str] = []
        for tag in raw:
            if not tag:
                continue
            normalized.append(str(tag).strip().lower())
        return normalized

    def _build_result(
        self,
        payload: Dict[str, Any],
        gathered_sources: Sequence[Dict[str, str]],
        *,
        override_confidence: Optional[float] = None,
    ) -> ResearchResult:
        p_yes = float(payload.get("p_yes", 0.5))
        p_yes = min(max(p_yes, 0.01), 0.99)

        p_range = self._coerce_interval(payload.get("p_range"), center=p_yes, default_width=0.1)

        drivers = [str(d).strip() for d in payload.get("drivers", []) if d]
        caveats = [str(c).strip() for c in payload.get("caveats", []) if c]

        payload_sources = self._normalize_sources(payload.get("sources", []))
        combined_sources = self._dedupe_sources([*payload_sources, *gathered_sources])
        if len(combined_sources) > 10:
            combined_sources = combined_sources[:10]

        citations = [src["url"] for src in combined_sources if src.get("url")]

        confidence = float(payload.get("confidence", 0.0))
        confidence = min(max(confidence, 0.0), 1.0)
        if override_confidence is not None:
            confidence = min(max(override_confidence, 0.0), 1.0)

        confidence_interval = self._coerce_interval(
            payload.get("confidence_interval") or payload.get("credibility_interval"),
            center=p_yes,
            default_width=(p_range[1] - p_range[0]) / 2 if p_range else 0.1,
            fallback=tuple(p_range),
        )

        scenario_tags = self._collect_scenario_tags(payload, combined_sources)

        return ResearchResult(
            p_yes=p_yes,
            p_range=p_range,
            drivers=drivers,
            caveats=caveats,
            sources=combined_sources,
            citations=citations,
            confidence=confidence,
            confidence_interval=confidence_interval,
            scenario_tags=scenario_tags,
            raw=payload,
        )

    def _normalize_sources(self, sources: Any) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        if not sources:
            return normalized
        if isinstance(sources, dict):
            sources = [sources]
        if isinstance(sources, str):
            sources = [sources]
        if not isinstance(sources, Sequence):
            return normalized

        for item in sources:
            if isinstance(item, str):
                normalized.append(
                    {
                        "title": item,
                        "url": item,
                        "summary": "Referenced source from LLM response.",
                        "tags": ["llm-provided"],
                    }
                )
            elif isinstance(item, dict):
                title = str(item.get("title") or item.get("name") or "Source reference")
                url = str(item.get("url") or item.get("link") or "").strip()
                summary = str(item.get("summary") or item.get("description") or "")
                tags = self._normalize_tags(item.get("tags"))
                if url:
                    normalized.append(
                        {
                            "title": title,
                            "url": url,
                            "summary": summary,
                            "tags": tags,
                        }
                    )
        return normalized
