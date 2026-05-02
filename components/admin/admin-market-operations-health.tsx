import type { MarketOperationsHealth } from "@/lib/admin/market-operations-health";

type AdminMarketOperationsHealthProps = {
  health: MarketOperationsHealth;
};

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function summarizeRun(run: MarketOperationsHealth["latestPublicRun"]): string {
  if (!run) return "No run recorded";
  return `${run.status} · submitted ${run.proposalCounts.submitted_review} · failed ${run.proposalCounts.submit_failed} · ${formatDate(run.startedAt)}`;
}

export function AdminMarketOperationsHealth(props: Readonly<AdminMarketOperationsHealthProps>) {
  const { health } = props;
  const lifecycleSummary = [
    ["Review", health.marketCountsByStatus.review ?? 0],
    ["Open", health.marketCountsByStatus.open ?? 0],
    ["Halted", health.marketCountsByStatus.trading_halted ?? 0],
    ["Closed", health.marketCountsByStatus.closed ?? 0],
    ["Voting", health.marketCountsByStatus.pending_resolution ?? 0],
    ["Resolved", health.marketCountsByStatus.resolved ?? 0],
    ["Finalized", health.marketCountsByStatus.finalized ?? 0],
  ];

  return (
    <section className="create-section admin-health-panel" aria-label="Market operations health">
      <div className="admin-health-header">
        <div>
          <p className="create-kicker">Market operations health</p>
          <h2>Production lifecycle status</h2>
        </div>
        <p className={health.readHealth === "ok" ? "admin-health-pill is-ok" : "admin-health-pill is-error"}>
          Supabase read {health.readHealth}
        </p>
        <p className={health.serviceRoleHealth === "ok" ? "admin-health-pill is-ok" : "admin-health-pill is-error"}>
          Service role {health.serviceRoleHealth}
        </p>
      </div>

      {health.errorMessage ? (
        <p className="create-note tnc-error-text">
          Health loader warning: <code>{health.errorMessage}</code>
        </p>
      ) : null}

      <div className="admin-run-summary-grid" role="list" aria-label="Market operation counters">
        <p>
          <strong>{health.reviewCount}</strong>
          <br />
          Review markets
        </p>
        <p>
          <strong>{health.openCount}</strong>
          <br />
          Open markets
        </p>
        <p>
          <strong>{health.closedUnresolvedCount}</strong>
          <br />
          Closed / unresolved
        </p>
        <p>
          <strong>{health.noActionRetirementCandidates}</strong>
          <br />
          No-action retirement candidates
        </p>
        <p>
          <strong>{health.staleClosedMarkets}</strong>
          <br />
          Stale closed markets
        </p>
      </div>

      <div className="admin-health-lifecycle" aria-label="Market counts by lifecycle status">
        {lifecycleSummary.map(([label, count]) => (
          <p key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </p>
        ))}
      </div>

      <div className="admin-health-split">
        <div>
          <h3>Automation freshness</h3>
          <p className="create-note">
            Latest scan: {health.automationFreshness.latestStatus ?? "not recorded"} · started{" "}
            {formatDate(health.automationFreshness.latestStartedAt)} · completed{" "}
            {formatDate(health.automationFreshness.latestCompletedAt)}
          </p>
          <p className="create-note">Public scan: {summarizeRun(health.latestPublicRun)}</p>
          <p className="create-note">Institution scan: {summarizeRun(health.latestInstitutionRun)}</p>
          <p className="create-note">Latest cron summary: {health.latestCronSummary ?? "Not persisted yet"}</p>
        </div>

        <div>
          <h3>Latest failures</h3>
          {health.latestFailures.length === 0 ? (
            <p className="create-note">No recent automation failures.</p>
          ) : (
            <ul className="admin-health-failure-list">
              {health.latestFailures.map((failure) => (
                <li key={failure.id}>
                  <strong>{failure.scope}</strong> · {failure.status} · {formatDate(failure.startedAt)}
                  {failure.errorMessage ? <span>{failure.errorMessage}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
