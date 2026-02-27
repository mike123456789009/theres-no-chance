import {
  DEFAULT_DISPUTE_RULES,
  DEFAULT_EVIDENCE_RULES,
  DEFAULT_FEE_BPS,
  MAX_CLOSE_WINDOW_MS,
  MIN_CLOSE_WINDOW_MS,
  QUALITY_CONFIDENCE_MIN,
} from "@/lib/automation/market-research/constants";
import type { GeneratedMarketProposal, GeneratedProposalSource, ResearchOrganization, ResearchRunScope } from "@/lib/automation/market-research/types";
import { fallbackFingerprint, normalizeFingerprint, normalizeStringList, normalizeWhitespace, toHttpsUrl } from "@/lib/automation/market-research/utils";
import type { AutomationMarketProposalInput } from "@/lib/markets/submit-automation-proposal";
import { MARKET_CATEGORY_KEYS, CATEGORY_TO_CARD_TONE, type MarketCategoryKey } from "@/lib/markets/taxonomy";

type ProposalValidationOk = {
  ok: true;
  proposal: AutomationMarketProposalInput;
  confidence: number;
  category: MarketCategoryKey;
  usFocus: boolean;
  eventFingerprint: string;
  sourcesSnapshot: GeneratedProposalSource[];
};

type ProposalValidationFail = {
  ok: false;
  kind: "quality" | "invalid";
  reason: string;
  eventFingerprint: string;
  question: string;
  category: string;
  confidence: number;
  sourcesSnapshot: GeneratedProposalSource[];
};

export type ProposalValidationResult = ProposalValidationOk | ProposalValidationFail;

type ValidateGeneratedProposalInput = {
  generated: GeneratedMarketProposal;
  scope: ResearchRunScope;
  scopeKey: string;
  runId: string;
  organization?: ResearchOrganization;
};

function isAllowedCategory(value: string): value is MarketCategoryKey {
  return (MARKET_CATEGORY_KEYS as readonly string[]).includes(value);
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeSources(raw: unknown): GeneratedProposalSource[] {
  if (!Array.isArray(raw)) return [];

  const next: GeneratedProposalSource[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const label = typeof source.label === "string" ? normalizeWhitespace(source.label).slice(0, 80) : "";
    const urlCandidate = typeof source.url === "string" ? source.url : "";
    const url = toHttpsUrl(urlCandidate);
    const rawType = typeof source.type === "string" ? source.type.trim().toLowerCase() : "";
    const type = rawType === "official" || rawType === "supporting" || rawType === "rules" ? rawType : "supporting";

    if (!label || !url) continue;

    next.push({
      label,
      url,
      type,
    });
  }

  const deduped = new Map<string, GeneratedProposalSource>();
  for (const source of next) {
    if (!deduped.has(source.url)) {
      deduped.set(source.url, source);
    }
  }

  return Array.from(deduped.values()).slice(0, 8);
}

function buildInstitutionAccessRules(base: Record<string, unknown>, organization: ResearchOrganization): Record<string, unknown> {
  return {
    ...base,
    organizationId: organization.id,
    institutionOnly: true,
    institutionDomains: organization.domains.map((domain) => domain.domain),
  };
}

function coerceAccessRules(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function deriveEventFingerprint(input: {
  generatedFingerprint: unknown;
  question: string;
  category: string;
  closeTime: string;
  scopeKey: string;
}): string {
  const explicit =
    typeof input.generatedFingerprint === "string" ? normalizeFingerprint(input.generatedFingerprint) : "";
  if (explicit.length > 0) return explicit;

  return fallbackFingerprint({
    question: input.question,
    category: input.category,
    closeTime: input.closeTime,
    scopeKey: input.scopeKey,
  });
}

function confidenceFromUnknown(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function isMutuallyExclusivePredicate(yesRule: string, noRule: string): boolean {
  const yesNorm = normalizeWhitespace(yesRule).toLowerCase();
  const noNorm = normalizeWhitespace(noRule).toLowerCase();
  if (!yesNorm || !noNorm) return false;
  if (yesNorm === noNorm) return false;
  if (yesNorm.includes(noNorm) || noNorm.includes(yesNorm)) return false;
  return true;
}

function withinCloseWindow(closeTime: Date, nowMs: number): boolean {
  const delta = closeTime.getTime() - nowMs;
  return delta >= MIN_CLOSE_WINDOW_MS && delta <= MAX_CLOSE_WINDOW_MS;
}

function hasAmbiguousQuestionSubject(question: string): boolean {
  return /^will\s+(this|that|it|they|he|she|these|those)\b/i.test(question);
}

function hasExplicitQuestionTimeAnchor(question: string): boolean {
  if (/\b20\d{2}\b/.test(question)) return true;
  if (/\bq[1-4]\s*20\d{2}\b/i.test(question)) return true;
  if (
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(question)
  ) {
    return true;
  }

  return false;
}

export function validateGeneratedProposal(input: ValidateGeneratedProposalInput): ProposalValidationResult {
  const raw = input.generated as unknown as Record<string, unknown>;

  const question = typeof raw.question === "string" ? normalizeWhitespace(raw.question).slice(0, 180) : "";
  const description = typeof raw.description === "string" ? normalizeWhitespace(raw.description).slice(0, 5000) : "";
  const resolvesYesIf = typeof raw.resolvesYesIf === "string" ? normalizeWhitespace(raw.resolvesYesIf).slice(0, 1500) : "";
  const resolvesNoIf = typeof raw.resolvesNoIf === "string" ? normalizeWhitespace(raw.resolvesNoIf).slice(0, 1500) : "";
  const evidenceRulesRaw = typeof raw.evidenceRules === "string" ? normalizeWhitespace(raw.evidenceRules).slice(0, 1500) : "";
  const disputeRulesRaw = typeof raw.disputeRules === "string" ? normalizeWhitespace(raw.disputeRules).slice(0, 1500) : "";
  const confidence = confidenceFromUnknown(raw.confidence);
  const category = typeof raw.category === "string" ? raw.category.trim().toLowerCase() : "";
  const usFocus = raw.usFocus === true;
  const sources = normalizeSources(raw.sources);

  const closeDate = parseDateValue(typeof raw.closeTime === "string" ? raw.closeTime : null);
  const expectedResolutionDate = parseDateValue(typeof raw.expectedResolutionTime === "string" ? raw.expectedResolutionTime : null);

  const eventFingerprint = deriveEventFingerprint({
    generatedFingerprint: raw.eventFingerprint,
    question,
    category,
    closeTime: closeDate ? closeDate.toISOString() : "",
    scopeKey: input.scopeKey,
  });

  if (!question || !description || !resolvesYesIf || !resolvesNoIf) {
    return {
      ok: false,
      kind: "invalid",
      reason: "Required proposal text fields are missing.",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (question.length < 24) {
    return {
      ok: false,
      kind: "quality",
      reason: "Question title is too short to be clear on card without opening details.",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (hasAmbiguousQuestionSubject(question)) {
    return {
      ok: false,
      kind: "quality",
      reason: "Question title starts with an ambiguous subject (for example: this/that/it/they).",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (!hasExplicitQuestionTimeAnchor(question)) {
    return {
      ok: false,
      kind: "quality",
      reason: "Question title must include an explicit date/season/year anchor for card clarity.",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (!isAllowedCategory(category)) {
    return {
      ok: false,
      kind: "invalid",
      reason: `Category '${category}' is not in allowed taxonomy.`,
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (!closeDate) {
    return {
      ok: false,
      kind: "invalid",
      reason: "closeTime is not a valid ISO datetime.",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (expectedResolutionDate && expectedResolutionDate.getTime() <= closeDate.getTime()) {
    return {
      ok: false,
      kind: "quality",
      reason: "expectedResolutionTime must be after closeTime.",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (confidence < QUALITY_CONFIDENCE_MIN) {
    return {
      ok: false,
      kind: "quality",
      reason: `confidence ${confidence.toFixed(3)} is below minimum ${QUALITY_CONFIDENCE_MIN.toFixed(2)}.`,
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (!withinCloseWindow(closeDate, Date.now())) {
    return {
      ok: false,
      kind: "quality",
      reason: "closeTime is outside the allowed 24h to 45d window.",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  if (!isMutuallyExclusivePredicate(resolvesYesIf, resolvesNoIf)) {
    return {
      ok: false,
      kind: "quality",
      reason: "resolvesYesIf and resolvesNoIf are not mutually exclusive enough.",
      question,
      category,
      confidence,
      eventFingerprint,
      sourcesSnapshot: sources,
    };
  }

  let visibility: "public" | "unlisted" | "private" = "public";
  let accessRules = coerceAccessRules(raw.accessRules);

  if (input.scope === "institution") {
    if (!input.organization) {
      return {
        ok: false,
        kind: "invalid",
        reason: "Institution proposal missing organization context.",
        question,
        category,
        confidence,
        eventFingerprint,
        sourcesSnapshot: sources,
      };
    }
    visibility = "private";
    accessRules = buildInstitutionAccessRules(accessRules, input.organization);
  }

  const feeBpsRaw = typeof raw.feeBps === "number" ? raw.feeBps : Number(raw.feeBps);
  const feeBps = Number.isFinite(feeBpsRaw) ? Math.max(0, Math.min(10000, Math.floor(feeBpsRaw))) : DEFAULT_FEE_BPS;

  const tags = normalizeStringList(raw.tags, 12);
  const riskFlags = normalizeStringList(raw.riskFlags, 10);

  const proposal: AutomationMarketProposalInput = {
    question,
    description,
    resolvesYesIf,
    resolvesNoIf,
    closeTime: closeDate.toISOString(),
    expectedResolutionTime: expectedResolutionDate ? expectedResolutionDate.toISOString() : null,
    evidenceRules: evidenceRulesRaw || DEFAULT_EVIDENCE_RULES,
    disputeRules: disputeRulesRaw || DEFAULT_DISPUTE_RULES,
    feeBps,
    visibility,
    accessRules,
    tags,
    riskFlags,
    sources,
    eventFingerprint,
    scanScope: input.scope,
    cardShadowTone: CATEGORY_TO_CARD_TONE[category],
    organizationId: input.organization?.id ?? null,
    runId: input.runId,
    confidence,
    rationale: typeof raw.rationale === "string" ? normalizeWhitespace(raw.rationale).slice(0, 1000) : "",
  };

  return {
    ok: true,
    proposal,
    confidence,
    category,
    usFocus,
    eventFingerprint,
    sourcesSnapshot: sources,
  };
}
