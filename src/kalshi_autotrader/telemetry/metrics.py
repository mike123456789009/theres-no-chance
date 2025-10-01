"""Telemetry helpers (logging, metrics placeholders)."""
from __future__ import annotations

import logging
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from typing import DefaultDict, Dict, Iterable, List, Tuple

from ..config.models import TelemetryConfig
from .alerts import AlertDispatcher
from .logging_setup import setup_logging
from .prometheus import PrometheusExporter

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DashboardRegistry:
    top_opportunities: List[Tuple[str, float]] = field(default_factory=list)
    ev_samples: List[float] = field(default_factory=list)
    latency_samples: DefaultDict[str, List[float]] = field(default_factory=lambda: defaultdict(list))
    strategy_ev_samples: DefaultDict[str, List[float]] = field(default_factory=lambda: defaultdict(list))
    hit_rate_samples: DefaultDict[str, List[float]] = field(default_factory=lambda: defaultdict(list))
    max_samples: int = 500

    def update_opportunities(self, entries: Iterable[Tuple[str, float]], top_n: int = 5) -> None:
        ranked = sorted(entries, key=lambda x: x[1], reverse=True)[:top_n]
        self.top_opportunities = ranked

    def update_ev_distribution(self, values: Iterable[float]) -> None:
        for value in values:
            self.ev_samples.append(float(value))
        if len(self.ev_samples) > self.max_samples:
            self.ev_samples = self.ev_samples[-self.max_samples :]

    def record_latency(self, name: str, seconds: float) -> None:
        bucket = self.latency_samples[name]
        bucket.append(float(seconds))
        if len(bucket) > self.max_samples:
            self.latency_samples[name] = bucket[-self.max_samples :]

    def record_strategy_ev(self, strategy: str, value: float) -> None:
        bucket = self.strategy_ev_samples[strategy]
        bucket.append(float(value))
        if len(bucket) > self.max_samples:
            self.strategy_ev_samples[strategy] = bucket[-self.max_samples :]

    def record_hit_rate(self, scope: str, value: float) -> None:
        bucket = self.hit_rate_samples[scope]
        bucket.append(float(value))
        if len(bucket) > self.max_samples:
            self.hit_rate_samples[scope] = bucket[-self.max_samples :]

    def render(self) -> str:
        lines: List[str] = []
        if self.top_opportunities:
            lines.append("Top Opportunities:")
            for ticker, ev in self.top_opportunities:
                lines.append(f"  {ticker:<12} EV {ev:+.3f}")
        if self.ev_samples:
            mean = statistics.mean(self.ev_samples)
            stdev = statistics.pstdev(self.ev_samples) if len(self.ev_samples) > 1 else 0.0
            lines.append(
                f"EV Distribution: mean {mean:+.3f} stdev {stdev:.3f} (n={len(self.ev_samples)})"
            )
        if self.strategy_ev_samples:
            lines.append("Strategy Overlays:")
            for name, samples in sorted(self.strategy_ev_samples.items(), key=lambda item: len(item[1]), reverse=True)[:5]:
                if not samples:
                    continue
                mean = statistics.mean(samples)
                lines.append(f"  {name:<18} mean {mean:+.3f} (n={len(samples)})")
        if self.hit_rate_samples:
            for name, samples in self.hit_rate_samples.items():
                if not samples:
                    continue
                mean = statistics.mean(samples)
                lines.append(f"HitRate[{name}]: mean {mean:.2%} (n={len(samples)})")
        for name, samples in self.latency_samples.items():
            if not samples:
                continue
            sorted_vals = sorted(samples)
            perc95 = sorted_vals[int(0.95 * (len(sorted_vals) - 1))] if len(sorted_vals) > 1 else sorted_vals[0]
            lines.append(
                f"Latency[{name}]: mean {statistics.mean(samples):.3f}s p95 {perc95:.3f}s"
            )
        return "\n".join(lines)


@dataclass(slots=True)
class TelemetryService:
    cfg: TelemetryConfig
    dashboard: DashboardRegistry = field(default_factory=DashboardRegistry)
    _prometheus: PrometheusExporter = field(init=False)
    _dispatcher: AlertDispatcher = field(init=False)

    def __post_init__(self) -> None:
        setup_logging(self.cfg)
        self._prometheus = PrometheusExporter(self.cfg)
        self._dispatcher = AlertDispatcher(self.cfg.alert_channels if self.cfg.enable_alerts else [])

    def emit_metric(self, name: str, value: float, tags: Dict[str, str] | None = None) -> None:
        if not self.cfg.enable_metrics:
            return
        logger.info("METRIC %s=%s tags=%s", name, value, tags)
        if name == "edge_ev":
            self._prometheus.observe_ev(float(value))
        if name == "shadow_pnl_dollars":
            self._prometheus.update_shadow_pnl(float(value))

    def count_order(self, status: str) -> None:
        if not self.cfg.enable_metrics:
            return
        self._prometheus.count_order(status)

    def alert(self, message: str, *, severity: str = "WARNING", **metadata: Dict[str, str]) -> None:
        if not self.cfg.enable_alerts:
            return
        logger.log(getattr(logging, severity.upper(), logging.WARNING), "ALERT: %s", message)
        self._prometheus.increment_alert(severity)
        self._dispatcher.dispatch(severity, message, **metadata)

    def update_top_opportunities(self, entries: Iterable[Tuple[str, float]]) -> None:
        if not self.cfg.enable_metrics:
            return
        self.dashboard.update_opportunities(entries)

    def update_ev_distribution(self, values: Iterable[float]) -> None:
        if not self.cfg.enable_metrics:
            return
        self.dashboard.update_ev_distribution(values)

    def record_latency(self, name: str, seconds: float) -> None:
        if not self.cfg.enable_metrics:
            return
        self.dashboard.record_latency(name, seconds)
        self._prometheus.record_latency(seconds)

    def record_strategy_ev(self, strategy: str, value: float) -> None:
        if not self.cfg.enable_metrics:
            return
        self.dashboard.record_strategy_ev(strategy, value)
        self._prometheus.observe_strategy_ev(strategy, value)

    def record_hit_rate(self, scope: str, value: float) -> None:
        if not self.cfg.enable_metrics:
            return
        self.dashboard.record_hit_rate(scope, value)
        self._prometheus.record_hit_rate(scope, value)

    def record_shadow_divergence(self, scope: str, expected: float, realized: float) -> None:
        if not self.cfg.enable_metrics:
            return
        divergence = realized - expected
        self._prometheus.record_shadow_divergence(scope, divergence)

    def render_dashboards(self) -> None:
        if not self.cfg.enable_metrics:
            return
        snapshot = self.dashboard.render()
        if snapshot:
            logger.info("DASHBOARD\n%s", snapshot)
