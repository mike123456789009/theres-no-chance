"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type { MarketResolutionMode, MarketSourceType } from "@/lib/markets/create-market";
import { MARKET_CARD_SHADOW_TONES, type MarketCardShadowTone } from "@/lib/markets/presentation";

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

const SOURCE_TYPE_OPTIONS: Array<{ value: MarketSourceType; label: string }> = [
  { value: "official", label: "Official" },
  { value: "supporting", label: "Supporting" },
  { value: "rules", label: "Rules" },
];

const CARD_SHADOW_OPTIONS: Array<{ value: MarketCardShadowTone; label: string }> = [
  { value: "mint", label: "Mint" },
  { value: "sky", label: "Sky" },
  { value: "lemon", label: "Lemon" },
  { value: "lavender", label: "Lavender" },
  { value: "peach", label: "Peach" },
  { value: "rose", label: "Rose" },
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

export function CreateMarketForm() {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [resolvesYesIf, setResolvesYesIf] = useState("");
  const [resolvesNoIf, setResolvesNoIf] = useState("");
  const [closeTimeLocal, setCloseTimeLocal] = useState(() => toLocalInputValue(new Date(Date.now() + 86_400_000 * 7)));
  const [expectedResolutionLocal, setExpectedResolutionLocal] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 86_400_000 * 14))
  );
  const [evidenceRules, setEvidenceRules] = useState("");
  const [disputeRules, setDisputeRules] = useState("Disputes must be filed within 48 hours of resolution.");
  const [visibility, setVisibility] = useState("public");
  const [resolutionMode, setResolutionMode] = useState<MarketResolutionMode | "">("");
  const [feeBps, setFeeBps] = useState("200");
  const [tagsInput, setTagsInput] = useState("");
  const [riskFlagsInput, setRiskFlagsInput] = useState("");
  const [cardShadowTone, setCardShadowTone] = useState<MarketCardShadowTone>("mint");
  const [sources, setSources] = useState<SourceDraft[]>([
    { id: makeSourceId(), label: "Primary source", url: "", type: "official" },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [institutionAccess, setInstitutionAccess] = useState<InstitutionAccessSnapshot | null>(null);

  const sourceLimitReached = sources.length >= 8;

  const officialSourceCount = useMemo(
    () => sources.filter((source) => source.type === "official").length,
    [sources]
  );
  const institutionMarketSelected = visibility === "institution";
  const activeInstitution = institutionAccess?.activeMembership ?? null;
  const hasActiveInstitution = Boolean(activeInstitution?.organizationId);
  const defaultResolutionMode = visibility === "private" || visibility === "institution" ? "community" : "admin";

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
    if (sourceLimitReached) return;

    setSources((current) => [
      ...current,
      {
        id: makeSourceId(),
        label: "",
        url: "",
        type: "supporting",
      },
    ]);
  }

  function removeSource(id: string) {
    setSources((current) => (current.length === 1 ? current : current.filter((source) => source.id !== id)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const submissionMode = submitter?.value === "review" ? "review" : "draft";

    const closeTime = toIsoDateTime(closeTimeLocal);
    const expectedResolutionTime = expectedResolutionLocal ? toIsoDateTime(expectedResolutionLocal) : null;

    if (institutionMarketSelected && !hasActiveInstitution) {
      setErrorMessage("Institution-gated markets require an active verified institution membership.");
      return;
    }

    if (!closeTime) {
      setErrorMessage("Close time must be a valid date.");
      return;
    }

    if (expectedResolutionLocal && !expectedResolutionTime) {
      setErrorMessage("Expected resolution time must be a valid date.");
      return;
    }

    setIsSubmitting(true);

    try {
      const safeCardShadowTone = (MARKET_CARD_SHADOW_TONES as readonly string[]).includes(cardShadowTone)
        ? cardShadowTone
        : "mint";

      const payloadVisibility = institutionMarketSelected ? "private" : visibility;
      const accessRulesPayload: Record<string, unknown> = {
        cardShadowTone: safeCardShadowTone,
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
          expectedResolutionTime,
          evidenceRules,
          disputeRules,
          visibility: payloadVisibility,
          resolutionMode: resolutionMode || undefined,
          feeBps: Number(feeBps),
          tags: splitListInput(tagsInput),
          riskFlags: splitListInput(riskFlagsInput),
          accessRules: accessRulesPayload,
          sources: sources.map(({ label, url, type }) => ({ label, url, type })),
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected network error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="create-market-form" onSubmit={onSubmit}>
      <section className="create-section" aria-label="Market details">
        <h2>Market details</h2>

        <label className="create-field">
          <span>Question</span>
          <input
            type="text"
            placeholder="Will the city approve the stadium bond by November 2026?"
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
            placeholder="Provide context, why this market matters, and scope boundaries."
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
            <span>Fee (bps)</span>
            <input
              type="number"
              min={0}
              max={10000}
              value={feeBps}
              onChange={(event) => setFeeBps(event.target.value)}
            />
          </label>
        </div>

        <label className="create-field">
          <span>Resolution mode</span>
          <select
            value={resolutionMode}
            onChange={(event) => setResolutionMode(event.target.value as MarketResolutionMode | "")}
          >
            <option value="">Auto by access tier (default: {defaultResolutionMode})</option>
            <option value="admin">Admin resolution</option>
            <option value="community">Community resolution</option>
          </select>
        </label>
        <p className="create-note">
          Submitting to review charges a <strong>$0.50 listing fee</strong> from your wallet balance.
        </p>
        {institutionMarketSelected ? (
          hasActiveInstitution && activeInstitution ? (
            <p className="create-note">
              Institution binding: <strong>{activeInstitution.organizationName}</strong>. This market is discoverable and
              tradable only by your active institution members.
            </p>
          ) : (
            <p className="create-note tnc-error-text">
              Institution visibility is disabled until a verified .edu institution membership is active in account settings.
            </p>
          )
        ) : null}
      </section>

      <section className="create-section" aria-label="Resolution rules">
        <h2>Resolution rules</h2>

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

        <div className="create-grid-two">
          <label className="create-field">
            <span>Close time</span>
            <input
              type="datetime-local"
              value={closeTimeLocal}
              onChange={(event) => setCloseTimeLocal(event.target.value)}
              required
            />
          </label>

          <label className="create-field">
            <span>Expected resolution time</span>
            <input
              type="datetime-local"
              value={expectedResolutionLocal}
              onChange={(event) => setExpectedResolutionLocal(event.target.value)}
            />
          </label>
        </div>

        <label className="create-field">
          <span>Evidence rules (optional)</span>
          <textarea value={evidenceRules} onChange={(event) => setEvidenceRules(event.target.value)} rows={3} />
        </label>

        <label className="create-field">
          <span>Dispute rules (optional)</span>
          <textarea value={disputeRules} onChange={(event) => setDisputeRules(event.target.value)} rows={3} />
        </label>
      </section>

      <section className="create-section" aria-label="Metadata">
        <h2>Tags & risk metadata</h2>

        <label className="create-field">
          <span>Tags (comma-separated)</span>
          <input
            type="text"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="election, local, city-budget"
          />
        </label>

        <label className="create-field">
          <span>Risk flags (comma-separated, optional)</span>
          <input
            type="text"
            value={riskFlagsInput}
            onChange={(event) => setRiskFlagsInput(event.target.value)}
            placeholder="source-latency, low-liquidity"
          />
        </label>

        <label className="create-field">
          <span>Market card shadow color</span>
          <select value={cardShadowTone} onChange={(event) => setCardShadowTone(event.target.value as MarketCardShadowTone)}>
            {CARD_SHADOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="create-section" aria-label="Source definitions">
        <div className="create-source-header">
          <h2>Sources</h2>
          <button
            className="create-source-add"
            type="button"
            onClick={addSource}
            disabled={sourceLimitReached}
          >
            + Add source
          </button>
        </div>
        <p className="create-note">
          Include at least one official source. Official source count: <strong>{officialSourceCount}</strong>
        </p>

        <div className="create-source-list">
          {sources.map((source, index) => (
            <article className="create-source-item" key={source.id}>
              <p className="create-source-index">Source {index + 1}</p>

              <label className="create-field">
                <span>Label</span>
                <input
                  type="text"
                  value={source.label}
                  onChange={(event) => updateSource(source.id, "label", event.target.value)}
                  required
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
                  required
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

              <button
                className="create-source-remove"
                type="button"
                onClick={() => removeSource(source.id)}
                disabled={sources.length === 1}
              >
                Remove source
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="create-actions">
        <button className="create-submit create-submit-muted" type="submit" value="draft" disabled={isSubmitting}>
          {isSubmitting ? "SAVING..." : "Save draft"}
        </button>
        <button className="create-submit" type="submit" value="review" disabled={isSubmitting}>
          {isSubmitting ? "SUBMITTING..." : "Submit for review"}
        </button>
      </div>

      {errorMessage ? <p className="create-status create-status-error">{errorMessage}</p> : null}
      {successMessage ? <p className="create-status create-status-success">{successMessage}</p> : null}
    </form>
  );
}
