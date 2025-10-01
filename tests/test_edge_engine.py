from kalshi_autotrader.config.models import ExecutionConfig, RiskConfig, StrategyConfig
from kalshi_autotrader.services.edge_engine import EdgeEngineService, MicrostructureSignals
from kalshi_autotrader.services.quant_fusion import FusionOutput
from kalshi_autotrader.services.strategy_pack import build_strategy_pack


def test_taker_fee_rounding():
    risk = RiskConfig()
    exec_cfg = ExecutionConfig()
    engine = EdgeEngineService(risk, exec_cfg)
    fee = engine.taker_fee_dollars(0.35)
    assert fee == 0.02


def test_ev_threshold_gate():
    risk = RiskConfig(ev_threshold_cents=1)
    exec_cfg = ExecutionConfig()
    engine = EdgeEngineService(risk, exec_cfg)
    fusion = FusionOutput(
        p_star=0.6,
        sigma=0.05,
        z_score=1.0,
        beta_anchor=0.5,
        confidence_interval=(0.5, 0.7),
        scenario_tags=(),
        confidence_weight=0.8,
    )
    ev = engine.compute_ev(40, fusion)
    assert ev > 0


def test_edge_engine_momentum_strategy_boosts_quantity():
    cfg = StrategyConfig()
    pack = build_strategy_pack(cfg)
    risk = RiskConfig(ev_threshold_cents=1, kelly_scale=0.5)
    exec_cfg = ExecutionConfig()
    engine = EdgeEngineService(risk, exec_cfg, strategy_pack=pack)
    fusion = FusionOutput(
        p_star=0.62,
        sigma=0.04,
        z_score=1.5,
        beta_anchor=0.55,
        confidence_interval=(0.55, 0.68),
        scenario_tags=(),
        confidence_weight=1.0,
    )
    micro = MicrostructureSignals(
        spread_cents=1,
        yes_depth=250,
        no_depth=150,
        imbalance=0.2,
        momentum=0.01,
        penalty=0.0,
        liquidity_factor=0.9,
    )
    market = {"ticker": "KXTEST", "close_ts": "2099-01-01T00:00:00"}
    intent = engine.build_intent(market, fusion, 40, bankroll=1000.0, microstructure=micro, strategy_metadata={})
    assert intent is not None
    assert "momentum_overlay" in intent.strategy_signals
    assert intent.quantity > 0


def test_event_suppressor_blocks_trade():
    cfg = StrategyConfig()
    pack = build_strategy_pack(cfg)
    risk = RiskConfig(ev_threshold_cents=1)
    exec_cfg = ExecutionConfig()
    engine = EdgeEngineService(risk, exec_cfg, strategy_pack=pack)
    fusion = FusionOutput(
        p_star=0.6,
        sigma=0.04,
        z_score=1.2,
        beta_anchor=0.55,
        confidence_interval=(0.5, 0.7),
        scenario_tags=(),
        confidence_weight=0.9,
    )
    micro = MicrostructureSignals(
        spread_cents=1,
        yes_depth=200,
        no_depth=200,
        imbalance=0.0,
        momentum=0.0,
        penalty=0.0,
        liquidity_factor=1.0,
    )
    market = {"ticker": "KXTEST", "close_ts": "2099-01-01T00:00:00"}
    blocked = engine.build_intent(
        market,
        fusion,
        best_yes_bid=45,
        bankroll=1000.0,
        microstructure=micro,
        strategy_metadata={"event_suppressed": "keyword"},
    )
    assert blocked is None


def test_liquidity_drought_suppresses_trades():
    risk = RiskConfig(ev_threshold_cents=1)
    exec_cfg = ExecutionConfig()
    engine = EdgeEngineService(risk, exec_cfg)
    fusion = FusionOutput(
        p_star=0.55,
        sigma=0.03,
        z_score=0.8,
        beta_anchor=0.5,
        confidence_interval=(0.5, 0.6),
        scenario_tags=(),
        confidence_weight=0.9,
    )
    micro = MicrostructureSignals(
        spread_cents=5,
        yes_depth=5,
        no_depth=500,
        imbalance=-0.9,
        momentum=-0.02,
        penalty=0.2,
        liquidity_factor=0.2,
    )
    market = {"ticker": "KXDRY", "close_ts": "2099-01-01T00:00:00"}
    intent = engine.build_intent(market, fusion, best_yes_bid=55, bankroll=1000.0, microstructure=micro)
    assert intent is None
