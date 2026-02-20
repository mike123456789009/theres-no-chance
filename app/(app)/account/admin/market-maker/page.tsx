import type { CSSProperties } from "react";

import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminResearchRunControls } from "@/components/admin/admin-research-run-controls";
import { AdminReviewQueue } from "@/components/admin/admin-review-queue";
import {
  guardAdminPageAccess,
  loadAdminQueueMarkets,
  loadProposedMarketPreviews,
  loadResearchRuns,
} from "@/lib/admin/account-dashboard";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatPool(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeRunningRuns(runStatuses: string[]): string {
  const running = runStatuses.filter((status) => status === "running").length;
  const partial = runStatuses.filter((status) => status === "partial").length;
  const failed = runStatuses.filter((status) => status === "failed").length;
  return `${running} running • ${partial} partial • ${failed} failed`;
}

function proposalShadowByAccess(accessBadge: string): string {
  const normalized = accessBadge.trim().toLowerCase();
  if (normalized === "institution") return "#dba9b8";
  if (normalized === "private" || normalized === "restricted") return "#c9b8eb";
  if (normalized === "unlisted") return "#e7b494";
  return "#e6d06d";
}

export default async function AdminMarketMakerPage() {
  const access = await guardAdminPageAccess();
  if (!access.ok) {
    return <AdminAccessPanel access={access} />;
  }

  const [queue, runs, previews] = await Promise.all([
    loadAdminQueueMarkets(),
    loadResearchRuns(20),
    loadProposedMarketPreviews(50),
  ]);

  return (
    <section className="account-panel" aria-label="Admin market maker">
      <p className="create-kicker">Admin / Market Maker</p>
      <h1 className="create-title">Proposal pipeline + market maker controls</h1>
      <p className="create-copy">
        Review proposed markets, run AI proposal scans on demand, and approve or reject market details before opening trading.
      </p>
      <p className="create-note">
        Authenticated admin: <code>{access.adminUser.email ?? "unknown"}</code> • id <code>{access.adminUser.id}</code>
      </p>

      <AdminResearchRunControls />

      <section className="create-section" aria-label="Proposal run status">
        <h2>Proposal run status</h2>
        {runs.errorMessage ? (
          <p className="create-note" style={{ color: "#b00020" }}>
            Unable to load run history: <code>{runs.errorMessage}</code>
          </p>
        ) : runs.runs.length === 0 ? (
          <p className="create-note">No market-maker runs recorded yet.</p>
        ) : (
          <>
            <p className="create-note">
              Latest 20 runs: {summarizeRunningRuns(runs.runs.map((run) => run.status))}
            </p>
            <div className="admin-run-badge-grid" role="list" aria-label="Recent run cards">
              {runs.runs.slice(0, 8).map((run) => (
                <article key={run.id} className="admin-run-badge" role="listitem">
                  <p>
                    <strong>{run.scope}</strong> · {run.status}
                  </p>
                  <p>
                    submitted {run.proposalCounts.submitted_review} · failed {run.proposalCounts.submit_failed}
                  </p>
                  <p>{formatDate(run.startedAt)}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {queue.errorMessage ? (
        <p className="create-note" style={{ color: "#b00020" }}>
          Unable to load review queue: <code>{queue.errorMessage}</code>
        </p>
      ) : (
        <AdminReviewQueue reviewMarkets={queue.reviewMarkets} openMarkets={queue.openMarkets} />
      )}

      <section className="create-section" aria-label="Proposed market previews">
        <h2>Proposed market previews ({previews.proposals.length})</h2>
        <p className="create-note">
          Full proposal detail is embedded per card. Review status, pricing strip, and resolution rules before approve/reject.
        </p>

        {previews.errorMessage ? (
          <p className="create-note" style={{ color: "#b00020" }}>
            Unable to load proposal previews: <code>{previews.errorMessage}</code>
          </p>
        ) : previews.proposals.length === 0 ? (
          <p className="create-note">No markets currently waiting in review status.</p>
        ) : (
          <div className="markets-card-grid admin-proposal-grid">
            {previews.proposals.map((proposal) => (
              <article
                key={proposal.id}
                className="market-tile"
                style={
                  {
                    "--market-tile-shadow": proposalShadowByAccess(proposal.accessBadge),
                  } as CSSProperties
                }
              >
                <div className="market-tile-head">
                  <p className="market-tile-access">{proposal.accessBadge}</p>
                  <p className="market-tile-status">{formatStatus(proposal.status)}</p>
                </div>

                <h2 className="market-tile-question">{proposal.question}</h2>

                <div className="market-tile-probability">
                  <p className="market-tile-prob-yes">YES {formatPercent(proposal.priceYes)}</p>
                  <p className="market-tile-prob-no">NO {formatPercent(proposal.priceNo)}</p>
                </div>

                <div className="market-tile-meta">
                  <p>Pool {formatPool(proposal.poolShares)}</p>
                  <p>Closes {formatDate(proposal.closeTime)}</p>
                </div>

                {proposal.tags.length ? <p className="market-tile-tags">{proposal.tags.slice(0, 5).join(" · ")}</p> : null}

                <div className="market-tile-foot">
                  <p>Fee {(proposal.feeBps / 100).toFixed(2)}% • Creator {proposal.creatorId.slice(0, 8)}...</p>
                  <span className="market-tile-open">Reviewing</span>
                </div>

                <details className="admin-proposal-details">
                  <summary>View full proposal</summary>
                  <p className="create-note">Created: {formatDate(proposal.createdAt)}</p>
                  <p className="create-note">
                    <strong>Description</strong>
                    <br />
                    {proposal.description}
                  </p>
                  <p className="create-note">
                    <strong>Resolves YES if</strong>
                    <br />
                    {proposal.resolvesYesIf}
                  </p>
                  <p className="create-note">
                    <strong>Resolves NO if</strong>
                    <br />
                    {proposal.resolvesNoIf}
                  </p>
                  <p className="create-note">
                    <strong>Sources</strong>
                  </p>
                  {proposal.sources.length === 0 ? (
                    <p className="create-note">No proposal sources attached.</p>
                  ) : (
                    <ul className="admin-proposal-source-list">
                      {proposal.sources.map((source, index) => (
                        <li key={`${proposal.id}:${source.url}:${index}`}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.label || source.url}
                          </a>{" "}
                          <span>({source.type})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
