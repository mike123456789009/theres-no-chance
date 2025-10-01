"""Quantitative fusion and calibration of probabilities."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Optional, Protocol, Sequence, Tuple

import numpy as np
from sklearn.isotonic import IsotonicRegression

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class FusionInput:
    research_prob: float
    base_rate: float
    confidence: float
    market_prob: float
    microstructure_penalty: float = 0.0
    confidence_interval: Sequence[float] | None = None
    scenario_tags: Sequence[str] = ()


@dataclass(slots=True)
class FusionOutput:
    p_star: float
    sigma: float
    z_score: float
    beta_anchor: float
    confidence_interval: Tuple[float, float]
    scenario_tags: Tuple[str, ...]
    confidence_weight: float


@dataclass(slots=True)
class CalibrationDatum:
    predicted: float
    outcome: int
    market_id: Optional[str] = None
    model_version: Optional[str] = None


class CalibrationRepository(Protocol):
    async def record_calibration(
        self,
        predicted: float,
        outcome: int,
        market_id: Optional[str],
        model_version: Optional[str],
    ) -> None:
        ...

    async def fetch_calibrations(self, limit: int | None = None) -> list[tuple[float, int]]:
        ...


class QuantFusionService:
    """Blend LLM research outputs with statistical priors and learned calibration."""

    def __init__(
        self,
        calibration_points: Sequence[tuple[float, int]] | None = None,
        beta_prior: Tuple[float, float] = (1.0, 1.0),
        repository: CalibrationRepository | None = None,
    ) -> None:
        self._repository = repository
        self._alpha_prior, self._beta_prior = beta_prior
        self._alpha = float(self._alpha_prior)
        self._beta = float(self._beta_prior)
        self._calibration_points: List[tuple[float, int]] = list(calibration_points or [])
        self._iso_reg: IsotonicRegression | None = None
        self._fit_isotonic()

    async def warm_start(self, limit: int | None = None) -> None:
        """Populate calibration data from repository storage."""

        if not self._repository:
            return
        rows = await self._repository.fetch_calibrations(limit)
        if rows:
            self._calibration_points = list(rows)
            self._fit_isotonic()
            self._recompute_beta()

    def fuse(self, data: FusionInput) -> FusionOutput:
        base = float(np.clip(data.base_rate, 0.01, 0.99))
        research = float(np.clip(data.research_prob, 0.01, 0.99))
        weight = float(np.clip(data.confidence, 0.0, 1.0))

        tags = tuple(sorted({str(tag).lower() for tag in (data.scenario_tags or []) if tag}))
        penalty = max(0.0, data.microstructure_penalty)
        scenario_penalty = 0.0
        scenario_bonus = 0.0
        if set(tags) & {"volatility_high", "event_risk", "regime_shift", "headline_risk"}:
            scenario_penalty += 0.15
        if "illiquidity" in tags:
            scenario_penalty += 0.1
        if set(tags) & {"trend_confirmed", "consensus", "momentum_aligned"}:
            scenario_bonus += 0.1

        adjusted_weight = float(np.clip(weight - scenario_penalty + scenario_bonus, 0.0, 1.0))
        confidence_weight = float(np.clip(weight - scenario_penalty + scenario_bonus, 0.0, 1.2))

        combined = adjusted_weight * research + (1 - adjusted_weight) * base
        combined = max(0.01, min(0.99, combined - penalty))
        logger.debug(
            "Fusion weights -> base: %.3f, research: %.3f, combined: %.3f, penalty: %.3f, tags=%s",
            base,
            research,
            combined,
            penalty,
            tags,
        )

        if self._iso_reg:
            calibrated = float(self._iso_reg.predict([combined])[0])
        else:
            calibrated = combined

        beta_anchor = self._beta_mean()
        beta_weight = min(1.0, (self._alpha + self._beta - self._alpha_prior - self._beta_prior) / 20.0)
        p_star = (1 - beta_weight) * calibrated + beta_weight * beta_anchor

        interval = self._normalize_interval(data.confidence_interval, research)
        interval_width = interval[1] - interval[0]
        sigma_interval = max(0.01, min(0.35, interval_width / 2))
        sigma = max(sigma_interval, abs(research - base))
        if scenario_penalty:
            sigma = min(0.4, sigma * (1 + scenario_penalty))
        if scenario_bonus:
            sigma = max(0.01, sigma * (1 - min(0.3, scenario_bonus)))
        market_prob = float(np.clip(data.market_prob, 0.01, 0.99))
        z_score = (p_star - market_prob) / max(1e-4, sigma)

        return FusionOutput(
            p_star=p_star,
            sigma=sigma,
            z_score=float(z_score),
            beta_anchor=beta_anchor,
            confidence_interval=interval,
            scenario_tags=tags,
            confidence_weight=confidence_weight,
        )

    async def record_calibration(self, datum: CalibrationDatum) -> None:
        predicted = float(np.clip(datum.predicted, 0.0, 1.0))
        outcome = int(bool(datum.outcome))
        self._calibration_points.append((predicted, outcome))
        self._fit_isotonic()
        self._recompute_beta()

        if self._repository:
            await self._repository.record_calibration(
                predicted,
                outcome,
                datum.market_id,
                datum.model_version,
            )

    @staticmethod
    def _normalize_interval(
        interval: Sequence[float] | None,
        center: float,
    ) -> Tuple[float, float]:
        if (
            interval
            and isinstance(interval, Sequence)
            and not isinstance(interval, (bytes, str))
            and len(interval) == 2
        ):
            low = float(np.clip(interval[0], 0.0, 1.0))
            high = float(np.clip(interval[1], 0.0, 1.0))
            if low > high:
                low, high = high, low
            return (low, high)
        span = 0.1
        return (
            float(np.clip(center - span, 0.0, 1.0)),
            float(np.clip(center + span, 0.0, 1.0)),
        )

    def _fit_isotonic(self) -> None:
        if not self._calibration_points:
            self._iso_reg = None
            return
        probs, outcomes = zip(*self._calibration_points)
        self._iso_reg = IsotonicRegression(out_of_bounds="clip")
        self._iso_reg.fit(probs, outcomes)

    def _recompute_beta(self) -> None:
        successes = sum(outcome for _, outcome in self._calibration_points)
        total = len(self._calibration_points)
        self._alpha = self._alpha_prior + successes
        self._beta = self._beta_prior + (total - successes)

    def _beta_mean(self) -> float:
        denom = self._alpha + self._beta
        if denom <= 0:
            return 0.5
        return float(self._alpha / denom)
