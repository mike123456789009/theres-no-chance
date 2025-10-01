# Operations Runbook

## Deployment & Scheduling

- **Systemd service** (example `/etc/systemd/system/kalshi-autotrader.service`):
  ```ini
  [Unit]
  Description=Kalshi Autotrader
  After=network.target

  [Service]
  WorkingDirectory=/opt/kalshi-autotrader
  Environment=KALSHI_AUTOTRADER_ENV=production
  ExecStart=/opt/kalshi-autotrader/.venv/bin/python scripts/auto_paper.py --duration-minutes 0 --interval-seconds 30
  Restart=always
  RestartSec=10
  StandardOutput=journal
  StandardError=journal

  [Install]
  WantedBy=multi-user.target
  ```
  Reload systemd after editing (`sudo systemctl daemon-reload`) and enable (`sudo systemctl enable --now kalshi-autotrader`).

- **Cron (fallback)**: Add to crontab for periodic paper loop with health ping.
  ```cron
  */5 * * * * cd /opt/kalshi-autotrader && ./.venv/bin/python scripts/auto_paper.py --duration-minutes 4 --interval-seconds 60 >> logs/auto_paper.log 2>&1
  ```
  Pair with a watchdog (e.g., `systemd --user` or AWS supervisor) for auto-restart.

## Health Checks

- `scripts/control_panel.py research --limit 1` ensures ledger connectivity and verifies the latest research run.
- `scripts/healthcheck.py` (create as wrapper invoking REST ping, optional) should return non-zero on failure for external monitors.
- Monitor log stream for `DASHBOARD` outputs and `RISK ALERT` warnings. Missing dashboards for >2 intervals implies stalled loop.

## Manual Interventions

- **Pause trading**: add target ticker to overrides via `scripts/control_panel.py overrides add KXTICKER`. The risk manager reloads overrides automatically.
- **Force unwind**: `scripts/control_panel.py unwind KXTICKER 50 --side yes` queues a control command processed next loop, placing an offsetting order.
- **Research audit**: `scripts/control_panel.py research --limit 10` prints recent probability estimates with drivers/caveats.

## Escalation Path

1. **IO errors / API outages** → Verify Kalshi status page, rotate credentials; if unresolved >15 min, escalate to trading lead.
2. **Risk stop-outs triggered** (`RISK ALERT: Stop-out...`) → trading lead acknowledges, review exposures via ledger snapshots, decide on manual overrides/unwinds.
3. **Persistent telemetry failures** (no dashboard, healthcheck failing twice) → restart service (`systemctl restart kalshi-autotrader`). If recurring, escalate to engineering on-call.

## SLA Targets

- Trading loop latency p95 < 5s (tracked in dashboard).
- Recovery from WebSocket disconnect within 2 minutes (resilient stream backoff).
- Manual override commands executed within a single trading loop (<60s).
- Research backlog < 5 markets; escalate if >3 consecutive loops lacking research results due to provider errors.
