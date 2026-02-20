"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminVenmoQueueItem = {
  id: string;
  createdAt: string;
  gmailMessageId: string;
  providerPaymentId: string;
  grossAmountUsd: number;
  computedFeeUsd: number;
  computedNetUsd: number;
  payerDisplayName: string;
  payerHandle: string;
  note: string;
  extractedInvoiceCode: string;
  errorMessage: string;
};

type AdminVenmoReconcileQueueProps = {
  rows: AdminVenmoQueueItem[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function AdminVenmoReconcileQueue({ rows }: AdminVenmoReconcileQueueProps) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [fundingIntentByRow, setFundingIntentByRow] = useState<Record<string, string>>({});

  async function runMatch(rowId: string) {
    setStatusMessage(null);
    const fundingIntentId = clean(fundingIntentByRow[rowId]);
    if (!fundingIntentId) {
      setStatusMessage({
        kind: "error",
        text: "Funding intent id is required to manually match a Venmo payment.",
      });
      return;
    }

    setPendingKey(`match:${rowId}`);

    try {
      const response = await fetch("/api/admin/payments/venmo/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          incomingPaymentId: rowId,
          fundingIntentId,
        }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: clean(result?.error) || "Manual match failed.",
        });
        return;
      }

      setStatusMessage({
        kind: "success",
        text: clean(result?.message) || "Manual match completed.",
      });
      setFundingIntentByRow((current) => ({
        ...current,
        [rowId]: "",
      }));
      router.refresh();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error while matching payment.",
      });
    } finally {
      setPendingKey(null);
    }
  }

  async function runIgnore(rowId: string) {
    setStatusMessage(null);
    setPendingKey(`ignore:${rowId}`);

    try {
      const response = await fetch("/api/admin/payments/venmo/ignore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          incomingPaymentId: rowId,
        }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        setStatusMessage({
          kind: "error",
          text: clean(result?.error) || "Ignore action failed.",
        });
        return;
      }

      setStatusMessage({
        kind: "success",
        text: clean(result?.message) || "Payment marked ignored.",
      });
      router.refresh();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error while ignoring payment.",
      });
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="create-section" aria-label="Venmo reconciliation queue">
      <h2>Venmo review queue</h2>
      <p className="create-note">Rows listed here did not auto-match and require admin action.</p>

      {statusMessage ? (
        <p className={statusMessage.kind === "error" ? "create-note tnc-error-text" : "create-note"}>{statusMessage.text}</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="create-note">No Venmo payments are waiting for manual review.</p>
      ) : (
        <div className="tnc-table-wrap">
          <table className="admin-history-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Payer</th>
                <th>Gross</th>
                <th>Fee</th>
                <th>Net</th>
                <th>Invoice</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const matchPending = pendingKey === `match:${row.id}`;
                const ignorePending = pendingKey === `ignore:${row.id}`;
                const actionBlocked = Boolean(pendingKey);

                return (
                  <tr key={row.id}>
                    <td>
                      <div>{formatDate(row.createdAt)}</div>
                      <div className="create-note">
                        <code>{row.gmailMessageId}</code>
                      </div>
                    </td>
                    <td>
                      <div>{row.payerDisplayName || "Unknown"}</div>
                      <div className="create-note">{row.payerHandle || "No handle"}</div>
                    </td>
                    <td>{formatCurrency(row.grossAmountUsd)}</td>
                    <td>{formatCurrency(row.computedFeeUsd)}</td>
                    <td>{formatCurrency(row.computedNetUsd)}</td>
                    <td>
                      <div>{row.extractedInvoiceCode || "Missing"}</div>
                      <div className="create-note">{row.note || "No note captured"}</div>
                    </td>
                    <td>{row.errorMessage || "No error detail."}</td>
                    <td>
                      <label className="create-field">
                        <span>Funding intent id</span>
                        <input
                          type="text"
                          value={fundingIntentByRow[row.id] ?? ""}
                          onChange={(event) =>
                            setFundingIntentByRow((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="venmo-instructions-actions">
                        <button type="button" className="create-submit" disabled={actionBlocked} onClick={() => runMatch(row.id)}>
                          {matchPending ? "Matching..." : "Match + credit"}
                        </button>
                        <button
                          type="button"
                          className="create-submit create-submit-muted"
                          disabled={actionBlocked}
                          onClick={() => runIgnore(row.id)}
                        >
                          {ignorePending ? "Ignoring..." : "Ignore"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
