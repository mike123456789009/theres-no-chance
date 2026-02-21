"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ResolutionMarket = {
  id: string;
  question: string;
  status: string;
  resolutionMode: string;
  closeTime: string;
  resolvedAt: string | null;
  finalizedAt: string | null;
  resolutionOutcome: string | null;
  provisionalOutcome: string | null;
  resolutionWindowEndsAt: string | null;
  challengeWindowEndsAt: string | null;
  adjudicationRequired: boolean;
  adjudicationReason: string | null;
  yesBondTotal: number;
  noBondTotal: number;
  challengeCount: number;
  openChallengeCount: number;
  creatorId: string;
  tags: string[];
};

type ResolveOutcome = "yes" | "no";

type AdminResolutionQueueProps = {
  autoFinalizable: ResolutionMarket[];
  adjudicationRequired: ResolutionMarket[];
  finalizedMarkets: ResolutionMarket[];
};

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStatus(value: string | null): string {
  if (!value) return "N/A";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AdminResolutionQueue({ autoFinalizable, adjudicationRequired, finalizedMarkets }: AdminResolutionQueueProps) {
  const router = useRouter();
  const [isPendingAction, setIsPendingAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function finalizeMarket(marketId: string, outcome?: ResolveOutcome) {
    setStatusMessage(null);
    const actionKey = `finalize:${marketId}:${outcome ?? "auto"}`;
    setIsPendingAction(actionKey);

    try {
      const response = await fetch(`/api/admin/markets/${marketId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ outcome: outcome ?? null }),
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; detail?: string }
        | null;

      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: result?.error ?? result?.detail ?? "Market finalization failed.",
        });
        return;
      }

      setStatusMessage({
        kind: "success",
        text: result?.message ?? "Market finalized.",
      });
      router.refresh();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error during market finalization.",
      });
    } finally {
      setIsPendingAction(null);
    }
  }

  return (
    <div className="admin-queue-wrap">
      {statusMessage ? (
        <p className={statusMessage.kind === "error" ? "admin-queue-status admin-queue-error" : "admin-queue-status admin-queue-success"}>
          {statusMessage.text}
        </p>
      ) : null}

      <section className="admin-queue-section" aria-label="Auto-finalizable markets">
        <div className="admin-queue-header">
          <h2>Auto-finalizable</h2>
          <p>{autoFinalizable.length} markets</p>
        </div>

        {autoFinalizable.length === 0 ? (
          <p className="admin-queue-empty">No markets are waiting for automatic finalization right now.</p>
        ) : (
          <div className="admin-queue-list">
            {autoFinalizable.map((market) => {
              const pendingFinalize = isPendingAction === `finalize:${market.id}:auto`;
              const pendingAny = Boolean(isPendingAction);

              return (
                <article key={market.id} className="admin-queue-card">
                  <p className="admin-queue-badge">Auto</p>
                  <h3>{market.question}</h3>
                  <p>Status: {formatStatus(market.status)}</p>
                  <p>Provisional outcome: {formatStatus(market.provisionalOutcome)}</p>
                  <p>Challenge window ended: {formatDate(market.challengeWindowEndsAt)}</p>
                  <p>YES / NO stake: {formatCurrency(market.yesBondTotal)} / {formatCurrency(market.noBondTotal)}</p>
                  <p>Open challenges: {market.openChallengeCount}</p>
                  <p>
                    Creator id: <code>{market.creatorId}</code>
                  </p>
                  {market.tags.length ? <p>Tags: {market.tags.join(", ")}</p> : null}

                  <div className="admin-queue-actions">
                    <button type="button" onClick={() => finalizeMarket(market.id)} disabled={pendingAny}>
                      {pendingFinalize ? "Finalizing..." : "Finalize now"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-queue-section" aria-label="Adjudication-required markets">
        <div className="admin-queue-header">
          <h2>Human adjudication required</h2>
          <p>{adjudicationRequired.length} markets</p>
        </div>

        {adjudicationRequired.length === 0 ? (
          <p className="admin-queue-empty">No markets currently require human adjudication.</p>
        ) : (
          <div className="admin-queue-list">
            {adjudicationRequired.map((market) => {
              const pendingYes = isPendingAction === `finalize:${market.id}:yes`;
              const pendingNo = isPendingAction === `finalize:${market.id}:no`;
              const pendingAny = Boolean(isPendingAction);

              return (
                <article key={market.id} className="admin-queue-card">
                  <p className="admin-queue-badge admin-queue-badge-open">Adjudicate</p>
                  <h3>{market.question}</h3>
                  <p>Status: {formatStatus(market.status)}</p>
                  <p>Reason: {formatStatus(market.adjudicationReason)}</p>
                  <p>Provisional outcome: {formatStatus(market.provisionalOutcome)}</p>
                  <p>YES / NO stake: {formatCurrency(market.yesBondTotal)} / {formatCurrency(market.noBondTotal)}</p>
                  <p>Challenges: {market.challengeCount} total ({market.openChallengeCount} open)</p>
                  <p>Resolved at: {formatDate(market.resolvedAt)}</p>
                  <p>
                    Creator id: <code>{market.creatorId}</code>
                  </p>

                  <div className="admin-queue-actions">
                    <button type="button" onClick={() => finalizeMarket(market.id, "yes")} disabled={pendingAny}>
                      {pendingYes ? "Finalizing..." : "Finalize YES"}
                    </button>
                    <button type="button" onClick={() => finalizeMarket(market.id, "no")} disabled={pendingAny}>
                      {pendingNo ? "Finalizing..." : "Finalize NO"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-queue-section" aria-label="Finalized markets">
        <div className="admin-queue-header">
          <h2>Finalized</h2>
          <p>{finalizedMarkets.length} markets</p>
        </div>

        {finalizedMarkets.length === 0 ? (
          <p className="admin-queue-empty">No finalized markets found in this queue window.</p>
        ) : (
          <div className="admin-queue-list">
            {finalizedMarkets.map((market) => (
              <article key={market.id} className="admin-queue-card">
                <p className="admin-queue-badge">Finalized</p>
                <h3>{market.question}</h3>
                <p>Outcome: {formatStatus(market.resolutionOutcome)}</p>
                <p>Finalized at: {formatDate(market.finalizedAt)}</p>
                <p>Resolved at: {formatDate(market.resolvedAt)}</p>
                <p>YES / NO stake: {formatCurrency(market.yesBondTotal)} / {formatCurrency(market.noBondTotal)}</p>
                <p>
                  Creator id: <code>{market.creatorId}</code>
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
