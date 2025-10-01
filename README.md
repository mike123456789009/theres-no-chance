# Kalshi Autotrader

An extensible Kalshi trading engine that couples LLM-powered research with systematic execution, rich observability, and operational tooling for safe production rollout. The project targets demo trading out of the box and ships the infrastructure required to graduate toward live deployments (structured logging, Prometheus metrics, backup utilities, CI/CD, and container images).

## Repository Layout

| Path | Description |
|------|-------------|
| `src/kalshi_autotrader/` | Core application services (scanner, research, fusion, edge, risk, execution, telemetry, analytics, control center). |
| `tests/` | Pytest suites exercising end-to-end trading loops and risk management primitives. |
| `config/` | Sample YAML profiles for demo/production environments. |
| `scripts/` | Operational tooling: ledger backup/restore, shadow trading runner, analytics summarizer, control panel helpers. |
| `ops/` | Runbooks and disaster recovery playbooks. |
| `.github/workflows/` | CI pipeline running lint and tests on pushes and pull requests. |
| `Dockerfile` | Container build for reproducible deployments. |

## Core Architecture

- **MarketScannerService** – Polls Kalshi REST/WebSocket APIs, curates markets with keyword/theme filters, and maintains lightweight order book snapshots.
- **ResearchAgentService** – Orchestrates async source adapters, composes prompts, invokes LLM providers with fallback routing, and delivers structured `ResearchResult` payloads while persisting prompts for later audit.
- **QuantFusionService** – Blends research probabilities with market priors via configurable fusion logic and warm-start calibration against historical ledger data.
- **EdgeEngineService** – Computes expected value, Kelly sizing, and constructs actionable order intents respecting execution constraints.
- **RiskManager** – Tracks per-market/theme exposure, drawdown/cooldown logic, manual overrides, and persists snapshots to the ledger while exporting Prometheus P&L/margin gauges.
- **ExecutionService** – Routes orders, supports pegged and iceberg strategies, monitors fills, and emits fill-rate metrics.
- **TelemetryService** – Configures structured logging, ships metrics/alerts, exposes a Prometheus HTTP endpoint, and integrates an `AuditLogger` for immutable JSONL decision trails.
- **Analytics** – `PostTradeAnalytics` captures per-run research and EV outcomes; `ShadowPerformanceTracker` benchmarks expected PnL for paper trading comparisons.
- **ControlCenter** – Processes manual override/unwind commands persisted in the ledger.

## Getting Started

1. **Prerequisites**
   - Python 3.11+
   - (Optional) Docker for container builds
   - A Kalshi demo API key for dry-run testing

2. **Install dependencies**

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -e .[dev]
   ```

3. **Configure secrets**
   - Export `KALSHI_API_KEY_ID` (and, for live trading, `KALSHI_PRIVATE_KEY_PEM`).
   - Optional: provide `OPENAI_API_KEY` for the research agent.
   - To bypass database connections during tests, leave `AUTOTRADER_DATABASE_DSN` unset; the app gracefully degrades to in-memory mode.

4. **Run the trading loop (demo mode)**

   ```bash
   python -m kalshi_autotrader.runner
   ```

   Logs stream in JSONL format under `artifacts/logs/`, metrics are available on `http://0.0.0.0:8000/metrics` by default, and audit trails accumulate at `artifacts/audit/trading_audit.jsonl`.

5. **Container build & run**

   ```bash
   docker build -t kalshi-autotrader .
   docker run --rm -e KALSHI_API_KEY_ID=demo kalshi-autotrader
   ```

6. **Local testing & linting**

   ```bash
   pytest
   ruff check src tests
   ```

7. **Prometheus scraping**
   - Configure Prometheus to scrape the metrics endpoint exposed by the trading process (default host `0.0.0.0`, port `8000`).
   - Metrics include `kalshi_autotrader_edge_ev_cents`, `kalshi_autotrader_loop_latency_seconds`, `kalshi_autotrader_alerts_total`, and `kalshi_autotrader_shadow_pnl_dollars`.

## Observability & Alerting

- Emit structured logs with correlation IDs, success/error codes; ship to centralized logging.
- Integrate metrics (latency, P&L, fill rate) with Prometheus/Grafana and configure paging alerts (Slack, email).
- Containerize the app with reproducible builds, pinned dependencies, and health endpoints.
- Set up CI/CD with linting, tests, security scans, and deployment approvals.
- Plan failover, state backups, and disaster recovery scenarios.
- Conduct live shadow trading before enabling capital; compare against benchmarks.
- Continuously refine research prompts, signal weighting, and hedging tactics based on post-trade analytics.

### Logging & Correlation IDs
- `TelemetryService` initializes structured logging via `python-json-logger` and injects correlation/trace IDs using `telemetry.logging_setup` context variables.
- Every trading loop runs inside `correlation_scope()`, so downstream logs, metrics, and alerts can be traced end-to-end.
- Audit records (`artifacts/audit/trading_audit.jsonl`) capture prompts, research payloads, fusion outputs, and execution intents.

### Metrics & Alerts
- Prometheus exporter (`telemetry.prometheus.PrometheusExporter`) launches alongside the app, counting orders, observing EV/latency histograms, and tracking shadow-mode expected PnL.
- `AlertDispatcher` fans out alerts to log, Slack (webhook), email, or file sinks depending on `telemetry.alert_channels` configuration. File alerts land in `artifacts/alerts/alerts.jsonl` and act as a queue when paging providers are unavailable.

### Dashboards & Analytics
- `TelemetryService.dashboard` maintains lightweight in-memory dashboards for CLI inspection; metrics are also appended to analytics JSONL files for offline review.
- Post-trade analytics (`artifacts/analytics/post_trade_samples.jsonl`) feed the `scripts/analyze_post_trade.py` helper, producing confidence/EV summaries used to iterate on prompts and signal weighting.

## Operational Tooling

| Script | Purpose |
|--------|---------|
| `scripts/backup_ledger.py` | Snapshots all ledger tables to JSONL for disaster recovery. Supports config-based DSN discovery or explicit `--dsn` overrides. |
| `scripts/restore_ledger_from_backup.py` | Replays a JSON backup into a target Postgres instance, truncating tables and enforcing schema version checks. |
| `scripts/shadow_runner.py` | Executes the trading loop in dry-run mode, tracks expected PnL via `ShadowPerformanceTracker`, and publishes metrics for pre-live validation. |
| `scripts/analyze_post_trade.py` | Aggregates post-trade analytics to quantify mean EV, confidence, and decision mix. |
| `scripts/control_panel.py` | Maintains manual overrides/unwind commands consumed by `ControlCenter`. |

Additional runbooks and failover guidance live in `ops/disaster_recovery.md`, detailing backup verification, standby promotion, and alerting thresholds.

## Continuous Integration & Delivery

- GitHub Actions workflow (`.github/workflows/ci.yml`) executes linting, security scans (Bandit + pip-audit), and pytest on every push/PR.
- New Docker images can be built from `Dockerfile` and published to your registry; tag images per commit to support blue/green or canary rollouts.
- Suggested pipeline steps for production (reflected in README and workflow comments): lint → unit/integration tests → security scans → Docker build → deployment approval. The CI workflow includes a `deploy-approval` job bound to the `production` environment so releases require manual authorization.

## Disaster Recovery Highlights

- Scheduled ledger backups (see `scripts/backup_ledger.py`) should persist to resilient storage (e.g., S3/GCS).
- Hot standby databases keep replication lag under 30 seconds; promotion instructions and validation steps are documented in `ops/disaster_recovery.md`.
- Restore utility validates schema versions before ingest to avoid mismatched migrations.
- Alerts fire when backups fail twice consecutively, trading loop latency degrades, or risk snapshot persistence errors.

## Development Notes

- **Testing**: Run targeted suites (`pytest tests/test_trading_app_e2e.py -k dry`, `pytest tests/test_risk_manager.py`) before full regression runs.
- **Analytics storage**: Temporary directories can be supplied via config overrides (e.g., in tests) to isolate artifacts.
- **Extending research**: Register additional async adapters with `ResearchAgentService.register_adapter`. Prompts and results will flow automatically into audit and analytics logs.
- **Telemetry config**: Customize logging directories, metrics host/port, alert channels, and audit/analytics paths via `TelemetryConfig` in YAML or programmatic overrides.

## Roadmap Ideas

- Move pydantic validators to v2 `@field_validator` syntax to silence deprecation warnings.
- Flesh out production Kalshi client implementations and real ledger integrations.
- Add integration tests that exercise backup/restore flow against ephemeral Postgres containers.
- Wire CI to build/push Docker images and enforce policy-as-code for deployment approvals.

---

With observability, auditability, and operational safeguards baked in, this scaffold is ready for iterative strategy development, shadow trading, and eventual production deployment once live trading considerations (credentials, execution throttles, compliance) are addressed.
