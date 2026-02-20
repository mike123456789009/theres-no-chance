import crypto from "node:crypto";

export const INSTITUTION_CHALLENGE_TTL_MINUTES = 15;
export const INSTITUTION_CHALLENGE_RESEND_COOLDOWN_SECONDS = 60;
export const INSTITUTION_CHALLENGE_MAX_ATTEMPTS = 5;
export const INSTITUTION_CHALLENGE_MAX_STARTS_PER_HOUR = 8;
export const INSTITUTION_CHALLENGE_MAX_STARTS_PER_EMAIL_PER_HOUR = 6;

export type InstitutionOrganization = {
  id: string;
  name: string;
  slug: string;
};

export type InstitutionDomainCandidate = InstitutionOrganization & {
  domain: string;
  allowSubdomains: boolean;
  matchType: "exact" | "suffix";
  specificity: number;
};

export type ResolveInstitutionResult =
  | {
      kind: "resolved";
      organization: InstitutionOrganization;
      candidates: InstitutionDomainCandidate[];
      createdOrganization: boolean;
    }
  | {
      kind: "ambiguous";
      candidates: InstitutionDomainCandidate[];
    }
  | {
      kind: "no_match";
      candidates: InstitutionDomainCandidate[];
    };

type OrganizationDomainRow = {
  organization_id: string;
  domain: string;
  allow_subdomains: boolean;
  organizations?:
    | {
        id?: string;
        name?: string;
        slug?: string;
      }
    | Array<{
        id?: string;
        name?: string;
        slug?: string;
      }>
    | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeInstitutionName(value: unknown): string {
  return clean(value).replace(/\s+/g, " ").slice(0, 120);
}

export function normalizeInstitutionEmail(value: unknown): { email: string; domain: string } | null {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return null;

  if (normalized.length > 320) return null;
  if (!normalized.includes("@")) return null;

  const [local, domain, ...rest] = normalized.split("@");
  if (rest.length > 0) return null;
  if (!local || !domain) return null;

  if (!/^[a-z0-9._%+-]+$/.test(local)) return null;
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  if (!domain.includes(".")) return null;
  if (domain.startsWith(".") || domain.endsWith(".")) return null;

  return {
    email: `${local}@${domain}`,
    domain,
  };
}

export function isEduDomain(domain: string): boolean {
  const normalized = clean(domain).toLowerCase();
  return /(^|\.)edu$/.test(normalized);
}

function scoreMatch(matchType: "exact" | "suffix", specificity: number): number {
  const base = matchType === "exact" ? 10_000 : 1_000;
  return base + specificity;
}

function pickOrganizationShape(row: OrganizationDomainRow): InstitutionOrganization | null {
  const nested = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  const id = clean(nested?.id) || clean(row.organization_id);
  const name = clean(nested?.name);
  const slug = clean(nested?.slug);

  if (!id || !name || !slug) return null;
  if (!isLikelyUuid(id)) return null;

  return { id, name, slug };
}

function compareCandidates(a: InstitutionDomainCandidate, b: InstitutionDomainCandidate): number {
  const scoreA = scoreMatch(a.matchType, a.specificity);
  const scoreB = scoreMatch(b.matchType, b.specificity);

  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  const nameCompare = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  if (nameCompare !== 0) return nameCompare;

  const slugCompare = a.slug.localeCompare(b.slug, "en", { sensitivity: "base" });
  if (slugCompare !== 0) return slugCompare;

  return a.id.localeCompare(b.id);
}

function slugifyBase(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);

  return slug || "institution";
}

export function generateInstitutionSlugCandidates(name: string, domain: string): string[] {
  const baseName = slugifyBase(name);
  const domainBase = slugifyBase(domain.replace(/\.edu$/, ""));
  const primary = baseName;
  const fallback = `${baseName}-${domainBase}`.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 58);

  const candidates = [primary, fallback || primary];
  const unique: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!unique.includes(candidate)) {
      unique.push(candidate);
    }
  }

  return unique;
}

export function randomNumericCode(length = 6): string {
  const safeLength = Math.max(4, Math.min(10, Math.floor(length)));
  const max = 10 ** safeLength;
  return crypto.randomInt(0, max).toString().padStart(safeLength, "0");
}

export function hashInstitutionVerificationCode(input: { challengeId: string; code: string }): string {
  const secret =
    clean(process.env.INSTITUTION_EMAIL_CODE_SECRET) ||
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    "institution-dev-secret";

  return crypto
    .createHash("sha256")
    .update(`${secret}:${input.challengeId}:${clean(input.code)}`)
    .digest("hex");
}

export function collectInstitutionDomainCandidates(input: {
  emailDomain: string;
  rows: OrganizationDomainRow[];
}): InstitutionDomainCandidate[] {
  const normalizedDomain = clean(input.emailDomain).toLowerCase();
  if (!normalizedDomain) return [];

  const bestByOrganization = new Map<string, InstitutionDomainCandidate>();

  for (const row of input.rows) {
    const organization = pickOrganizationShape(row);
    if (!organization) continue;

    const domain = clean(row.domain).toLowerCase();
    if (!domain) continue;

    const allowSubdomains = row.allow_subdomains !== false;
    let matchType: "exact" | "suffix" | null = null;

    if (normalizedDomain === domain) {
      matchType = "exact";
    } else if (allowSubdomains && normalizedDomain.endsWith(`.${domain}`)) {
      matchType = "suffix";
    }

    if (!matchType) continue;

    const candidate: InstitutionDomainCandidate = {
      ...organization,
      domain,
      allowSubdomains,
      matchType,
      specificity: domain.length,
    };

    const existing = bestByOrganization.get(candidate.id);
    if (!existing || compareCandidates(candidate, existing) < 0) {
      bestByOrganization.set(candidate.id, candidate);
    }
  }

  return Array.from(bestByOrganization.values()).sort(compareCandidates);
}

export function resolveInstitutionCandidate(input: {
  candidates: InstitutionDomainCandidate[];
  selectedOrganizationId?: string;
}): ResolveInstitutionResult {
  const selectedOrganizationId = clean(input.selectedOrganizationId);
  const candidates = [...input.candidates].sort(compareCandidates);

  if (selectedOrganizationId) {
    const selected = candidates.find((candidate) => candidate.id === selectedOrganizationId);
    if (selected) {
      return {
        kind: "resolved",
        organization: {
          id: selected.id,
          name: selected.name,
          slug: selected.slug,
        },
        candidates,
        createdOrganization: false,
      };
    }
  }

  if (candidates.length === 0) {
    return {
      kind: "no_match",
      candidates,
    };
  }

  if (candidates.length > 1) {
    return {
      kind: "ambiguous",
      candidates,
    };
  }

  const [single] = candidates;
  return {
    kind: "resolved",
    organization: {
      id: single.id,
      name: single.name,
      slug: single.slug,
    },
    candidates,
    createdOrganization: false,
  };
}
