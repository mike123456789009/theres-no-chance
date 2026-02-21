import { describe, expect, it } from "vitest";

import {
  buildCreateMarketRequestPayload,
  splitListInput,
  toIsoDateTime,
  validateCreateMarketWizardForSubmit,
  validateCreateMarketWizardStep,
  type CreateMarketClientValidationState,
  type CreateMarketSourceDraft,
} from "@/lib/markets/create-market-client-validation";

function baseSourceDraft(overrides: Partial<CreateMarketSourceDraft> = {}): CreateMarketSourceDraft {
  return {
    id: "source-1",
    label: "Official statement",
    url: "https://example.com/source",
    type: "official",
    ...overrides,
  };
}

function baseValidationState(overrides: Partial<CreateMarketClientValidationState> = {}): CreateMarketClientValidationState {
  return {
    question: "Will this market have enough detail?",
    description: "This description includes enough detail to satisfy the minimum validation length for testing.",
    resolvesYesIf: "A trusted source confirms the event happened by the close time.",
    resolvesNoIf: "A trusted source confirms the event did not happen by the close time.",
    closeTimeLocal: "2030-01-01T10:00",
    sources: [baseSourceDraft()],
    institutionMarketSelected: false,
    hasActiveInstitution: false,
    ...overrides,
  };
}

describe("create-market client step validation", () => {
  it("validates basics step requirements", () => {
    const state = baseValidationState({ question: "too short" });

    expect(validateCreateMarketWizardStep("basics", state)).toBe("Question must be at least 12 characters.");
  });

  it("validates criteria step requirements", () => {
    const state = baseValidationState({ resolvesNoIf: "short" });

    expect(validateCreateMarketWizardStep("criteria", state)).toBe("Resolves NO if must be at least 12 characters.");
  });

  it("validates source URLs and labels", () => {
    const state = baseValidationState({
      sources: [baseSourceDraft({ label: "X", url: "http://example.com" })],
    });

    expect(validateCreateMarketWizardStep("sources", state)).toBe("Reference 1: label must be at least 2 characters.");
  });

  it("requires active institution when institution gating is selected", () => {
    const state = baseValidationState({
      institutionMarketSelected: true,
      hasActiveInstitution: false,
    });

    expect(validateCreateMarketWizardStep("rules", state)).toBe(
      "Institution-gated markets require an active verified institution membership."
    );
  });

  it("validates full submission-critical steps", () => {
    const state = baseValidationState();

    expect(validateCreateMarketWizardForSubmit(state)).toBeNull();
  });
});

describe("create-market payload contract", () => {
  it("builds expected API payload shape for public market", () => {
    const result = buildCreateMarketRequestPayload({
      submissionMode: "review",
      question: "Will this pass validation?",
      description: "A sufficiently detailed description that is long enough for server validation checks.",
      resolvesYesIf: "The event is confirmed by accepted sources before market close.",
      resolvesNoIf: "The event is not confirmed by accepted sources before market close.",
      closeTimeLocal: "2030-01-01T10:00",
      visibility: "public",
      institutionMarketSelected: false,
      activeInstitution: null,
      tagsInput: "alpha, beta",
      riskFlagsInput: "risk-a",
      sources: [baseSourceDraft(), baseSourceDraft({ id: "source-2", label: "", url: "" })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload).toMatchObject({
      submissionMode: "review",
      visibility: "public",
      expectedResolutionTime: null,
      feeBps: 50,
      tags: ["alpha", "beta"],
      riskFlags: ["risk-a"],
      accessRules: { cardShadowTone: "mint" },
    });
    expect(result.payload.sources).toHaveLength(1);
  });

  it("forces private visibility and organization binding for institution market payload", () => {
    const result = buildCreateMarketRequestPayload({
      submissionMode: "draft",
      question: "Will this pass validation?",
      description: "A sufficiently detailed description that is long enough for server validation checks.",
      resolvesYesIf: "The event is confirmed by accepted sources before market close.",
      resolvesNoIf: "The event is not confirmed by accepted sources before market close.",
      closeTimeLocal: "2030-01-01T10:00",
      visibility: "institution",
      institutionMarketSelected: true,
      activeInstitution: {
        organizationId: "org-123",
        organizationName: "Campus Org",
        organizationSlug: "campus-org",
        verifiedAt: "2026-02-01T00:00:00.000Z",
      },
      tagsInput: "",
      riskFlagsInput: "",
      sources: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload.visibility).toBe("private");
    expect(result.payload.accessRules).toMatchObject({
      cardShadowTone: "mint",
      organizationId: "org-123",
      institutionOnly: true,
    });
  });

  it("returns payload error when close time is invalid", () => {
    const result = buildCreateMarketRequestPayload({
      submissionMode: "draft",
      question: "Will this pass validation?",
      description: "A sufficiently detailed description that is long enough for server validation checks.",
      resolvesYesIf: "The event is confirmed by accepted sources before market close.",
      resolvesNoIf: "The event is not confirmed by accepted sources before market close.",
      closeTimeLocal: "not-a-date",
      visibility: "public",
      institutionMarketSelected: false,
      activeInstitution: null,
      tagsInput: "",
      riskFlagsInput: "",
      sources: [],
    });

    expect(result).toEqual({ ok: false, error: "Close time must be valid." });
  });
});

describe("create-market client helpers", () => {
  it("splits comma list input into trimmed values", () => {
    expect(splitListInput(" alpha, beta , ,gamma ")).toEqual(["alpha", "beta", "gamma"]);
  });

  it("converts local datetime input to ISO", () => {
    expect(toIsoDateTime("2030-01-01T10:00")).toMatch(/2030-01-01T/);
  });
});
