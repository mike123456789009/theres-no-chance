import asyncio
from datetime import datetime, timezone, timedelta

import pytest

from kalshi_autotrader.config.models import ResearchProviderConfig
from kalshi_autotrader.services.research_agent import ResearchAgentService, ResearchResult
from kalshi_autotrader.research.adapters import ResearchSource
from kalshi_autotrader.services.research_agent import LlmClient


class StaticAsyncSource(ResearchSource):
    def __init__(self, sources):
        self._sources = sources

    async def gather(self, market_ticker: str):
        await asyncio.sleep(0)
        return list(self._sources)


class StubLlm(LlmClient):
    def __init__(self, payload):
        self.payload = payload

    async def complete(self, prompt: str):
        return self.payload


@pytest.mark.asyncio
async def test_research_agent_deduplicates_sources():
    cfg = ResearchProviderConfig(
        name="primary",
        provider="openai",
        model="stub-model",
        min_sources=1,
        max_attempts=1,
        min_confidence=0.1,
        approved_domains=["example.com"],
    )
    llm_payload = {
        "p_yes": 0.6,
        "p_range": [0.5, 0.7],
        "drivers": ["Demand surge"],
        "caveats": ["Volatility"],
        "sources": [
            {"title": "Duplicate", "url": "https://example.com/a", "summary": "foo"},
            {"title": "Duplicate", "url": "https://example.com/a", "summary": "foo"},
        ],
        "confidence": 0.9,
    }
    agent = ResearchAgentService(
        cfg,
        llm_client=StubLlm(llm_payload),
        source_adapters=[
            StaticAsyncSource(
                [
                    {"title": "Primary", "url": "https://example.com/a", "summary": "bar"},
                    {"title": "Secondary", "url": "https://example.com/b", "summary": "baz"},
                ]
            )
        ],
    )

    market = {"ticker": "KXTEST", "title": "Test Market", "rules_primary": "1"}
    deadline = datetime.now(timezone.utc) + timedelta(minutes=5)
    result = await agent.run_research(market, deadline)
    assert isinstance(result, ResearchResult)
    assert len(result.sources) == 2
    assert set(src["url"] for src in result.sources) == {"https://example.com/a", "https://example.com/b"}
    assert result.confidence == 0.9


@pytest.mark.asyncio
async def test_research_agent_fallback_on_low_confidence(monkeypatch, caplog):
    primary_cfg = ResearchProviderConfig(
        name="primary",
        provider="openai",
        model="model-a",
        min_confidence=0.95,
        max_attempts=1,
        fallbacks=[
            ResearchProviderConfig(
                name="fallback",
                provider="openai",
                model="model-b",
                min_confidence=0.2,
                max_attempts=1,
            )
        ],
    )

    class SequenceLLM(LlmClient):
        def __init__(self):
            self.calls = 0

        async def complete(self, prompt: str):
            self.calls += 1
            if self.calls == 1:
                return {"p_yes": 0.1, "p_range": [0.05, 0.2], "confidence": 0.3, "sources": []}
            return {"p_yes": 0.7, "p_range": [0.6, 0.8], "confidence": 0.9, "sources": []}

    sequence_llm = SequenceLLM()
    monkeypatch.setattr(
        "kalshi_autotrader.services.research_agent.build_llm_client",
        lambda cfg: sequence_llm,
    )
    agent = ResearchAgentService(
        primary_cfg,
        llm_client=sequence_llm,
        source_adapters=[StaticAsyncSource([])],
    )

    market = {"ticker": "KXFALL", "title": "Fallback Market", "rules_primary": "1"}
    deadline = datetime.now(timezone.utc) + timedelta(minutes=10)
    result = await agent.run_research(market, deadline)
    assert result.p_yes == pytest.approx(0.7)
    assert result.confidence == pytest.approx(0.9)
