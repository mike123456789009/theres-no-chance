import pytest

from kalshi_autotrader.services.quant_fusion import (
    CalibrationDatum,
    FusionInput,
    QuantFusionService,
)


def test_quant_fusion_basic():
    fusion = QuantFusionService()
    result = fusion.fuse(
        FusionInput(
            research_prob=0.65,
            base_rate=0.5,
            confidence=0.7,
            market_prob=0.48,
        )
    )
    assert 0.5 < result.p_star < 0.7
    assert result.z_score != 0
    assert 0 <= result.beta_anchor <= 1
    assert len(result.confidence_interval) == 2
    assert isinstance(result.scenario_tags, tuple)
    assert 0.0 <= result.confidence_weight <= 1.2


@pytest.mark.asyncio
async def test_quant_fusion_calibration_updates():
    class InMemoryRepo:
        def __init__(self) -> None:
            self.rows: list[tuple[float, int]] = []

        async def record_calibration(self, predicted, outcome, market_id, model_version):
            self.rows.append((predicted, outcome))

        async def fetch_calibrations(self, limit=None):
            return list(self.rows)

    repo = InMemoryRepo()
    fusion = QuantFusionService(repository=repo)

    await fusion.record_calibration(
        CalibrationDatum(predicted=0.7, outcome=1, market_id="KXTEST", model_version="v1")
    )
    await fusion.record_calibration(
        CalibrationDatum(predicted=0.4, outcome=0, market_id="KXTEST", model_version="v1")
    )

    result = fusion.fuse(
        FusionInput(
            research_prob=0.65,
            base_rate=0.55,
            confidence=0.6,
            market_prob=0.5,
        )
    )
    assert 0.55 <= result.p_star <= 0.75
    assert repo.rows
    assert len(result.confidence_interval) == 2


def test_quant_fusion_scenario_penalty_and_bonus():
    fusion = QuantFusionService()
    cautious = fusion.fuse(
        FusionInput(
            research_prob=0.6,
            base_rate=0.55,
            confidence=0.7,
            market_prob=0.5,
            confidence_interval=(0.45, 0.75),
            scenario_tags=("volatility_high",),
        )
    )
    assert "volatility_high" in cautious.scenario_tags
    assert cautious.confidence_weight < 0.7

    supportive = fusion.fuse(
        FusionInput(
            research_prob=0.6,
            base_rate=0.55,
            confidence=0.7,
            market_prob=0.5,
            confidence_interval=(0.5, 0.7),
            scenario_tags=("trend_confirmed",),
        )
    )
    assert "trend_confirmed" in supportive.scenario_tags
    assert supportive.confidence_weight >= cautious.confidence_weight
