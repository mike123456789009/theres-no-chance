"use client";

import Link from "next/link";
import { useState } from "react";

type PrizeContribution = {
  id: string;
  contributorId: string;
  amount: number;
  status: string;
  createdAt: string;
};

type ResolverPrizeBoostCardProps = {
  marketId: string;
  viewerIsAuthenticated: boolean;
  canContribute: boolean;
  resolverPrizeLockedTotal: number;
  resolverPrizeContributionCount: number;
  recentContributions: PrizeContribution[];
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncateUserId(value: string): string {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function ResolverPrizeBoostCard({
  marketId,
  viewerIsAuthenticated,
  canContribute,
  resolverPrizeLockedTotal,
  resolverPrizeContributionCount,
  recentContributions,
}: ResolverPrizeBoostCardProps) {
  const [amount, setAmount] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submitContribution() {
    setStatusMessage(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      setStatusMessage({ kind: "error", text: "Contribution amount must be at least $1.00." });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/markets/${marketId}/resolve/prize-contribution`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: parsedAmount }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string; details?: string[] }
        | null;

      if (!response.ok) {
        const detailText = payload?.details?.join(" ") || payload?.detail || payload?.error || "Unable to add contribution.";
        setStatusMessage({ kind: "error", text: detailText });
        return;
      }

      setStatusMessage({ kind: "success", text: "Resolver prize contribution added." });
      setAmount("1");
      window.location.reload();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error while adding contribution.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="market-detail-position-panel" aria-label="Resolver prize boost">
      <h2>Resolver prize boost</h2>
      <p>
        Locked resolver prize pool: <strong>{formatCurrency(resolverPrizeLockedTotal)}</strong>
      </p>
      <p>
        Contributions: <strong>{resolverPrizeContributionCount}</strong>
      </p>
      <p className="market-detail-copy-muted">
        Any authenticated user can add prize money. If the market voids, contributions are refunded.
      </p>

      {!viewerIsAuthenticated ? (
        <div className="market-detail-action-links">
          <Link href="/login">Log in to contribute</Link>
          <Link href="/signup">Create account</Link>
        </div>
      ) : canContribute ? (
        <section className="market-detail-inline-form" aria-label="Contribute to resolver prize pool">
          <label>
            Contribution amount (USD)
            <input
              type="number"
              min={1}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <button type="button" onClick={submitContribution} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add resolver prize"}
          </button>
        </section>
      ) : (
        <p className="market-detail-copy-muted">Resolver prize contributions are closed after market finalization.</p>
      )}

      {statusMessage ? (
        <p className={statusMessage.kind === "error" ? "market-detail-callout market-detail-callout-error" : "market-detail-callout market-detail-callout-success"}>
          {statusMessage.text}
        </p>
      ) : null}

      <h3>Recent contributions</h3>
      {recentContributions.length === 0 ? (
        <p>No resolver prize contributions yet.</p>
      ) : (
        <ul className="market-detail-evidence-feed">
          {recentContributions.map((contribution) => (
            <li key={contribution.id}>
              <p>
                {formatCurrency(contribution.amount)} by <code>{truncateUserId(contribution.contributorId)}</code> · {formatStatus(contribution.status)} · {formatDate(contribution.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
