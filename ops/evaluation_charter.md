# Kalshi Autotrader Evaluation Charter

## Purpose
- Establish a repeatable framework for scoring strategy overlays prior to live capital deployment.
- Align research, engineering, and operations on success metrics, guardrails, and review cadence.
- Provide auditability for pre-trade and post-trade assumptions, parameter choices, and validation outcomes.

## Scope
- Strategy packs currently enabled (`momentum_overlay`, `event_suppressor`, `pair_trade_arb`).
- Fusion pipeline revisions (confidence intervals, scenario tags, calibration updates).
- Execution sizing and liquidity rules derived from `EdgeEngineService`.
- Environments: historical backtests, out-of-sample validation sets, live shadow trading, eventual demo/live trading.

## Key Performance Indicators
- **Edge quality**: average expected value per trade, realized hit rate, and calibration error (Brier/log-loss).
- **Risk controls**: max drawdown versus daily/weekly limits, Kelly scaling adherence, variance of position sizes.
- **Execution health**: fill ratio against posted intent, slippage versus best bid/ask, order rejection/cancel rates.
- **Operational hygiene**: data freshness (order book lag, research latency), monitoring signal coverage, incident response time.

## Datasets & Inputs
- Historical market snapshots (JSONL under `artifacts/orderbooks/`), including stressed liquidity periods.
- Research outputs and audit trails (`artifacts/audit/`), tagged with confidence intervals and scenario metadata.
- Ledger/telemetry extracts capturing intents, fills, P&L, and alerts.
- External benchmarks (macro events, economic calendar) for regime annotation.

## Assumptions
- Historical order books approximate tradeable liquidity; slippage adjustments captured via configurable scenarios.
- Research confidence and scenario tags remain stable within a trading session.
- Kelly bankroll values reflect funded capital; overrides documented in risk config.
- Shadow trading operates in dry-run mode with deterministic matching and fee estimates.

## Risk Tolerances
- Daily expected loss tolerance: \$500 demo, \$1,500 production (aligned with `RiskConfig`).
- Maximum out-of-sample drawdown: 1.5× target daily limit before strategy review.
- Alert escalation if calibration error exceeds 0.1 absolute for two consecutive validation windows.
- Blocked trades due to suppressors should remain below 20% of candidates; higher rates trigger rule review.

## Deliverables
- Scenario YAMLs capturing base and stressed backtest conditions.
- Out-of-sample report (JSON + Markdown) summarizing rolling metrics and parameter picks.
- Shadow trading dashboard (Prometheus/Grafana + JSON summary) highlighting divergence from expectations.
- Weekly ops memo capturing incidents, alerts, and parameter change requests.

## Review Cadence
- **Weekly**: Ops + Strategy sync reviewing shadow performance, alerts, and outstanding incidents.
- **Bi-weekly**: Research/Engineering review of backtest and OOS metrics; decide on parameter updates.
- **Monthly**: Leadership readout summarising KPIs, risk posture, and roadmap adjustments.

## Ownership
- Evaluation lead (Quant): maintains backtest/OOS scripts and interprets metrics.
- Risk manager: validates drawdown thresholds, signs off on strategy enablement.
- DevOps: ensures monitoring/alerting pipelines and CI/CD automation remain healthy.

