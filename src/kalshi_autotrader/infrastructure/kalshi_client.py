"""Kalshi API client abstractions."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
from pathlib import Path
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, Optional

import httpx
import websockets
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from tenacity import (
    RetryError,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..config.models import KalshiApiConfig

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class KalshiCredentials:
    api_key_id: str
    private_key_pem: str


class KalshiRestClient:
    """Thin wrapper around Kalshi REST endpoints."""

    def __init__(self, cfg: KalshiApiConfig):
        self._cfg = cfg
        self._client = httpx.AsyncClient(
            base_url=str(cfg.rest_base_url),
            timeout=cfg.request_timeout_seconds,
        )
        self._cfg = cfg
        self._credentials = self._load_credentials(cfg)
        self._private_key = None
        if self._credentials.private_key_pem and not cfg.dry_run:
            self._private_key = serialization.load_pem_private_key(
                self._credentials.private_key_pem.encode("utf-8"), password=None
            )

    async def close(self) -> None:
        await self._client.aclose()

    @staticmethod
    def _load_credentials(cfg: KalshiApiConfig) -> KalshiCredentials:
        api_key_id = cfg.api_key_id or None
        if not api_key_id and cfg.api_key_id_env:
            api_key_id = os.getenv(cfg.api_key_id_env)
        if not api_key_id:
            api_key_id = os.getenv("KALSHI_API_KEY_ID")
        if not api_key_id:
            raise RuntimeError("Kalshi API key ID missing; set api_key_id or KALSHI_API_KEY_ID")

        if cfg.dry_run:
            logger.info("Dry run enabled; skipping private key load")
            return KalshiCredentials(api_key_id=api_key_id, private_key_pem="")

        private_key_data: str | None = cfg.private_key
        key_path = cfg.private_key_path
        if not key_path:
            env_path = os.getenv("KALSHI_PRIVATE_KEY_PATH")
            if env_path:
                key_path = Path(env_path)
        if isinstance(key_path, str):
            key_path = Path(key_path)
        if isinstance(key_path, Path):
            if not key_path.exists():
                raise RuntimeError(f"Kalshi private key path not found: {key_path}")
            private_key_data = key_path.read_text(encoding="utf-8")

        if private_key_data is None:
            key_env_value = cfg.private_key_env or os.getenv("KALSHI_PRIVATE_KEY_PEM")
            if key_env_value:
                private_key_data = key_env_value.replace("\\n", "\n")

        if private_key_data is None:
            raise RuntimeError("Kalshi private key not provided; set private_key_path or private_key_env")

        normalized = KalshiRestClient._normalize_pem(private_key_data)
        return KalshiCredentials(api_key_id=api_key_id, private_key_pem=normalized)

    @staticmethod
    def _normalize_pem(raw: str) -> str:
        cleaned = raw.strip().replace("\\n", "\n")
        if "-----BEGIN" not in cleaned:
            cleaned = "-----BEGIN RSA PRIVATE KEY-----\n" + cleaned
        if "-----END" not in cleaned:
            cleaned = cleaned.rstrip("\n") + "\n-----END RSA PRIVATE KEY-----"
        return cleaned

    async def _authed_headers(
        self, method: str, path: str, body: Optional[str] = None
    ) -> Dict[str, str]:
        if not self._private_key:
            raise RuntimeError("Private key not loaded; cannot sign authenticated request")
        timestamp = str(int(time.time() * 1000))
        message = f"{timestamp}{method.upper()}{path}".encode("utf-8")
        signature = self._private_key.sign(
            message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH,
            ),
            hashes.SHA256(),
        )
        headers = {
            "KALSHI-ACCESS-KEY": self._credentials.api_key_id,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(signature).decode("utf-8"),
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        return headers

    @retry(
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type(httpx.HTTPError),
        reraise=True,
    )
    async def get_markets(self, **params: Any) -> Dict[str, Any]:
        logger.debug("Fetching markets with params=%s", params)
        response = await self._client.get("/markets", params=params)
        response.raise_for_status()
        return response.json()

    async def get_market_order_book(self, ticker: str) -> Dict[str, Any]:
        logger.debug("Fetching orderbook for %s", ticker)
        response = await self._client.get(f"/markets/{ticker}/orderbook")
        response.raise_for_status()
        return response.json()

    async def create_order(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if self._cfg.dry_run:
            logger.info("Dry run enabled; skipping order send: %s", payload)
            return {"status": "dry_run", "sent_at": time.time()}
        path = "/trade-api/v2/portfolio/orders"
        body = json.dumps(payload)
        headers = await self._authed_headers("POST", path, body)
        response = await self._client.post("/portfolio/orders", content=body, headers=headers)
        response.raise_for_status()
        return response.json()

    async def cancel_order(self, order_id: str) -> Dict[str, Any]:
        if self._cfg.dry_run:
            logger.info("Dry run cancel for order %s", order_id)
            return {"status": "dry_run", "order_id": order_id}
        path = f"/trade-api/v2/portfolio/orders/{order_id}"
        headers = await self._authed_headers("DELETE", path)
        response = await self._client.delete(f"/portfolio/orders/{order_id}", headers=headers)
        response.raise_for_status()
        return response.json()


class KalshiWebsocketClient:
    """Maintains a connection to Kalshi WebSocket feeds."""

    def __init__(self, cfg: KalshiApiConfig):
        self._cfg = cfg
        self._credentials = KalshiRestClient._load_credentials(cfg)

    async def subscribe(self, channel: str, payload: Dict[str, Any]) -> AsyncIterator[Dict[str, Any]]:
        """Yield messages from a subscription."""
        uri = str(self._cfg.websocket_url)
        async with websockets.connect(uri, ping_interval=None) as ws:
            await self._authenticate(ws)
            message = {"type": "subscribe", "channel": channel, "payload": payload}
            await ws.send(json.dumps(message))
            async for raw in ws:
                yield json.loads(raw)

    async def _authenticate(self, ws: websockets.WebSocketClientProtocol) -> None:
        # Public channels (order books, trades) do not require authentication.
        # Authenticated channels can be added here following Kalshi's specs if needed.
        return


async def resilient_stream(client: KalshiWebsocketClient, channel: str, payload: Dict[str, Any]) -> AsyncIterator[Dict[str, Any]]:
    """Reconnect loop for WebSocket streaming."""
    attempt = 0
    while True:
        try:
            async for msg in client.subscribe(channel, payload):
                yield msg
        except (websockets.ConnectionClosedError, websockets.ConnectionClosedOK, TimeoutError, RetryError) as exc:
            attempt += 1
            backoff = min(60, (2 ** attempt) + (attempt * 0.5))
            logger.warning("WebSocket disconnected (%s); retrying in %ss", exc, backoff)
            await asyncio.sleep(backoff)
        except Exception:  # pragma: no cover - log unexpected errors and continue
            logger.exception("Unexpected websocket error; restarting stream")
            await asyncio.sleep(5)
            continue
        else:
            attempt = 0
