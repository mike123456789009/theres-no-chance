"""Prometheus metrics exporter for trading telemetry."""
from __future__ import annotations

import logging
import threading
from typing import Optional

from prometheus_client import Counter, Gauge, Histogram, start_http_server

from ..config.models import TelemetryConfig

logger = logging.getLogger(__name__)


class PrometheusExporter:
    """Wraps Prometheus client primitives and HTTP exposition server."""

    _lock = threading.Lock()
    _server_started = False

    def __init__(self, cfg: TelemetryConfig) -> None:
        self._enabled = cfg.enable_metrics
        if not self._enabled:
            self._ev_hist: Optional[Histogram] = None
            self._latency_hist: Optional[Histogram] = None
            self._alerts_counter: Optional[Counter] = None
            self._orders_counter: Optional[Counter] = None
            self._shadow_pnl_gauge: Optional[Gauge] = None
            self._strategy_ev_hist: Optional[Histogram] = None
            self._shadow_hit_rate: Optional[Gauge] = None
            self._shadow_divergence: Optional[Gauge] = None
            return

        namespace = cfg.metrics_namespace
        self._ev_hist = Histogram(
            f"{namespace}_edge_ev_cents",
            "Edge expected value per contract in cents.",
            buckets=(0.01, 0.05, 0.10, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
        )
        self._strategy_ev_hist = Histogram(
            f"{namespace}_strategy_ev_cents",
            "Per-strategy expected value after overlays (cents).",
            labelnames=("strategy",),
            buckets=(0.01, 0.05, 0.10, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
        )
        self._latency_hist = Histogram(
            f"{namespace}_loop_latency_seconds",
            "Trading loop latency in seconds.",
        )
        self._alerts_counter = Counter(
            f"{namespace}_alerts_total",
            "Number of alerts emitted by severity.",
            labelnames=("severity",),
        )
        self._orders_counter = Counter(
            f"{namespace}_orders_total",
            "Orders submitted by status.",
            labelnames=("status",),
        )
        self._shadow_pnl_gauge = Gauge(
            f"{namespace}_shadow_pnl_dollars",
            "Shadow trading cumulative PnL in dollars.",
        )
        self._shadow_hit_rate = Gauge(
            f"{namespace}_shadow_hit_rate",
            "Observed hit rate across shadow trading executions.",
            labelnames=("scope",),
        )
        self._shadow_divergence = Gauge(
            f"{namespace}_shadow_divergence_dollars",
            "Realized minus expected PnL for shadow or live trading.",
            labelnames=("scope",),
        )

        with self._lock:
            if not PrometheusExporter._server_started:
                try:
                    start_http_server(cfg.metrics_port, addr=cfg.metrics_host)
                    PrometheusExporter._server_started = True
                    logger.info(
                        "Prometheus metrics HTTP server started on %s:%s",
                        cfg.metrics_host,
                        cfg.metrics_port,
                    )
                except OSError as exc:  # pragma: no cover - port in use or perms issue
                    logger.error("Failed to start Prometheus HTTP server: %s", exc)

    def observe_ev(self, value: float) -> None:
        if self._enabled and self._ev_hist is not None:
            self._ev_hist.observe(abs(value))

    def observe_strategy_ev(self, strategy: str, value: float) -> None:
        if self._enabled and self._strategy_ev_hist is not None:
            self._strategy_ev_hist.labels(strategy=strategy).observe(abs(value))

    def record_latency(self, seconds: float) -> None:
        if self._enabled and self._latency_hist is not None:
            self._latency_hist.observe(seconds)

    def increment_alert(self, severity: str) -> None:
        if self._enabled and self._alerts_counter is not None:
            self._alerts_counter.labels(severity=severity.upper()).inc()

    def count_order(self, status: str) -> None:
        if self._enabled and self._orders_counter is not None:
            self._orders_counter.labels(status=status).inc()

    def update_shadow_pnl(self, pnl_dollars: float) -> None:
        if self._enabled and self._shadow_pnl_gauge is not None:
            self._shadow_pnl_gauge.set(pnl_dollars)

    def record_hit_rate(self, scope: str, value: float) -> None:
        if self._enabled and self._shadow_hit_rate is not None:
            self._shadow_hit_rate.labels(scope=scope).set(value)

    def record_shadow_divergence(self, scope: str, divergence: float) -> None:
        if self._enabled and self._shadow_divergence is not None:
            self._shadow_divergence.labels(scope=scope).set(divergence)
