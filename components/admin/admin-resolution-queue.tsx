"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ResolutionMarket = {
  id: string;
  question: string;
  status: string;
  closeTime: string;
  resolvedAt: string | null;
  resolutionOutcome: string | null;
  creatorId: string;
  tags: string[];
};

type ResolveOutcome = "yes" | "no" | "void";

type AdminResolutionQueueProps = {
  readyToResolve: ResolutionMarket[];
  resolvedMarkets: ResolutionMarket[];
  disputeWindowHours: number;
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

function computeWindowEnds(resolvedAt: string | null, disputeWindowHours: number): string | null {
  if (!resolvedAt) return null;
  const resolvedMs = Date.parse(resolvedAt);
  if (!Number.isFinite(resolvedMs)) return null;
  return new Date(resolvedMs + disputeWindowHours * 60 * 60 * 1000).toISOString();
}

export function AdminResolutionQueue({ readyToResolve, resolvedMarkets, disputeWindowHours }: AdminResolutionQueueProps) {
  const router = useRouter();
  const [isPendingAction, setIsPendingAction] = useState<string | null>(null);
  const [noteByMarketId, setNoteByMarketId] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const resolvedWithWindows = useMemo(
    () =>
      resolvedMarkets.map((market) => ({
        ...market,
        disputeWindowEndsAt: computeWindowEnds(market.resolvedAt, disputeWindowHours),
      })),
    [resolvedMarkets, disputeWindowHours]
  );

  async function resolveMarket(marketId: string, outcome: ResolveOutcome) {
    setStatusMessage(null);
    const actionKey = `resolve:${marketId}:${outcome}`;
    setIsPendingAction(actionKey);

    try {
      const note = (noteByMarketId[marketId] ?? "").trim();
      const response = await fetch(`/api/admin/markets/${marketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outcome,
          notes: note || null,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; detail?: string }
        | null;

      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: result?.error ?? "Market resolution failed.",
        });
        return;
      }

      setStatusMessage({
        kind: "success",
        text: result?.message ?? "Market resolved.",
      });
      setNoteByMarketId((current) => ({
        ...current,
        [marketId]: "",
      }));
      router.refresh();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error during market resolution.",
      });
    } finally {
      setIsPendingAction(null);
    }
  }

  async function finalizeMarket(marketId: string) {
    setStatusMessage(null);
    const actionKey = `finalize:${marketId}`;
    setIsPendingAction(actionKey);

    try {
      const response = await fetch(`/api/admin/markets/${marketId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; detail?: string }
        | null;

      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: result?.error ?? "Market finalization failed.",
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

      <section className="admin-queue-section" aria-label="Resolution queue">
        <div className="admin-queue-header">
          <h2>Ready to resolve</h2>
          <p>{readyToResolve.length} markets</p>
        </div>

        {readyToResolve.length === 0 ? (
          <p className="admin-queue-empty">No markets are currently ready for resolution.</p>
        ) : (
          <div className="admin-queue-list">
            {readyToResolve.map((market) => {
              const pendingAny = Boolean(isPendingAction);
              const pendingYes = isPendingAction === `resolve:${market.id}:yes`;
              const pendingNo = isPendingAction === `resolve:${market.id}:no`;
              const pendingVoid = isPendingAction === `resolve:${market.id}:void`;

              return (
                <article key={market.id} className="admin-queue-card">
                  <p className="admin-queue-badge admin-queue-badge-open">Resolve</p>
                  <h3>{market.question}</h3>
                  <p>Status: {market.status}</p>
                  <p>Closes: {formatDate(market.closeTime)}</p>
                  <p>
                    Creator id: <code>{market.creatorId}</code>
                  </p>
                  {market.tags.length ? <p>Tags: {market.tags.join(", ")}</p> : null}

                  <label className="admin-queue-note">
                    <span>Resolution notes (optional)</span>
                    <textarea
                      rows={2}
                      value={noteByMarketId[market.id] ?? ""}
                      onChange={(event) =>
                        setNoteByMarketId((current) => ({
                          ...current,
                          [market.id]: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="admin-queue-actions">
                    <button type="button" onClick={() => resolveMarket(market.id, "yes")} disabled={pendingAny}>
                      {pendingYes ? "Resolving..." : "Resolve YES"}
                    </button>
                    <button type="button" onClick={() => resolveMarket(market.id, "no")} disabled={pendingAny}>
                      {pendingNo ? "Resolving..." : "Resolve NO"}
                    </button>
                    <button type="button" className="is-muted" onClick={() => resolveMarket(market.id, "void")} disabled={pendingAny}>
                      {pendingVoid ? "Resolving..." : "Void"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-queue-section" aria-label="Finalization queue">
        <div className="admin-queue-header">
          <h2>Resolved markets</h2>
          <p>{resolvedWithWindows.length} markets</p>
        </div>

        {resolvedWithWindows.length === 0 ? (
          <p className="admin-queue-empty">No resolved markets available for finalization right now.</p>
        ) : (
          <div className="admin-queue-list">
            {resolvedWithWindows.map((market) => {
              const pendingFinalize = isPendingAction === `finalize:${market.id}`;
              const pendingAny = Boolean(isPendingAction);
              const windowEnds = market.disputeWindowEndsAt;
              const isReady = windowEnds ? Date.now() >= Date.parse(windowEnds) : false;

              return (
                <article key={market.id} className="admin-queue-card">
                  <p className="admin-queue-badge">Resolved</p>
                  <h3>{market.question}</h3>
                  <p>Status: {market.status}</p>
                  <p>Outcome: {market.resolutionOutcome ?? "unknown"}</p>
                  <p>Resolved at: {formatDate(market.resolvedAt)}</p>
                  <p>Dispute window ends: {formatDate(windowEnds)}</p>
                  <p>Finalize readiness: {isReady ? "Ready" : "Not yet"}</p>

                  <div className="admin-queue-actions">
                    <button type="button" onClick={() => finalizeMarket(market.id)} disabled={pendingAny}>
                      {pendingFinalize ? "Finalizing..." : "Finalize + settle"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

