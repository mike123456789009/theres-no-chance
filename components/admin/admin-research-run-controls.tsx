"use client";

import { useState } from "react";

type RunScope = "public" | "institution";

type RunSummary = {
  runId?: string;
  status?: string;
  submitted?: number;
  skippedDuplicate?: number;
  skippedQuality?: number;
  skippedInvalid?: number;
  submitFailed?: number;
  organizationsProcessed?: number;
};

function normalizeRunSummary(value: unknown): RunSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RunSummary;
}

function readErrorDetail(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const error = typeof record.error === "string" ? record.error.trim() : "";
  const detail = typeof record.detail === "string" ? record.detail.trim() : "";
  return error || detail || null;
}

export function AdminResearchRunControls() {
  const [pendingScope, setPendingScope] = useState<RunScope | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [summary, setSummary] = useState<RunSummary | null>(null);

  async function invoke(scope: RunScope) {
    setPendingScope(scope);
    setStatusMessage("");
    setSummary(null);

    try {
      const response = await fetch("/api/admin/automation/market-research/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope, submit: true }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setStatusMessage(readErrorDetail(payload) ?? "Unable to invoke market research run.");
        return;
      }

      const runSummary = normalizeRunSummary((payload as { summary?: unknown } | null)?.summary ?? null);
      setSummary(runSummary);
      setStatusMessage(
        runSummary?.status
          ? `${scope.toUpperCase()} run finished with status: ${runSummary.status}.`
          : `${scope.toUpperCase()} run invoked.`
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Network error invoking run.");
    } finally {
      setPendingScope(null);
    }
  }

  return (
    <section className="create-section" aria-label="Manual market research controls">
      <h2>Manual run controls</h2>
      <p className="create-note">
        Invoke AI market proposal runs directly from admin. Runs are lock-protected and safe to retry.
      </p>

      <div className="create-actions">
        <button type="button" className="create-submit" disabled={Boolean(pendingScope)} onClick={() => invoke("public")}>
          {pendingScope === "public" ? "Running public scan..." : "Run public proposal scan"}
        </button>
        <button
          type="button"
          className="create-submit create-submit-muted"
          disabled={Boolean(pendingScope)}
          onClick={() => invoke("institution")}
        >
          {pendingScope === "institution" ? "Running institution scan..." : "Run institution proposal scan"}
        </button>
      </div>

      {statusMessage ? <p className="create-status">{statusMessage}</p> : null}

      {summary ? (
        <div className="admin-run-summary-grid" role="list" aria-label="Latest manual run summary">
          <p role="listitem">Run id: <code>{summary.runId ?? "n/a"}</code></p>
          <p role="listitem">Status: <strong>{summary.status ?? "unknown"}</strong></p>
          <p role="listitem">Submitted: {summary.submitted ?? 0}</p>
          <p role="listitem">Duplicates: {summary.skippedDuplicate ?? 0}</p>
          <p role="listitem">Quality skips: {summary.skippedQuality ?? 0}</p>
          <p role="listitem">Invalid skips: {summary.skippedInvalid ?? 0}</p>
          <p role="listitem">Submit failed: {summary.submitFailed ?? 0}</p>
          {typeof summary.organizationsProcessed === "number" ? (
            <p role="listitem">Organizations processed: {summary.organizationsProcessed}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
