"""Alert routing utilities for telemetry events."""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List
from urllib import request

from ..config.models import AlertChannelConfig

logger = logging.getLogger(__name__)


SEVERITY_RANK = {
    "DEBUG": 10,
    "INFO": 20,
    "NOTICE": 25,
    "WARNING": 30,
    "ERROR": 40,
    "CRITICAL": 50,
}


def _severity_value(level: str) -> int:
    return SEVERITY_RANK.get(level.upper(), 30)


@dataclass(slots=True)
class AlertEvent:
    severity: str
    message: str
    metadata: Dict[str, Any]
    timestamp: datetime

    def to_payload(self) -> Dict[str, Any]:
        return {
            "severity": self.severity,
            "message": self.message,
            "metadata": self.metadata,
            "timestamp": self.timestamp.astimezone(timezone.utc).isoformat(),
        }


class AlertChannel:
    """Base alert channel interface."""

    def __init__(self, config: AlertChannelConfig) -> None:
        self.config = config
        self.threshold = _severity_value(config.severity_threshold)

    def enabled_for(self, severity: str) -> bool:
        return _severity_value(severity) >= self.threshold

    def send(self, event: AlertEvent) -> None:  # pragma: no cover - interface
        raise NotImplementedError


class LogAlertChannel(AlertChannel):
    def send(self, event: AlertEvent) -> None:  # pragma: no cover - simple logging
        payload = event.to_payload()
        logger.warning("ALERT ROUTE (log) %s", json.dumps(payload))


class FileAlertChannel(AlertChannel):
    def __init__(self, config: AlertChannelConfig) -> None:
        super().__init__(config)
        target = config.target or "artifacts/alerts/alerts.jsonl"
        self._path = Path(target)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def send(self, event: AlertEvent) -> None:
        payload = json.dumps(event.to_payload())
        with self._path.open("a", encoding="utf-8") as fh:
            fh.write(payload + "\n")


class SlackAlertChannel(AlertChannel):
    def __init__(self, config: AlertChannelConfig) -> None:
        super().__init__(config)
        self._webhook = config.target or os.getenv("SLACK_WEBHOOK_URL")
        if not self._webhook:
            logger.warning("Slack alert channel configured without webhook URL; alerts will be logged only.")

    def send(self, event: AlertEvent) -> None:
        payload = event.to_payload()
        if not self._webhook:
            logger.warning("Slack alert fallback -> %s", json.dumps(payload))
            return
        data = json.dumps({"text": f"[{event.severity}] {event.message}", "blocks": []}).encode("utf-8")
        req = request.Request(self._webhook, data=data, headers={"Content-Type": "application/json"})
        try:
            request.urlopen(req, timeout=5)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to deliver Slack alert: %s", exc)


class EmailAlertChannel(AlertChannel):
    def __init__(self, config: AlertChannelConfig) -> None:
        super().__init__(config)
        self._recipient = config.target or os.getenv("ALERT_EMAIL_TO")
        if not self._recipient:
            logger.warning("Email alert channel configured without recipient; alerts will be logged only.")

    def send(self, event: AlertEvent) -> None:
        payload = event.to_payload()
        logger.warning("EMAIL ALERT %s -> %s", json.dumps(payload), self._recipient or "unset")


CHANNEL_FACTORY = {
    "log": LogAlertChannel,
    "file": FileAlertChannel,
    "slack": SlackAlertChannel,
    "email": EmailAlertChannel,
}


class AlertDispatcher:
    """Routes alerts to configured channels and maintains dispatch history."""

    def __init__(self, configs: Iterable[AlertChannelConfig]) -> None:
        self._channels: List[AlertChannel] = []
        for cfg in configs:
            channel_cls = CHANNEL_FACTORY.get(cfg.type, LogAlertChannel)
            try:
                channel = channel_cls(cfg)
            except Exception as exc:  # pragma: no cover - misconfiguration
                logger.error("Failed to initialize alert channel %s: %s", cfg.type, exc)
                continue
            self._channels.append(channel)

    def dispatch(self, severity: str, message: str, **metadata: Any) -> None:
        if not self._channels:
            return
        event = AlertEvent(
            severity=severity.upper(),
            message=message,
            metadata=metadata,
            timestamp=datetime.now(timezone.utc),
        )
        for channel in self._channels:
            if channel.enabled_for(event.severity):
                channel.send(event)
