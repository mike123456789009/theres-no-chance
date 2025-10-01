"""Centralized logging configuration with correlation IDs and structured output."""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from pythonjsonlogger import jsonlogger

from ..config.models import TelemetryConfig

_CORRELATION_ID: ContextVar[str | None] = ContextVar("correlation_id", default=None)
_TRACE_ID: ContextVar[str | None] = ContextVar("trace_id", default=None)
_CONFIGURED = "_kalshi_logging_configured"


class CorrelationIdFilter(logging.Filter):
    """Inject correlation and trace IDs into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = _CORRELATION_ID.get() or "-"
        record.trace_id = _TRACE_ID.get() or "-"
        return True


def generate_correlation_id() -> str:
    return uuid4().hex


def generate_trace_id() -> str:
    return uuid4().hex


def set_correlation_id(value: str | None) -> None:
    _CORRELATION_ID.set(value)


def set_trace_id(value: str | None) -> None:
    _TRACE_ID.set(value)


def current_correlation_id() -> str | None:
    return _CORRELATION_ID.get()


def current_trace_id() -> str | None:
    return _TRACE_ID.get()


@contextmanager
def correlation_scope(correlation_id: str | None = None, trace_id: str | None = None) -> Iterator[None]:
    """Context manager that applies correlation/trace identifiers for nested logs."""

    token_corr = _CORRELATION_ID.set(correlation_id or generate_correlation_id())
    token_trace = _TRACE_ID.set(trace_id or generate_trace_id())
    try:
        yield
    finally:
        _CORRELATION_ID.reset(token_corr)
        _TRACE_ID.reset(token_trace)


def setup_logging(cfg: TelemetryConfig) -> None:
    """Configure structured logging only once."""

    root = logging.getLogger()
    if getattr(root, _CONFIGURED, False):
        if cfg.log_level:
            root.setLevel(cfg.log_level)
        return

    log_level = cfg.log_level or os.getenv("KALSHI_LOG_LEVEL", "INFO").upper()
    root.setLevel(log_level)

    log_dir = Path(cfg.log_dir or "artifacts/logs")
    log_dir.mkdir(parents=True, exist_ok=True)

    handlers: list[logging.Handler] = []
    stream_handler = logging.StreamHandler()
    handlers.append(stream_handler)

    file_handler = logging.FileHandler(log_dir / "kalshi_trading.log", encoding="utf-8")
    handlers.append(file_handler)

    filt = CorrelationIdFilter()
    formatter: logging.Formatter
    if cfg.structured_logging:
        formatter = jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
    else:
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)s [corr=%(correlation_id)s trace=%(trace_id)s] %(name)s: %(message)s"
        )

    for handler in handlers:
        handler.setFormatter(formatter)
        handler.addFilter(filt)
        root.addHandler(handler)

    setattr(root, _CONFIGURED, True)
