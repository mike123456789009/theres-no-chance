# Disaster Recovery & Failover Playbook

This playbook documents the procedures and tooling required to survive infrastructure failures, recover state, and restore trading operations with minimal downtime.

## 1. State Ledger Backups

- Schedule `scripts/backup_ledger.py` every 5 minutes via cron or your orchestration platform.
- Configure the job with `--output s3://<bucket>/kalshi/ledger/` (or another durable object store).
- The script snapshots all ledger tables (`research_runs`, `orders`, `fills`, `positions`, `risk_snapshots`, `ledger_metadata`) to a JSON artifact stamped with UTC.
- Verify backups daily by restoring into a staging database and running integration tests.

## 2. Warm Standby Database

- Run a managed Postgres replica in hot standby mode; configure `asyncpg` on failover host with the replica's DNS.
- Health-check replication lag; trigger promotion when lag exceeds 30 seconds for more than two consecutive checks.
- Store database credentials in Vault and rotate every 30 days.

## 3. Application Failover

- Container images are published via CI (see `.github/workflows/ci.yml`). Tag images per commit and push to an artifact registry.
- Keep two Kubernetes deployments: `trader-primary` (active) and `trader-standby` (scaled to zero). Promote standby by scaling to one replica and downgrading the active after telemetry validates health.
- All config is sourced from ConfigMaps/Secrets. Ensure both deployments reference identical config except for Kalshi keys when using dedicated accounts.

## 4. Restoring From Backup

1. Provision a clean Postgres instance.
2. Restore the latest JSON backup:
   ```bash
   python scripts/restore_ledger_from_backup.py --input /path/to/backup.json --dsn postgres://...
   ```
   *(script described below)*
3. Run `pytest tests/test_trading_app_e2e.py -k dry` against the restored environment.
4. Promote the standby application deployment and monitor Prometheus alerts for 30 minutes.

## 5. Restore Utility

- `scripts/restore_ledger_from_backup.py` (generated alongside backups) replays JSON into Postgres, truncating destination tables within a transaction.
- The script validates schema versions before ingesting and aborts if mismatched.

## 6. Telemetry & Alerts

- PagerDuty/Slack alerts fire when:
  - Ledger backup fails for more than two consecutive runs.
  - Prometheus `kalshi_autotrader_loop_latency_seconds` p95 exceeds 30 seconds.
  - Risk snapshot persistence fails.
- All alerts include correlation IDs enabling root-cause traceability.

## 7. Disaster Scenarios

| Scenario | Response |
|----------|----------|
| Primary database outage | Promote standby DB, update `AUTOTRADER_DATABASE_DSN`, redeploy pods. |
| Kalshi API downtime | Switch TradingApp to research-only mode (set execution `post_only_default=false`, disable order placement), continue shadow tracking. |
| Telemetry pipeline outage | Persist local logs/metrics (already default), queue alerts to file channel, replay once pipeline restored. |
| Ledger corruption detected | Stop trading, restore last known good backup using restore utility, replay missing fills from Kalshi API audit logs. |

## 8. Testing the Plan

- Run quarterly disaster simulations:
  - Kill the active database and verify automatic promotion.
  - Restore from a 24h-old backup and validate ledger parity versus Kalshi settlement exports.
  - Trigger simulated Slack alert delivery failure and confirm file-based alert fallback.

Maintaining this playbook as part of the repository ensures that observability, backup, and failover procedures evolve alongside the trading stack.

