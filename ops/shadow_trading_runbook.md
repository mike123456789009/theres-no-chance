# Shadow Trading Runbook

## Purpose
- Exercise the full trading loop in dry-run mode with production strategy settings.
- Capture intent deltas, expected PnL, and telemetry for ongoing validation before live deployment.

## Execution
- Base command:
  ```bash
  scripts/shadow_runner.py --config config/demo.yml --label demo
  ```
- Override strategy toggles or environment via the referenced config file; the runner automatically namespaces artefacts under `artifacts/analytics/shadow/<label>/`.
- The tracker persists:
  - `shadow_runs.jsonl`: per-iteration aggregates (trades, expected PnL, cumulative totals, positive-EV counts).
  - `shadow_decisions.jsonl`: executed intents and blocked reasons, including strategy signal snapshots.
  - `shadow_summary.json`: rolling summary for dashboards.

## Scheduling
- Suggested cron entry (runs every 15 minutes during market hours):
  ```cron
  */15 13-21 * * 1-5 /usr/bin/env bash -lc 'cd /path/to/repo && source .venv/bin/activate && scripts/shadow_runner.py --config config/demo.yml --label demo >> artifacts/logs/shadow_cron.log 2>&1'
  ```
- CI alternative: add a GitHub Actions workflow invoking the script on a schedule with secrets-provisioned config.

## Daily Review Checklist
1. Compare `shadow_summary.json` cumulative expected PnL with benchmark series (S&P future, economic event index).
2. Inspect `shadow_decisions.jsonl` for:
   - High EV intents repeatedly blocked by strategy suppressors.
   - Divergence between expected EV and implied fill quality.
3. Verify Prometheus metrics:
   - `kalshi_autotrader_shadow_pnl_dollars`
   - `kalshi_autotrader_shadow_hit_rate{scope="shadow"}`
   - `kalshi_autotrader_shadow_divergence_dollars{scope="shadow"}`
4. Log findings and action items in the weekly ops memo.

## Incident Response
- If shadow divergence exceeds configured alert threshold or hit rate collapses by >40% day-over-day:
  1. Page the on-call quant via configured Slack webhook (`alert_channels` severity `ERROR`).
  2. Halt scheduled shadow jobs using `crontab -r` or disabling the CI workflow.
  3. Review recent strategy commits and scenario backtest reports for regressions.
  4. Document RCA and remediation in `ops/incident_log.md` (create if absent).

## Ownership
- **Shadow Operator**: monitors daily dashboards, files anomalies.
- **Quant Lead**: triages divergence, updates calibration, signs off on re-enabling jobs.
- **DevOps**: maintains cron/CI integration and Prometheus/Grafana visibility.
