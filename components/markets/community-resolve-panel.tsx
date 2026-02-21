"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ViewerResolverBond = {
  id: string;
  outcome: string;
  bondAmount: number;
  createdAt: string;
};

type ViewerChallenge = {
  id: string;
  status: string;
  challengeBondAmount: number;
  proposedOutcome: string | null;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
};

type CommunityResolvePanelProps = {
  marketId: string;
  status: string;
  resolutionWindowEndsAt: string | null;
  challengeWindowEndsAt: string | null;
  provisionalOutcome: string | null;
  resolutionOutcome: string | null;
  adjudicationRequired: boolean;
  adjudicationReason: string | null;
  yesBondTotal: number;
  noBondTotal: number;
  resolverStakeCap: number;
  challengeCount: number;
  openChallengeCount: number;
  viewerIsAuthenticated: boolean;
  viewerCanResolve: boolean;
  viewerCanChallenge: boolean;
  viewerResolverBond: ViewerResolverBond | null;
  viewerChallenge: ViewerChallenge | null;
};

type ResolveOutcome = "yes" | "no";

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
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

function parseAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

export function CommunityResolvePanel({
  marketId,
  status,
  resolutionWindowEndsAt,
  challengeWindowEndsAt,
  provisionalOutcome,
  resolutionOutcome,
  adjudicationRequired,
  adjudicationReason,
  yesBondTotal,
  noBondTotal,
  resolverStakeCap,
  challengeCount,
  openChallengeCount,
  viewerIsAuthenticated,
  viewerCanResolve,
  viewerCanChallenge,
  viewerResolverBond,
  viewerChallenge,
}: CommunityResolvePanelProps) {
  const [voteOutcome, setVoteOutcome] = useState<ResolveOutcome>("yes");
  const [voteAmount, setVoteAmount] = useState("1");
  const [challengeReason, setChallengeReason] = useState("");
  const [pendingAction, setPendingAction] = useState<"vote" | "challenge" | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const voteCapLabel = useMemo(() => formatCurrency(Math.max(1, resolverStakeCap)), [resolverStakeCap]);

  async function submitVote() {
    setStatusMessage(null);
    const amount = parseAmount(voteAmount);

    if (!Number.isFinite(amount) || amount < 1 || amount > resolverStakeCap) {
      setStatusMessage({
        kind: "error",
        text: `Resolver stake must be between $1.00 and ${voteCapLabel}.`,
      });
      return;
    }

    setPendingAction("vote");
    try {
      const response = await fetch(`/api/markets/${marketId}/resolve/bond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outcome: voteOutcome,
          bondAmount: amount,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: payload?.error || payload?.detail || "Unable to submit resolver vote.",
        });
        return;
      }

      setStatusMessage({ kind: "success", text: "Resolver vote submitted." });
      window.location.reload();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error while submitting resolver vote.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function submitChallenge() {
    setStatusMessage(null);
    const reason = challengeReason.trim();

    if (reason.length < 10) {
      setStatusMessage({ kind: "error", text: "Challenge reason must be at least 10 characters." });
      return;
    }

    if (!viewerResolverBond) {
      setStatusMessage({ kind: "error", text: "You need an out-voted resolver stake to challenge." });
      return;
    }

    setPendingAction("challenge");

    try {
      const response = await fetch(`/api/markets/${marketId}/dispute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
          proposedOutcome: viewerResolverBond.outcome,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: payload?.error || payload?.detail || "Unable to submit challenge.",
        });
        return;
      }

      setStatusMessage({ kind: "success", text: "Challenge submitted. Human adjudication is now required." });
      window.location.reload();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error while submitting challenge.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <article className="market-detail-section market-detail-community-panel" aria-label="Community resolve controls">
      <h2>Community resolve</h2>
      <p>
        YES stake {formatCurrency(yesBondTotal)} · NO stake {formatCurrency(noBondTotal)}
      </p>
      <p>
        Resolution window ends: <strong>{formatDate(resolutionWindowEndsAt)}</strong>
      </p>
      <p>
        Challenge window ends: <strong>{formatDate(challengeWindowEndsAt)}</strong>
      </p>
      <p>
        Provisional outcome: <strong>{formatStatus(provisionalOutcome)}</strong> · Current outcome: <strong>{formatStatus(resolutionOutcome)}</strong>
      </p>
      <p>
        Challenges: <strong>{challengeCount}</strong> total, <strong>{openChallengeCount}</strong> open
      </p>

      {adjudicationRequired ? (
        <p className="market-detail-callout market-detail-callout-warning">
          Human adjudication required ({formatStatus(adjudicationReason)}).
        </p>
      ) : (
        <p className="market-detail-callout market-detail-callout-info">
          If there is no challenge, the initial community vote finalizes automatically after the challenge window.
        </p>
      )}

      {viewerResolverBond ? (
        <p>
          Your resolver stake: <strong>{formatStatus(viewerResolverBond.outcome)}</strong> for {formatCurrency(viewerResolverBond.bondAmount)}
        </p>
      ) : null}

      {viewerChallenge ? (
        <p>
          Your challenge: <strong>{formatStatus(viewerChallenge.status)}</strong> · Bond {formatCurrency(viewerChallenge.challengeBondAmount)}
        </p>
      ) : null}

      {!viewerIsAuthenticated ? (
        <div className="market-detail-action-links">
          <Link href="/login">Log in to resolve</Link>
          <Link href="/signup">Create account</Link>
        </div>
      ) : null}

      {viewerCanResolve ? (
        <section className="market-detail-inline-form" aria-label="Submit resolver vote">
          <h3>Submit resolver vote</h3>
          <p>Stake between $1.00 and {voteCapLabel}. One vote per resolver per market.</p>
          <div className="market-detail-inline-row">
            <label>
              Outcome
              <select value={voteOutcome} onChange={(event) => setVoteOutcome(event.target.value as ResolveOutcome)}>
                <option value="yes">YES</option>
                <option value="no">NO</option>
              </select>
            </label>
            <label>
              Stake (USD)
              <input
                type="number"
                min={1}
                max={Math.max(1, resolverStakeCap)}
                step="0.01"
                value={voteAmount}
                onChange={(event) => setVoteAmount(event.target.value)}
              />
            </label>
          </div>
          <button type="button" onClick={submitVote} disabled={pendingAction !== null}>
            {pendingAction === "vote" ? "Submitting..." : "Submit vote"}
          </button>
        </section>
      ) : null}

      {viewerCanChallenge ? (
        <section className="market-detail-inline-form" aria-label="Submit challenge">
          <h3>Challenge provisional outcome</h3>
          <p>
            Only out-voted resolvers can challenge. Challenge stake is a mandatory exact double-down of your original resolver stake.
          </p>
          <label>
            Why is the provisional outcome wrong?
            <textarea
              rows={3}
              minLength={10}
              maxLength={1000}
              value={challengeReason}
              onChange={(event) => setChallengeReason(event.target.value)}
              placeholder="Provide the evidence and reasoning for challenge."
            />
          </label>
          <button type="button" onClick={submitChallenge} disabled={pendingAction !== null}>
            {pendingAction === "challenge" ? "Submitting..." : "Submit challenge"}
          </button>
        </section>
      ) : null}

      {statusMessage ? (
        <p className={statusMessage.kind === "error" ? "market-detail-callout market-detail-callout-error" : "market-detail-callout market-detail-callout-success"}>
          {statusMessage.text}
        </p>
      ) : null}

      {status !== "finalized" ? (
        <p className="market-detail-copy-muted">Final outcome is only set by a human when there is a tie or at least one valid challenge.</p>
      ) : null}
    </article>
  );
}
