"""LLM client abstraction."""
from __future__ import annotations

import abc
import json
import logging
import os
from typing import Any, Dict, List

from ..config.models import ResearchProviderConfig

logger = logging.getLogger(__name__)


class LlmClient(abc.ABC):
    @abc.abstractmethod
    async def complete(self, prompt: str) -> Dict[str, Any]:
        ...


class OpenAIClient(LlmClient):
    def __init__(self, cfg: ResearchProviderConfig):
        api_key = cfg.api_key
        if not api_key:
            key_env = cfg.api_key_env
            if not key_env:
                raise RuntimeError("OPENAI api_key_env not configured")
            api_key = os.getenv(key_env)
            if not api_key:
                raise RuntimeError(f"Environment variable {key_env} missing")
        self._api_key = api_key
        self._cfg = cfg

    async def complete(self, prompt: str) -> Dict[str, Any]:
        # Deferred import to avoid hard dependency during tests.
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self._api_key)

        logger.debug("Sending prompt to OpenAI provider")
        request_kwargs = {
            "model": self._cfg.model,
            "input": prompt,
        }
        if self._cfg.temperature is not None:
            request_kwargs["temperature"] = self._cfg.temperature
        if self._cfg.reasoning_effort:
            request_kwargs["reasoning"] = {"effort": self._cfg.reasoning_effort}
        if self._cfg.max_output_tokens:
            request_kwargs["max_output_tokens"] = self._cfg.max_output_tokens
        if self._cfg.verbosity:
            request_kwargs["text"] = {"verbosity": self._cfg.verbosity}
        response = await client.responses.create(**request_kwargs)
        text = _extract_text_from_response(response)
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse LLM JSON: %s", exc)
            raise


class DeterministicLlmClient(LlmClient):
    """Fallback client that returns a deterministic response for offline testing."""

    def __init__(self, default_prob: float = 0.5):
        self._default_prob = max(0.01, min(default_prob, 0.99))

    async def complete(self, prompt: str) -> Dict[str, Any]:
        logger.debug("Using deterministic fallback LLM response")
        p = self._default_prob
        return {
            "p_yes": p,
            "p_range": [max(0.01, p - 0.1), min(0.99, p + 0.1)],
            "drivers": ["Fallback deterministic probability"],
            "caveats": ["LLM provider unavailable; using heuristic."],
            "sources": [],
            "confidence": 0.4,
        }


def build_llm_client(cfg: ResearchProviderConfig) -> LlmClient:
    provider = cfg.provider.lower()
    if provider == "openai":
        if cfg.api_key:
            return OpenAIClient(cfg)
        key_env = cfg.api_key_env
        if key_env and os.getenv(key_env):
            return OpenAIClient(cfg)
        logger.warning("OpenAI API key env %s missing; using deterministic fallback", key_env)
        return DeterministicLlmClient()
    raise NotImplementedError(f"Provider {cfg.provider} not supported yet")


def _extract_text_from_response(response: Any) -> str:
    if hasattr(response, "output_text") and response.output_text:
        return response.output_text

    data = None
    if hasattr(response, "model_dump"):
        data = response.model_dump()
    elif hasattr(response, "to_dict"):
        data = response.to_dict()
    else:
        try:
            data = json.loads(json.dumps(response, default=lambda o: o.__dict__))
        except Exception:  # noqa: BLE001
            data = {}

    chunks: list[str] = []
    output_items = data.get("output") if isinstance(data, dict) else None
    if isinstance(output_items, list):
        for item in output_items:
            if not isinstance(item, dict):
                continue
            item_type = item.get("type")
            if item_type == "output_text":
                text_val = item.get("text")
                if isinstance(text_val, str):
                    chunks.append(text_val)
                _collect_from_content(item.get("content"), chunks)
            elif item_type == "message":
                _collect_from_content(item.get("content"), chunks)

    text = "".join(chunks)
    if text:
        return text

    logger.error("Unexpected LLM response format: %s", response)
    raise ValueError("LLM response missing textual output")


def _collect_from_content(content: Any, chunks: List[str]) -> None:
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                if part.get("type") == "output_text":
                    text_part = part.get("text")
                    if isinstance(text_part, str):
                        chunks.append(text_part)
                elif "text" in part and isinstance(part["text"], str):
                    chunks.append(part["text"])
            elif isinstance(part, str):
                chunks.append(part)
    elif isinstance(content, str):
        chunks.append(content)
