"use client";

import Link from "next/link";
import { useState } from "react";

type EvidenceItem = {
  id: string;
  submittedBy: string;
  evidenceUrl: string | null;
  evidenceText: string | null;
  notes: string | null;
  submittedOutcome: string | null;
  createdAt: string;
};

type EvidenceSubmissionCardProps = {
  marketId: string;
  marketStatus: string;
  canSubmitEvidence: boolean;
  viewerIsAuthenticated: boolean;
  evidenceRules: string | null;
  evidence: EvidenceItem[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatStatus(value: string | null): string {
  if (!value) return "Unspecified";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncateUserId(value: string): string {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function EvidenceSubmissionCard({
  marketId,
  marketStatus,
  canSubmitEvidence,
  viewerIsAuthenticated,
  evidenceRules,
  evidence,
}: EvidenceSubmissionCardProps) {
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [notes, setNotes] = useState("");
  const [submittedOutcome, setSubmittedOutcome] = useState<"" | "yes" | "no">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submitEvidence() {
    setStatusMessage(null);
    if (!evidenceUrl.trim() && !evidenceText.trim()) {
      setStatusMessage({
        kind: "error",
        text: "Provide either a URL or a text evidence statement.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/markets/${marketId}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evidenceUrl: evidenceUrl.trim() || null,
          evidenceText: evidenceText.trim() || null,
          notes: notes.trim() || null,
          submittedOutcome: submittedOutcome || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string; details?: string[] }
        | null;

      if (!response.ok) {
        const detailText = payload?.details?.join(" ") || payload?.detail || payload?.error || "Evidence submission failed.";
        setStatusMessage({ kind: "error", text: detailText });
        return;
      }

      setStatusMessage({ kind: "success", text: "Evidence submitted." });
      setEvidenceUrl("");
      setEvidenceText("");
      setNotes("");
      setSubmittedOutcome("");
      window.location.reload();
    } catch (error) {
      setStatusMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error during evidence submission.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="market-detail-section" aria-label="Evidence submission and feed">
      <h2>Resolution evidence</h2>
      <p>Status: {formatStatus(marketStatus)}</p>
      {evidenceRules ? (
        <p>
          <strong>Platform evidence policy:</strong> {evidenceRules}
        </p>
      ) : null}

      {viewerIsAuthenticated && canSubmitEvidence ? (
        <section className="market-detail-inline-form" aria-label="Submit evidence">
          <h3>Submit evidence</h3>
          <div className="market-detail-inline-row">
            <label>
              Evidence URL (optional)
              <input
                type="url"
                placeholder="https://..."
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
              />
            </label>
            <label>
              Claimed outcome (optional)
              <select value={submittedOutcome} onChange={(event) => setSubmittedOutcome(event.target.value as "" | "yes" | "no")}>
                <option value="">No claim</option>
                <option value="yes">YES</option>
                <option value="no">NO</option>
              </select>
            </label>
          </div>

          <label>
            Evidence statement (optional if URL present)
            <textarea
              rows={3}
              value={evidenceText}
              onChange={(event) => setEvidenceText(event.target.value)}
              placeholder="Describe the evidence in plain language."
            />
          </label>

          <label>
            Notes (optional)
            <textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything else resolvers should know."
            />
          </label>

          <button type="button" onClick={submitEvidence} disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit evidence"}
          </button>
        </section>
      ) : !viewerIsAuthenticated ? (
        <div className="market-detail-action-links">
          <Link href="/login">Log in to submit evidence</Link>
          <Link href="/signup">Create account</Link>
        </div>
      ) : (
        <p className="market-detail-copy-muted">Evidence submissions close when the market finalizes.</p>
      )}

      {statusMessage ? (
        <p className={statusMessage.kind === "error" ? "market-detail-callout market-detail-callout-error" : "market-detail-callout market-detail-callout-success"}>
          {statusMessage.text}
        </p>
      ) : null}

      <h3>Evidence feed</h3>
      {evidence.length === 0 ? (
        <p>No evidence has been submitted yet.</p>
      ) : (
        <ul className="market-detail-evidence-feed">
          {evidence.map((item) => (
            <li key={item.id}>
              <p>
                <strong>{formatStatus(item.submittedOutcome)}</strong> claim · {formatDate(item.createdAt)} · by <code>{truncateUserId(item.submittedBy)}</code>
              </p>
              {item.evidenceUrl ? (
                <p>
                  <a href={item.evidenceUrl} target="_blank" rel="noreferrer">
                    {item.evidenceUrl}
                  </a>
                </p>
              ) : null}
              {item.evidenceText ? <p>{item.evidenceText}</p> : null}
              {item.notes ? <p className="market-detail-copy-muted">Notes: {item.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
