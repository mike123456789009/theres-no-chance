# Monitoring & Alerts Runbook

## Metrics
- `kalshi_autotrader_edge_ev_cents`: per-decision EV histogram.
- `kalshi_autotrader_strategy_ev_cents{strategy=…}`: overlay-adjusted EV samples.
- `kalshi_autotrader_shadow_pnl_dollars`: cumulative expected PnL from shadow runs.
- `kalshi_autotrader_shadow_hit_rate{scope=…}`: fraction of positive-EV trades.
- `kalshi_autotrader_shadow_divergence_dollars{scope=…}`: realized – expected PnL for shadow/live environments.
- `kalshi_autotrader_loop_latency_seconds`: trading loop latency.
- `kalshi_autotrader_alerts_total{severity=…}`: alert counts by severity.

## Dashboards
- **Strategy Performance**: EV distribution, overlay contributions, calibration error (from backtest reports).
- **Shadow Health**: hit rate trend (7-day MA), cumulative expected PnL, blocked ratio, divergence vs. benchmark.
- **Ops Hygiene**: loop latency, alert volume, cron/CI job status.

## Alert Thresholds
- Shadow hit rate `< 0.30` for two consecutive runs → `ERROR` via Slack webhook (`telemetry.alert_channels`).
- Blocked ratio `> 0.50` in any run → `WARNING` with market list attached.
- Shadow divergence absolute `> $250` once realized fills are available → `ERROR`.
- Backtest/OOS calibration error drift `> 0.1` (evaluated in CI job) → fail pipeline.

Configure Slack/email channels in `config/demo.yml` / `config/production.yml`:
```yaml
telemetry:
  alert_channels:
    - type: log
      severity_threshold: INFO
    - type: slack
      target: ${SHADOW_ALERT_WEBHOOK:-}
      severity_threshold: WARNING
    - type: email
      target: ops-team@example.com
      severity_threshold: ERROR
```

## Weekly Ops Review
- Mondays 14:00 UTC: review shadow dashboard, alert summary, incident log.
- Rotate on-call engineer updates runbooks after incidents.
- Archive weekly notes in `ops/weekly_ops_notes/` (create dated Markdown files).

## Incident Response
1. Acknowledge alert in Slack/email within 5 minutes.
2. Examine Prometheus panels and shadow decision logs.
3. If divergence persists, disable cron/CI shadow jobs and alert stakeholders.
4. File RCA in `ops/incident_log.md`, including remediation and validation steps.

## Ownership Matrix
- **Quant Engineering**: backtest validation, calibration updates.
- **Trading Ops**: dashboard review, incident triage, weekly summary.
- **DevOps**: metric ingestion, alert routing, CI scheduling.
