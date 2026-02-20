"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type InstitutionCandidate = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  matchedDomain: string;
  allowSubdomains: boolean;
  matchType: "exact" | "suffix";
};

type InstitutionAccessSnapshot = {
  activeMembership: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  } | null;
  verifiedInstitutionEmails: Array<{
    id: string;
    email: string;
    domain: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  }>;
  pendingChallenge: {
    challengeId: string;
    institutionEmailId: string;
    email: string;
    domain?: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    expiresAt: string;
    resendAvailableAt: string;
    maxAttempts: number;
  } | null;
  canCreateInstitutionMarkets: boolean;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string | null | undefined): string {
  const normalized = clean(value);
  if (!normalized) return "N/A";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function InstitutionAccessPanel() {
  const [snapshot, setSnapshot] = useState<InstitutionAccessSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [newInstitutionName, setNewInstitutionName] = useState("");
  const [candidateOptions, setCandidateOptions] = useState<InstitutionCandidate[]>([]);
  const [needsNewInstitutionName, setNeedsNewInstitutionName] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const pendingChallenge = snapshot?.pendingChallenge ?? null;
  const activeMembership = snapshot?.activeMembership ?? null;

  const showCandidatePicker = candidateOptions.length > 0;

  const selectedCandidate = useMemo(
    () => candidateOptions.find((candidate) => candidate.organizationId === selectedOrganizationId) ?? null,
    [candidateOptions, selectedOrganizationId]
  );

  async function loadSnapshot() {
    setIsLoadingSnapshot(true);
    try {
      const response = await fetch("/api/account/institution-access", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json().catch(() => null)) as
        | (InstitutionAccessSnapshot & { error?: string; detail?: string })
        | null;

      if (!response.ok || !result) {
        throw new Error(result?.error || result?.detail || "Unable to load institution access state.");
      }

      setSnapshot({
        activeMembership: result.activeMembership,
        verifiedInstitutionEmails: Array.isArray(result.verifiedInstitutionEmails) ? result.verifiedInstitutionEmails : [],
        pendingChallenge: result.pendingChallenge,
        canCreateInstitutionMarkets: result.canCreateInstitutionMarkets === true,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load institution access state.");
    } finally {
      setIsLoadingSnapshot(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  async function onStartVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSendingCode(true);

    try {
      const response = await fetch("/api/account/institution-email/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          selectedOrganizationId: selectedOrganizationId || undefined,
          newInstitutionName: needsNewInstitutionName ? newInstitutionName : undefined,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            error?: string;
            detail?: string;
            code?: string;
            pendingChallenge?: InstitutionAccessSnapshot["pendingChallenge"];
            createdOrganization?: boolean;
            candidates?: InstitutionCandidate[];
            retryAfterSeconds?: number;
          }
        | null;

      if (response.status === 409 && result?.code === "AMBIGUOUS_INSTITUTION") {
        const candidates = Array.isArray(result.candidates) ? result.candidates : [];
        setCandidateOptions(candidates);
        setSelectedOrganizationId(candidates[0]?.organizationId ?? "");
        setNeedsNewInstitutionName(false);
        setSuccessMessage("Multiple institutions matched this email domain. Select one and send the code again.");
        return;
      }

      if (response.status === 409 && result?.code === "NO_INSTITUTION_MATCH") {
        setCandidateOptions([]);
        setSelectedOrganizationId("");
        setNeedsNewInstitutionName(true);
        setSuccessMessage("No institution matched this domain yet. Add a new institution name, then send again.");
        return;
      }

      if (!response.ok || !result) {
        throw new Error(result?.error || result?.detail || "Unable to start institution verification.");
      }

      setCandidateOptions([]);
      setSelectedOrganizationId("");
      setNeedsNewInstitutionName(false);
      setNewInstitutionName("");
      setSuccessMessage(
        result.createdOrganization
          ? "Verification code sent. New institution mapping created and now discoverable for this domain."
          : "Verification code sent to your institution email."
      );

      await loadSnapshot();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start institution verification.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function onVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingChallenge) {
      setErrorMessage("No pending institution challenge was found.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsVerifyingCode(true);

    try {
      const response = await fetch("/api/account/institution-email/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeId: pendingChallenge.challengeId,
          code,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            error?: string;
            detail?: string;
            verified?: {
              organizationName?: string;
            };
          }
        | null;

      if (!response.ok || !result) {
        throw new Error(result?.error || result?.detail || "Unable to verify institution code.");
      }

      setCode("");
      const verifiedOrgName = clean(result.verified?.organizationName);
      setSuccessMessage(
        verifiedOrgName
          ? `Institution access verified. Active institution is now ${verifiedOrgName}.`
          : "Institution access verified and active membership updated."
      );

      await loadSnapshot();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to verify institution code.");
    } finally {
      setIsVerifyingCode(false);
    }
  }

  return (
    <section className="create-section" aria-label="Institution access">
      <h2>Institution access</h2>
      <p className="create-note">
        Add a verified <code>.edu</code> email to unlock institution-gated market detail and trading. Your account can only
        have one active institution at a time.
      </p>

      {activeMembership ? (
        <p className="create-note">
          <strong>Active institution:</strong> {activeMembership.organizationName} (verified {formatDateTime(activeMembership.verifiedAt)})
        </p>
      ) : (
        <p className="create-note">No active institution membership yet.</p>
      )}

      {isLoadingSnapshot ? <p className="create-note">Loading institution access state...</p> : null}

      <form className="account-profile-form" onSubmit={onStartVerification}>
        <label className="create-field" htmlFor="institution-email-input">
          <span>Institution email</span>
          <input
            id="institution-email-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@students.college.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        {showCandidatePicker ? (
          <label className="create-field" htmlFor="institution-candidate-select">
            <span>Select matching institution</span>
            <select
              id="institution-candidate-select"
              value={selectedOrganizationId}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
              required
            >
              {candidateOptions.map((candidate) => (
                <option key={candidate.organizationId} value={candidate.organizationId}>
                  {candidate.organizationName} ({candidate.matchedDomain}, {candidate.matchType})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {needsNewInstitutionName ? (
          <label className="create-field" htmlFor="new-institution-name-input">
            <span>New institution name</span>
            <input
              id="new-institution-name-input"
              type="text"
              placeholder="University of Example"
              value={newInstitutionName}
              onChange={(event) => setNewInstitutionName(event.target.value)}
              minLength={3}
              maxLength={120}
              required
            />
          </label>
        ) : null}

        {selectedCandidate ? (
          <p className="create-note">
            Selected institution: <strong>{selectedCandidate.organizationName}</strong>
          </p>
        ) : null}

        <button className="create-submit" type="submit" disabled={isSendingCode}>
          {isSendingCode ? "Sending code..." : "Send institution verification code"}
        </button>
      </form>

      {pendingChallenge ? (
        <form className="account-profile-form" onSubmit={onVerifyCode}>
          <p className="create-note">
            Pending code for <strong>{pendingChallenge.email}</strong> ({pendingChallenge.organizationName}). Expires {" "}
            {formatDateTime(pendingChallenge.expiresAt)}.
          </p>

          <label className="create-field" htmlFor="institution-code-input">
            <span>Verification code</span>
            <input
              id="institution-code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </label>

          <button className="create-submit" type="submit" disabled={isVerifyingCode}>
            {isVerifyingCode ? "Verifying..." : "Verify institution code"}
          </button>
        </form>
      ) : null}

      <section aria-label="Verified institution emails">
        <h3>Verified institution emails</h3>
        {snapshot?.verifiedInstitutionEmails.length ? (
          <ul className="account-summary-list">
            {snapshot.verifiedInstitutionEmails.map((item) => (
              <li key={item.id}>
                <strong>{item.email}</strong> · {item.organizationName} · verified {formatDateTime(item.verifiedAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="create-note">No verified institution emails yet.</p>
        )}
      </section>

      {errorMessage ? <p className="create-status create-status-error">{errorMessage}</p> : null}
      {successMessage ? <p className="create-status create-status-success">{successMessage}</p> : null}
    </section>
  );
}
