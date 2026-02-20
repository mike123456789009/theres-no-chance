import { extractRequiredOrganizationId, hasInstitutionAccessRule } from "@/lib/markets/view-access";

export const MARKET_VISIBILITIES = ["public", "unlisted", "private"] as const;
export const MARKET_SUBMISSION_MODES = ["draft", "review"] as const;
export const MARKET_SOURCE_TYPES = ["official", "supporting", "rules"] as const;
export const MARKET_RESOLUTION_MODES = ["admin", "community"] as const;

export type MarketVisibility = (typeof MARKET_VISIBILITIES)[number];
export type MarketSubmissionMode = (typeof MARKET_SUBMISSION_MODES)[number];
export type MarketSourceType = (typeof MARKET_SOURCE_TYPES)[number];
export type MarketResolutionMode = (typeof MARKET_RESOLUTION_MODES)[number];

export type CreateMarketValidationResult =
  | { ok: true; data: ValidatedCreateMarketPayload }
  | { ok: false; errors: string[] };

export interface ValidatedMarketSource {
  label: string;
  url: string;
  type: MarketSourceType;
}

export interface ValidatedCreateMarketPayload {
  submissionMode: MarketSubmissionMode;
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  closeTime: string;
  expectedResolutionTime: string | null;
  evidenceRules: string | null;
  disputeRules: string | null;
  feeBps: number;
  visibility: MarketVisibility;
  resolutionMode: MarketResolutionMode;
  accessRules: Record<string, unknown>;
  tags: string[];
  riskFlags: string[];
  sources: ValidatedMarketSource[];
}

function defaultResolutionMode(options: {
  visibility: MarketVisibility;
  accessRules: Record<string, unknown>;
}): MarketResolutionMode {
  if (options.visibility === "private") return "community";
  if (hasInstitutionAccessRule(options.accessRules)) return "community";
  return "admin";
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function parseDateValue(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeList(raw: unknown, maxItems: number): string[] {
  if (!Array.isArray(raw)) return [];

  const normalized = raw
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .map((value) => normalizeTag(value))
    .filter((value) => value.length > 0);

  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function validateCreateMarketPayload(raw: unknown): CreateMarketValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, errors: ["Invalid request body."] };
  }

  const errors: string[] = [];

  const submissionModeRaw = cleanText(raw.submissionMode, 12).toLowerCase();
  const submissionMode: MarketSubmissionMode = isOneOf(submissionModeRaw, MARKET_SUBMISSION_MODES)
    ? submissionModeRaw
    : "draft";

  const question = cleanText(raw.question, 180);
  const description = cleanText(raw.description, 5000);
  const resolvesYesIf = cleanText(raw.resolvesYesIf, 1500);
  const resolvesNoIf = cleanText(raw.resolvesNoIf, 1500);
  const closeTimeRaw = cleanText(raw.closeTime, 64);
  const expectedResolutionTimeRaw = cleanText(raw.expectedResolutionTime, 64);
  const evidenceRules = cleanText(raw.evidenceRules, 1500);
  const disputeRules = cleanText(raw.disputeRules, 1500);

  const visibilityRaw = cleanText(raw.visibility, 16).toLowerCase();
  const visibility: MarketVisibility = isOneOf(visibilityRaw, MARKET_VISIBILITIES) ? visibilityRaw : "public";

  const feeBpsRaw = Number(raw.feeBps);
  const feeBps = Number.isFinite(feeBpsRaw) ? Math.floor(feeBpsRaw) : 200;

  const accessRules = isRecord(raw.accessRules) ? raw.accessRules : {};
  const institutionScoped = hasInstitutionAccessRule(accessRules);
  const requiredOrganizationId = extractRequiredOrganizationId(accessRules);
  const resolutionModeRaw = cleanText(raw.resolutionMode, 16).toLowerCase();
  const resolutionMode = isOneOf(resolutionModeRaw, MARKET_RESOLUTION_MODES)
    ? resolutionModeRaw
    : defaultResolutionMode({ visibility, accessRules });
  const tags = normalizeList(raw.tags, 12);
  const riskFlags = normalizeList(raw.riskFlags, 10);

  if (question.length < 12) {
    errors.push("Question must be at least 12 characters.");
  }

  if (description.length < 30) {
    errors.push("Description must be at least 30 characters.");
  }

  if (resolvesYesIf.length < 12) {
    errors.push("Resolves yes condition must be at least 12 characters.");
  }

  if (resolvesNoIf.length < 12) {
    errors.push("Resolves no condition must be at least 12 characters.");
  }

  const closeDate = parseDateValue(closeTimeRaw);
  if (!closeDate) {
    errors.push("Close time must be a valid date/time.");
  } else if (closeDate.getTime() <= Date.now() + 60_000) {
    errors.push("Close time must be in the future.");
  }

  let expectedResolutionDate: Date | null = null;
  if (expectedResolutionTimeRaw) {
    expectedResolutionDate = parseDateValue(expectedResolutionTimeRaw);
    if (!expectedResolutionDate) {
      errors.push("Expected resolution time must be a valid date/time.");
    } else if (closeDate && expectedResolutionDate.getTime() <= closeDate.getTime()) {
      errors.push("Expected resolution time must be after close time.");
    }
  }

  if (feeBps < 0 || feeBps > 10_000) {
    errors.push("Fee basis points must be between 0 and 10000.");
  }

  if (institutionScoped) {
    if (visibility !== "private") {
      errors.push("Institution-gated markets must use private visibility.");
    }

    if (!requiredOrganizationId) {
      errors.push("Institution-gated markets must include a valid organizationId in access rules.");
    }
  }

  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  if (rawSources.length === 0) {
    errors.push("At least one source is required.");
  }
  if (rawSources.length > 8) {
    errors.push("No more than 8 sources are allowed.");
  }

  const sources: ValidatedMarketSource[] = [];
  rawSources.forEach((source, index) => {
    if (!isRecord(source)) {
      errors.push(`Source ${index + 1} is invalid.`);
      return;
    }

    const label = cleanText(source.label, 80);
    const sourceUrl = cleanText(source.url, 1000);
    const sourceTypeRaw = cleanText(source.type, 16).toLowerCase();
    const type: MarketSourceType = isOneOf(sourceTypeRaw, MARKET_SOURCE_TYPES) ? sourceTypeRaw : "official";

    if (label.length < 2) {
      errors.push(`Source ${index + 1} label must be at least 2 characters.`);
      return;
    }

    const normalizedUrl = normalizeUrl(sourceUrl);
    if (!normalizedUrl) {
      errors.push(`Source ${index + 1} URL must be a valid https URL.`);
      return;
    }

    sources.push({
      label,
      url: normalizedUrl,
      type,
    });
  });

  if (!sources.some((source) => source.type === "official")) {
    errors.push("At least one source must be marked as official.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      submissionMode,
      question,
      description,
      resolvesYesIf,
      resolvesNoIf,
      closeTime: closeDate!.toISOString(),
      expectedResolutionTime: expectedResolutionDate ? expectedResolutionDate.toISOString() : null,
      evidenceRules: evidenceRules || null,
      disputeRules: disputeRules || null,
      feeBps,
      visibility,
      resolutionMode,
      accessRules,
      tags,
      riskFlags,
      sources,
    },
  };
}
