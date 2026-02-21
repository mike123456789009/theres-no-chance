import {
  MARKET_CREATOR_FEE_BPS,
  MARKET_VISIBILITIES,
  SYSTEM_DISPUTE_RULES,
  SYSTEM_EVIDENCE_RULES,
  type MarketSourceType,
  type MarketVisibility,
} from "@/lib/markets/create-market";

export type CreateMarketWizardStep =
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

export type CreateMarketSourceDraft = {
  id: string;
  label: string;
  url: string;
  type: MarketSourceType;
};

export type ActiveInstitutionSnapshot = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  verifiedAt: string | null;
};

export type CreateMarketClientValidationState = {
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  closeTimeLocal: string;
  sources: CreateMarketSourceDraft[];
  institutionMarketSelected: boolean;
  hasActiveInstitution: boolean;
};

export type CreateMarketPayloadInput = {
  submissionMode: "draft" | "review";
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  closeTimeLocal: string;
  visibility: string;
  institutionMarketSelected: boolean;
  activeInstitution: ActiveInstitutionSnapshot | null;
  tagsInput: string;
  riskFlagsInput: string;
  sources: CreateMarketSourceDraft[];
};

export type CreateMarketPayloadBuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

export function splitListInput(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function toIsoDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function isHttpsUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateCreateMarketWizardStep(
  step: CreateMarketWizardStep,
  state: CreateMarketClientValidationState
): string | null {
  if (step === "basics") {
    if (state.question.trim().length < 12) return "Question must be at least 12 characters.";
    if (state.description.trim().length < 30) return "Description must be at least 30 characters.";

    const closeTime = toIsoDateTime(state.closeTimeLocal);
    if (!closeTime) return "Close time must be a valid date.";
    if (new Date(closeTime).getTime() <= Date.now() + 60_000) return "Close time must be in the future.";
  }

  if (step === "criteria") {
    if (state.resolvesYesIf.trim().length < 12) return "Resolves YES if must be at least 12 characters.";
    if (state.resolvesNoIf.trim().length < 12) return "Resolves NO if must be at least 12 characters.";
  }

  if (step === "sources") {
    if (state.sources.length > 8) {
      return "No more than 8 references are allowed.";
    }

    for (let index = 0; index < state.sources.length; index += 1) {
      const source = state.sources[index];
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

  if (state.institutionMarketSelected && !state.hasActiveInstitution) {
    return "Institution-gated markets require an active verified institution membership.";
  }

  return null;
}

export function validateCreateMarketWizardForSubmit(
  state: CreateMarketClientValidationState
): string | null {
  for (const step of ["basics", "criteria", "sources"] as const) {
    const validationError = validateCreateMarketWizardStep(step, state);
    if (validationError) {
      return validationError;
    }
  }

  return null;
}

export function buildCreateMarketRequestPayload(
  input: CreateMarketPayloadInput
): CreateMarketPayloadBuildResult {
  const closeTime = toIsoDateTime(input.closeTimeLocal);
  if (!closeTime) {
    return {
      ok: false,
      error: "Close time must be valid.",
    };
  }

  const cleanedSources = input.sources
    .map((source) => ({
      label: source.label.trim(),
      url: source.url.trim(),
      type: source.type,
    }))
    .filter((source) => source.label.length > 0 || source.url.length > 0);

  const payloadVisibility: MarketVisibility = input.institutionMarketSelected
    ? "private"
    : (MARKET_VISIBILITIES.includes(input.visibility as MarketVisibility)
        ? (input.visibility as MarketVisibility)
        : "public");
  const accessRulesPayload: Record<string, unknown> = {
    cardShadowTone: "mint",
  };

  if (input.institutionMarketSelected && input.activeInstitution) {
    accessRulesPayload.organizationId = input.activeInstitution.organizationId;
    accessRulesPayload.institutionOnly = true;
  }

  return {
    ok: true,
    payload: {
      submissionMode: input.submissionMode,
      question: input.question,
      description: input.description,
      resolvesYesIf: input.resolvesYesIf,
      resolvesNoIf: input.resolvesNoIf,
      closeTime,
      expectedResolutionTime: null,
      evidenceRules: SYSTEM_EVIDENCE_RULES,
      disputeRules: SYSTEM_DISPUTE_RULES,
      visibility: payloadVisibility,
      feeBps: MARKET_CREATOR_FEE_BPS,
      tags: splitListInput(input.tagsInput),
      riskFlags: splitListInput(input.riskFlagsInput),
      accessRules: accessRulesPayload,
      sources: cleanedSources,
    },
  };
}
