"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AdminQueueMarket = {
  id: string;
  question: string;
  status: "review" | "open";
  closeTime: string;
  createdAt: string;
  creatorId: string;
  tags: string[];
};

type QueueAction = "approve" | "reject" | "halt";

type AdminReviewQueueProps = {
  reviewMarkets: AdminQueueMarket[];
  openMarkets: AdminQueueMarket[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AdminReviewQueue({ reviewMarkets, openMarkets }: AdminReviewQueueProps) {
  const router = useRouter();
  const [isPendingAction, setIsPendingAction] = useState<string | null>(null);
  const [noteByMarketId, setNoteByMarketId] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function runAction(action: QueueAction, marketId: string) {
    setStatusMessage(null);
    const actionKey = `${action}:${marketId}`;
    setIsPendingAction(actionKey);

    try {
      const note = (noteByMarketId[marketId] ?? "").trim();
      const response = await fetch(`/api/admin/markets/${marketId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: note || null }),
      });

      const result = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; detail?: string }
        | null;

      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: result?.error ?? "Admin action failed.",
        });
        return;
      }

      setStatusMessage({
        kind: "success",
        text: result?.message ?? "Admin action completed.",
      });
      setNoteByMarketId((current) => ({
        ...current,
        [marketId]: "",
      }));
      router.refresh();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error during admin action.",
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

      <section className="admin-queue-section" aria-label="Review queue">
        <div className="admin-queue-header">
          <h2>Markets pending review</h2>
          <p>{reviewMarkets.length} in queue</p>
        </div>

        {reviewMarkets.length === 0 ? (
          <p className="admin-queue-empty">No markets are currently waiting for review.</p>
        ) : (
          <div className="admin-queue-list">
            {reviewMarkets.map((market) => {
              const pendingApprove = isPendingAction === `approve:${market.id}`;
              const pendingReject = isPendingAction === `reject:${market.id}`;
              const pendingAny = Boolean(isPendingAction);

              return (
                <article key={market.id} className="admin-queue-card">
                  <p className="admin-queue-badge">Review</p>
                  <h3>{market.question}</h3>
                  <p>Created: {formatDate(market.createdAt)}</p>
                  <p>Closes: {formatDate(market.closeTime)}</p>
                  <p>
                    Creator id: <code>{market.creatorId}</code>
                  </p>
                  {market.tags.length ? <p>Tags: {market.tags.join(", ")}</p> : null}

                  <label className="admin-queue-note">
                    <span>Admin note (optional)</span>
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
                    <button
                      type="button"
                      onClick={() => runAction("approve", market.id)}
                      disabled={pendingAny}
                    >
                      {pendingApprove ? "Approving..." : "Approve + open"}
                    </button>
                    <button
                      type="button"
                      className="is-muted"
                      onClick={() => runAction("reject", market.id)}
                      disabled={pendingAny}
                    >
                      {pendingReject ? "Rejecting..." : "Reject to draft"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-queue-section" aria-label="Open market controls">
        <div className="admin-queue-header">
          <h2>Open markets</h2>
          <p>{openMarkets.length} active</p>
        </div>

        {openMarkets.length === 0 ? (
          <p className="admin-queue-empty">No open markets available for halt controls right now.</p>
        ) : (
          <div className="admin-queue-list">
            {openMarkets.map((market) => {
              const pendingHalt = isPendingAction === `halt:${market.id}`;
              const pendingAny = Boolean(isPendingAction);

              return (
                <article key={market.id} className="admin-queue-card">
                  <p className="admin-queue-badge admin-queue-badge-open">Open</p>
                  <h3>{market.question}</h3>
                  <p>Closes: {formatDate(market.closeTime)}</p>
                  <p>
                    Creator id: <code>{market.creatorId}</code>
                  </p>
                  {market.tags.length ? <p>Tags: {market.tags.join(", ")}</p> : null}

                  <label className="admin-queue-note">
                    <span>Halt reason (optional)</span>
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
                    <button
                      type="button"
                      className="is-muted"
                      onClick={() => runAction("halt", market.id)}
                      disabled={pendingAny}
                    >
                      {pendingHalt ? "Halting..." : "Halt trading"}
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
