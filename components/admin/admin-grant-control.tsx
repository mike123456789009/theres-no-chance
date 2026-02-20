"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type AdminGrantControlProps = {
  targetUserId: string;
  targetUserEmail: string;
  targetDisplayName: string;
  alreadyAdmin: boolean;
};

type StatusState =
  | {
      kind: "success" | "error";
      text: string;
    }
  | null;

const REQUIRED_PHRASE = "GRANT ADMIN";

function clean(value: string): string {
  return value.trim();
}

function normalizeEmail(value: string): string {
  return clean(value).toLowerCase();
}

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const error = typeof record.error === "string" ? record.error.trim() : "";
  const detail = typeof record.detail === "string" ? record.detail.trim() : "";
  return error || detail || null;
}

export function AdminGrantControl({
  targetUserId,
  targetUserEmail,
  targetDisplayName,
  alreadyAdmin,
}: Readonly<AdminGrantControlProps>) {
  const router = useRouter();
  const [stepOneArmed, setStepOneArmed] = useState(false);
  const [acknowledgeRisk, setAcknowledgeRisk] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);

  const normalizedTargetEmail = useMemo(() => normalizeEmail(targetUserEmail), [targetUserEmail]);
  const hasTargetEmail = normalizedTargetEmail.length > 0;
  const emailMatches = normalizeEmail(confirmEmail) === normalizedTargetEmail;
  const phraseMatches = clean(confirmPhrase) === REQUIRED_PHRASE;
  const canSubmit = stepOneArmed && acknowledgeRisk && emailMatches && phraseMatches && !pending && !alreadyAdmin && hasTargetEmail;

  async function submitGrant() {
    if (!canSubmit) return;
    setPending(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/admin/users/${targetUserId}/grant-platform-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmIntent: "grant_platform_admin",
          confirmAcknowledge: true,
          confirmTargetEmail: confirmEmail,
          confirmPhrase: confirmPhrase,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setStatus({
          kind: "error",
          text: readError(payload) ?? "Unable to grant admin access.",
        });
        return;
      }

      setStatus({
        kind: "success",
        text: "Platform admin role granted successfully.",
      });
      setStepOneArmed(false);
      setAcknowledgeRisk(false);
      setConfirmEmail("");
      setConfirmPhrase("");
      router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Network error while granting admin access.",
      });
    } finally {
      setPending(false);
    }
  }

  if (alreadyAdmin) {
    return (
      <div className="admin-grant-card admin-grant-card-active" aria-label="User already has admin access">
        <p className="create-note">
          <strong>{targetDisplayName}</strong> already has platform admin access.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-grant-card" aria-label="Grant platform admin access">
      <p className="create-note">
        Promote <strong>{targetDisplayName}</strong> (<code>{targetUserEmail}</code>) to platform admin.
      </p>
      {!hasTargetEmail ? <p className="admin-grant-status admin-grant-status-error">Cannot grant admin: target user has no email.</p> : null}

      {!stepOneArmed ? (
        <button
          type="button"
          className="create-submit create-submit-muted"
          onClick={() => setStepOneArmed(true)}
          disabled={!hasTargetEmail}
        >
          Step 1: Start admin grant
        </button>
      ) : (
        <div className="admin-grant-step-two">
          <p className="create-note">
            <strong>Step 2:</strong> Confirm this permanent permission change.
          </p>

          <label className="admin-grant-checkbox">
            <input
              type="checkbox"
              checked={acknowledgeRisk}
              onChange={(event) => setAcknowledgeRisk(event.target.checked)}
            />
            I understand this user will be able to control markets, resolutions, and admin settings.
          </label>

          <label className="auth-label" htmlFor={`grant-email-${targetUserId}`}>
            Type the exact user email to confirm
          </label>
          <input
            id={`grant-email-${targetUserId}`}
            className="auth-email"
            type="email"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={targetUserEmail}
            autoComplete="off"
          />

          <label className="auth-label" htmlFor={`grant-phrase-${targetUserId}`}>
            Type confirmation phrase: <code>{REQUIRED_PHRASE}</code>
          </label>
          <input
            id={`grant-phrase-${targetUserId}`}
            className="auth-email"
            type="text"
            value={confirmPhrase}
            onChange={(event) => setConfirmPhrase(event.target.value)}
            placeholder={REQUIRED_PHRASE}
            autoComplete="off"
          />

          <div className="create-actions">
            <button type="button" className="create-submit" onClick={submitGrant} disabled={!canSubmit}>
              {pending ? "Granting..." : "Confirm grant admin access"}
            </button>
            <button
              type="button"
              className="create-submit create-submit-muted"
              onClick={() => {
                setStepOneArmed(false);
                setAcknowledgeRisk(false);
                setConfirmEmail("");
                setConfirmPhrase("");
              }}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status ? (
        <p className={status.kind === "error" ? "admin-grant-status admin-grant-status-error" : "admin-grant-status admin-grant-status-success"}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
