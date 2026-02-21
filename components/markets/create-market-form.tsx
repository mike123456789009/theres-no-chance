"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  MARKET_CREATOR_FEE_BPS,
  SYSTEM_DISPUTE_RULES,
  SYSTEM_EVIDENCE_RULES,
  type MarketSourceType,
} from "@/lib/markets/create-market";

type SourceDraft = {
  id: string;
  label: string;
  url: string;
  type: MarketSourceType;
};

type InstitutionAccessSnapshot = {
  activeMembership: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  } | null;
};

type WizardStep =
  | "rules"
  | "resolvable"
  | "listingFee"
  | "rake"
  | "evidence"
  | "basics"
  | "idea"
  | "criteria"
  | "sources"
  | "review";

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "rules", label: "Rules" },
  { id: "resolvable", label: "Resolvable" },
  { id: "listingFee", label: "Listing fee" },
  { id: "rake", label: "Maker rake" },
  { id: "evidence", label: "Evidence" },
  { id: "basics", label: "Basics" },
  { id: "idea", label: "Idea" },
  { id: "criteria", label: "Criteria" },
  { id: "sources", label: "References" },
  { id: "review", label: "Review" },
];

const SOURCE_TYPE_OPTIONS: Array<{ value: MarketSourceType; label: string }> = [
  { value: "official", label: "Official" },
  { value: "supporting", label: "Supporting" },
  { value: "rules", label: "Rules" },
];

function makeSourceId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitListInput(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function toLocalInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function isHttpsUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function CreateMarketForm() {
  const [stepIndex, setStepIndex] = useState(0);
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [resolvesYesIf, setResolvesYesIf] = useState("");
  const [resolvesNoIf, setResolvesNoIf] = useState("");
  const [ideaInput, setIdeaInput] = useState("");
  const [closeTimeLocal, setCloseTimeLocal] = useState(() => toLocalInputValue(new Date(Date.now() + 86_400_000 * 7)));
  const [visibility, setVisibility] = useState("public");
  const [tagsInput, setTagsInput] = useState("");
  const [riskFlagsInput, setRiskFlagsInput] = useState("");
  const [sources, setSources] = useState<SourceDraft[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [institutionAccess, setInstitutionAccess] = useState<InstitutionAccessSnapshot | null>(null);

  const currentStep = STEPS[stepIndex]?.id ?? "rules";

  const institutionMarketSelected = visibility === "institution";
  const activeInstitution = institutionAccess?.activeMembership ?? null;
  const hasActiveInstitution = Boolean(activeInstitution?.organizationId);

  useEffect(() => {
    let cancelled = false;

    async function loadInstitutionAccess() {
      try {
        const response = await fetch("/api/account/institution-access", { method: "GET", cache: "no-store" });
        const result = (await response.json().catch(() => null)) as InstitutionAccessSnapshot | null;
        if (!response.ok || !result) return;
        if (!cancelled) {
          setInstitutionAccess(result);
        }
      } catch {
        if (!cancelled) {
          setInstitutionAccess(null);
        }
      }
    }

    void loadInstitutionAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        void goNext();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const completionPercent = useMemo(() => Math.round(((stepIndex + 1) / STEPS.length) * 100), [stepIndex]);

  function updateSource(id: string, key: keyof SourceDraft, value: string) {
    setSources((current) =>
      current.map((source) =>
        source.id === id
          ? {
              ...source,
              [key]: value,
            }
          : source
      )
    );
  }

  function addSource() {
    if (sources.length >= 8) return;
    setSources((current) => [...current, { id: makeSourceId(), label: "", url: "", type: "official" }]);
  }

  function removeSource(id: string) {
    setSources((current) => current.filter((source) => source.id !== id));
  }

  function validateStep(step: WizardStep): string | null {
    if (step === "basics") {
      if (question.trim().length < 12) return "Question must be at least 12 characters.";
      if (description.trim().length < 30) return "Description must be at least 30 characters.";

      const closeTime = toIsoDateTime(closeTimeLocal);
      if (!closeTime) return "Close time must be a valid date.";
      if (new Date(closeTime).getTime() <= Date.now() + 60_000) return "Close time must be in the future.";
    }

    if (step === "criteria") {
      if (resolvesYesIf.trim().length < 12) return "Resolves YES if must be at least 12 characters.";
      if (resolvesNoIf.trim().length < 12) return "Resolves NO if must be at least 12 characters.";
    }

    if (step === "sources") {
      for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index];
        const label = source.label.trim();
        const url = source.url.trim();

        if (!label && !url) {
          continue;
        }

        if (label.length < 2) {
          return `Reference ${index + 1}: label must be at least 2 characters.`;
        }

        if (!isHttpsUrl(url)) {
          return `Reference ${index + 1}: URL must be a valid https URL.`;
        }
      }
    }

    if (institutionMarketSelected && !hasActiveInstitution) {
      return "Institution-gated markets require an active verified institution membership.";
    }

    return null;
  }

  async function goNext() {
    const validationError = validateStep(currentStep);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goPrevious() {
    setErrorMessage("");
    setSuccessMessage("");
    setStepIndex((current) => Math.max(0, current - 1));
  }

  async function generateCriteria() {
    setErrorMessage("");
    setSuccessMessage("");

    if (ideaInput.trim().length < 12) {
      setErrorMessage("Describe your market idea in at least 12 characters before generating criteria.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/markets/criteria-suggestion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idea: ideaInput,
          question,
          closeTime: toIsoDateTime(closeTimeLocal),
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            criteria?: {
              resolvesYesIf?: string;
              resolvesNoIf?: string;
            };
            error?: string;
            detail?: string;
          }
        | null;

      if (!response.ok || !result?.criteria) {
        setErrorMessage(result?.error ?? "Unable to generate criteria right now. You can still write criteria manually.");
        return;
      }

      setResolvesYesIf(result.criteria.resolvesYesIf ?? "");
      setResolvesNoIf(result.criteria.resolvesNoIf ?? "");
      setSuccessMessage("Suggested criteria generated. Review and edit before submission.");
      setStepIndex(STEPS.findIndex((step) => step.id === "criteria"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected network error while generating criteria.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function submitMarket(submissionMode: "draft" | "review") {
    setErrorMessage("");
    setSuccessMessage("");

    for (const step of ["basics", "criteria", "sources"] as WizardStep[]) {
      const validationError = validateStep(step);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
    }

    const closeTime = toIsoDateTime(closeTimeLocal);
    if (!closeTime) {
      setErrorMessage("Close time must be valid.");
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanedSources = sources
        .map((source) => ({
          label: source.label.trim(),
          url: source.url.trim(),
          type: source.type,
        }))
        .filter((source) => source.label.length > 0 || source.url.length > 0);

      const payloadVisibility = institutionMarketSelected ? "private" : visibility;
      const accessRulesPayload: Record<string, unknown> = {
        cardShadowTone: "mint",
      };

      if (institutionMarketSelected && activeInstitution) {
        accessRulesPayload.organizationId = activeInstitution.organizationId;
        accessRulesPayload.institutionOnly = true;
      }

      const response = await fetch("/api/markets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionMode,
          question,
          description,
          resolvesYesIf,
          resolvesNoIf,
          closeTime,
          expectedResolutionTime: null,
          evidenceRules: SYSTEM_EVIDENCE_RULES,
          disputeRules: SYSTEM_DISPUTE_RULES,
          visibility: payloadVisibility,
          feeBps: MARKET_CREATOR_FEE_BPS,
          tags: splitListInput(tagsInput),
          riskFlags: splitListInput(riskFlagsInput),
          accessRules: accessRulesPayload,
          sources: cleanedSources,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { message?: string; error?: string; details?: string[] }
        | null;

      if (!response.ok) {
        if (result?.details?.length) {
          setErrorMessage(result.details.join(" "));
        } else if (result?.error) {
          setErrorMessage(result.error);
        } else {
          setErrorMessage("Unable to submit market right now.");
        }
        return;
      }

      setSuccessMessage(result?.message ?? "Market request saved.");
      setStepIndex(STEPS.length - 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected network error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canGoBack = stepIndex > 0;
  const canGoNext = stepIndex < STEPS.length - 1;

  return (
    <div className="create-wizard" role="region" aria-label="Market creator wizard">
      <div className="create-wizard-progress" aria-label="Wizard progress">
        <p>
          Step {stepIndex + 1} of {STEPS.length}: <strong>{STEPS[stepIndex]?.label}</strong>
        </p>
        <div className="create-wizard-progress-track" aria-hidden="true">
          <div className="create-wizard-progress-fill" style={{ width: `${completionPercent}%` }} />
        </div>
      </div>

      <section className="create-section create-wizard-card" aria-label={`Wizard step ${stepIndex + 1}`}>
        {currentStep === "rules" ? (
          <>
            <h2>Market maker rules</h2>
            <p className="create-copy">
              Every market must be objective, verifiable, and written so independent resolvers can determine the same answer.
            </p>
            <p className="create-note">You will provide market basics, binary criteria, and optional references across the next cards.</p>
          </>
        ) : null}

        {currentStep === "resolvable" ? (
          <>
            <h2>Must be resolvable</h2>
            <p className="create-copy">
              Your market needs clear YES/NO outcomes, objective evidence, and a finite close time.
            </p>
            <p className="create-note">
              Learn the full lifecycle in <Link href="/community-resolve">Community Resolve</Link>.
            </p>
          </>
        ) : null}

        {currentStep === "listingFee" ? (
          <>
            <h2>Listing fee</h2>
            <p className="create-copy">
              Submitting for review charges a fixed <strong>$0.50</strong> listing fee from your wallet.
            </p>
            <p className="create-note">This discourages spam listings and funds moderation + settlement operations.</p>
          </>
        ) : null}

        {currentStep === "rake" ? (
          <>
            <h2>Market-maker rake</h2>
            <p className="create-copy">
              Market maker rake starts at <strong>0.5%</strong> for smaller markets and decreases as market size grows.
            </p>
            <p className="create-note">
              Creator payout is settled after final market resolution, never before adjudication/finalization.
            </p>
          </>
        ) : null}

        {currentStep === "evidence" ? (
          <>
            <h2>Platform evidence policy</h2>
            <p className="create-copy">Evidence requirements are system-owned and cannot be customized per market.</p>
            <p className="create-note">{SYSTEM_EVIDENCE_RULES}</p>
            <p className="create-note">{SYSTEM_DISPUTE_RULES}</p>
          </>
        ) : null}

        {currentStep === "basics" ? (
          <>
            <h2>Market basics</h2>

            <label className="create-field">
              <span>Question</span>
              <input
                type="text"
                placeholder="Will more than 100 people attend the TN fraternity party on March 8, 2026?"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                required
                minLength={12}
                maxLength={180}
              />
            </label>

            <label className="create-field">
              <span>Description</span>
              <textarea
                placeholder="Context, scope, and boundaries. Define exactly what counts."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                minLength={30}
                maxLength={5000}
                rows={5}
              />
            </label>

            <div className="create-grid-two">
              <label className="create-field">
                <span>Visibility</span>
                <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                  <option value="institution" disabled={!hasActiveInstitution}>
                    Institution
                  </option>
                </select>
              </label>

              <label className="create-field">
                <span>Close time</span>
                <input
                  type="datetime-local"
                  value={closeTimeLocal}
                  onChange={(event) => setCloseTimeLocal(event.target.value)}
                  required
                />
              </label>
            </div>

            {institutionMarketSelected ? (
              hasActiveInstitution && activeInstitution ? (
                <p className="create-note">
                  Institution binding: <strong>{activeInstitution.organizationName}</strong>
                </p>
              ) : (
                <p className="create-note tnc-error-text">Institution markets require an active verified institution membership.</p>
              )
            ) : null}
          </>
        ) : null}

        {currentStep === "idea" ? (
          <>
            <h2>Describe your market idea</h2>
            <label className="create-field">
              <span>Idea prompt</span>
              <textarea
                value={ideaInput}
                onChange={(event) => setIdeaInput(event.target.value)}
                rows={5}
                placeholder="Describe the event, outcome threshold, and what concrete evidence should prove YES or NO."
              />
            </label>
            <div className="create-actions">
              <button className="create-submit" type="button" onClick={generateCriteria} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate binary criteria"}
              </button>
            </div>
          </>
        ) : null}

        {currentStep === "criteria" ? (
          <>
            <h2>Edit resolution criteria</h2>

            <label className="create-field">
              <span>Resolves YES if</span>
              <textarea
                value={resolvesYesIf}
                onChange={(event) => setResolvesYesIf(event.target.value)}
                minLength={12}
                maxLength={1500}
                required
                rows={3}
              />
            </label>

            <label className="create-field">
              <span>Resolves NO if</span>
              <textarea
                value={resolvesNoIf}
                onChange={(event) => setResolvesNoIf(event.target.value)}
                minLength={12}
                maxLength={1500}
                required
                rows={3}
              />
            </label>
          </>
        ) : null}

        {currentStep === "sources" ? (
          <>
            <div className="create-source-header">
              <h2>Optional references</h2>
              <button className="create-source-add" type="button" onClick={addSource} disabled={sources.length >= 8}>
                + Add reference
              </button>
            </div>
            <p className="create-note">References are optional. If provided, each entry must include a label and https URL.</p>

            <div className="create-source-list">
              {sources.length === 0 ? <p className="create-note">No references added yet.</p> : null}
              {sources.map((source, index) => (
                <article className="create-source-item" key={source.id}>
                  <p className="create-source-index">Reference {index + 1}</p>

                  <label className="create-field">
                    <span>Label</span>
                    <input
                      type="text"
                      value={source.label}
                      onChange={(event) => updateSource(source.id, "label", event.target.value)}
                      minLength={2}
                      maxLength={80}
                    />
                  </label>

                  <label className="create-field">
                    <span>URL</span>
                    <input
                      type="url"
                      placeholder="https://example.com/source"
                      value={source.url}
                      onChange={(event) => updateSource(source.id, "url", event.target.value)}
                    />
                  </label>

                  <label className="create-field">
                    <span>Type</span>
                    <select value={source.type} onChange={(event) => updateSource(source.id, "type", event.target.value)}>
                      {SOURCE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button className="create-source-remove" type="button" onClick={() => removeSource(source.id)}>
                    Remove reference
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : null}

        {currentStep === "review" ? (
          <>
            <h2>Review and submit</h2>
            <p className="create-note">
              Resolution mode: <strong>Community</strong>
            </p>
            <p className="create-note">
              Listing fee: <strong>$0.50</strong>
            </p>
            <p className="create-note">
              Market-maker rake: <strong>dynamic</strong> (starts 0.5%)
            </p>
            <p className="create-note">
              Question: <strong>{question || "Not set"}</strong>
            </p>
            <p className="create-note">
              Close: <strong>{closeTimeLocal || "Not set"}</strong>
            </p>
            <label className="create-field">
              <span>Tags (comma-separated)</span>
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="event, local, nightlife"
              />
            </label>
            <label className="create-field">
              <span>Risk flags (comma-separated, optional)</span>
              <input
                type="text"
                value={riskFlagsInput}
                onChange={(event) => setRiskFlagsInput(event.target.value)}
                placeholder="attendance-estimate"
              />
            </label>

            <div className="create-actions">
              <button
                className="create-submit create-submit-muted"
                type="button"
                onClick={() => void submitMarket("draft")}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save draft"}
              </button>
              <button className="create-submit" type="button" onClick={() => void submitMarket("review")} disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit for review"}
              </button>
            </div>
          </>
        ) : null}
      </section>

      <div className="create-actions create-wizard-nav">
        <button className="create-submit create-submit-muted" type="button" onClick={goPrevious} disabled={!canGoBack || isSubmitting || isGenerating}>
          Previous
        </button>
        {canGoNext ? (
          <button className="create-submit" type="button" onClick={() => void goNext()} disabled={isSubmitting || isGenerating}>
            Next
          </button>
        ) : null}
      </div>

      {errorMessage ? <p className="create-status create-status-error">{errorMessage}</p> : null}
      {successMessage ? <p className="create-status create-status-success">{successMessage}</p> : null}
    </div>
  );
}
