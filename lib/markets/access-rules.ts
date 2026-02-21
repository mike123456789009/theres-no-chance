type AccessRuleExtras = Record<string, unknown>;

export type MarketAccessRules = {
  institutionOnly: boolean;
  organizationId: string | null;
  organizationIds: string[];
  institutionDomain: string | null;
  institutionDomains: string[];
  requiredDomain: string | null;
  requiredDomains: string[];
  scope: string | null;
  visibility: string | null;
  cardShadowTone: string | null;
  cardShadowColor: string | null;
  extras: AccessRuleExtras;
};

const ACCESS_RULE_KNOWN_KEYS = new Set([
  "institutionOnly",
  "institution_only",
  "organizationId",
  "organization_id",
  "organizationIds",
  "organization_ids",
  "institutionDomain",
  "institution_domain",
  "institutionDomains",
  "institution_domains",
  "requiredDomain",
  "required_domain",
  "requiredDomains",
  "required_domains",
  "scope",
  "visibility",
  "cardShadowTone",
  "card_shadow_tone",
  "cardShadowColor",
  "card_shadow_color",
]);

export const DEFAULT_MARKET_ACCESS_RULES: MarketAccessRules = {
  institutionOnly: false,
  organizationId: null,
  organizationIds: [],
  institutionDomain: null,
  institutionDomains: [],
  requiredDomain: null,
  requiredDomains: [],
  scope: null,
  visibility: null,
  cardShadowTone: null,
  cardShadowColor: null,
  extras: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanLower(value: unknown): string {
  return clean(value).toLowerCase();
}

function toNonEmpty(value: string): string | null {
  return value.length > 0 ? value : null;
}

function normalizeStringList(value: unknown, lowerCase: boolean): string[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => (lowerCase ? cleanLower(entry) : clean(entry)))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildExtras(source: Record<string, unknown>): AccessRuleExtras {
  const extras: AccessRuleExtras = {};

  for (const [key, value] of Object.entries(source)) {
    if (!ACCESS_RULE_KNOWN_KEYS.has(key)) {
      extras[key] = value;
    }
  }

  return extras;
}

export function normalizeMarketAccessRules(value: unknown): MarketAccessRules {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_MARKET_ACCESS_RULES,
      extras: {},
    };
  }

  const institutionOnly = value.institutionOnly === true || value.institution_only === true;
  const organizationId = toNonEmpty(cleanLower(value.organizationId ?? value.organization_id));
  const organizationIds = Array.from(
    new Set([
      ...normalizeStringList(value.organizationIds, true),
      ...normalizeStringList(value.organization_ids, true),
    ])
  );
  const institutionDomain = toNonEmpty(cleanLower(value.institutionDomain ?? value.institution_domain));
  const institutionDomains = Array.from(
    new Set([
      ...normalizeStringList(value.institutionDomains, true),
      ...normalizeStringList(value.institution_domains, true),
    ])
  );
  const requiredDomain = toNonEmpty(cleanLower(value.requiredDomain ?? value.required_domain));
  const requiredDomains = Array.from(
    new Set([
      ...normalizeStringList(value.requiredDomains, true),
      ...normalizeStringList(value.required_domains, true),
    ])
  );
  const scope = toNonEmpty(cleanLower(value.scope));
  const visibility = toNonEmpty(cleanLower(value.visibility));
  const cardShadowTone = toNonEmpty(cleanLower(value.cardShadowTone ?? value.card_shadow_tone));
  const cardShadowColor = toNonEmpty(cleanLower(value.cardShadowColor ?? value.card_shadow_color));

  return {
    institutionOnly,
    organizationId,
    organizationIds,
    institutionDomain,
    institutionDomains,
    requiredDomain,
    requiredDomains,
    scope,
    visibility,
    cardShadowTone,
    cardShadowColor,
    extras: buildExtras(value),
  };
}

export function hasInstitutionAccessRuleInRules(rules: MarketAccessRules): boolean {
  if (rules.institutionOnly) return true;
  if (rules.scope === "institution" || rules.visibility === "institution") return true;

  return Boolean(
    rules.organizationId ||
      rules.organizationIds.length > 0 ||
      rules.institutionDomain ||
      rules.institutionDomains.length > 0 ||
      rules.requiredDomain ||
      rules.requiredDomains.length > 0
  );
}

export function extractRequiredOrganizationIdFromAccessRules(rules: MarketAccessRules): string | null {
  const direct = rules.organizationId;
  if (direct && isLikelyUuid(direct)) {
    return direct.toLowerCase();
  }

  for (const candidate of rules.organizationIds) {
    if (candidate && isLikelyUuid(candidate)) {
      return candidate.toLowerCase();
    }
  }

  return null;
}

export function withEnforcedOrganizationId(rules: MarketAccessRules, organizationId: string): MarketAccessRules {
  const normalizedOrganizationId = cleanLower(organizationId);
  if (!normalizedOrganizationId) {
    return {
      ...rules,
      institutionOnly: true,
    };
  }

  const organizationIds = Array.from(
    new Set([normalizedOrganizationId, ...rules.organizationIds])
  );

  return {
    ...rules,
    institutionOnly: true,
    organizationId: normalizedOrganizationId,
    organizationIds,
  };
}

export function serializeMarketAccessRules(rules: MarketAccessRules): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    ...rules.extras,
  };

  if (rules.institutionOnly) serialized.institutionOnly = true;
  if (rules.organizationId) serialized.organizationId = rules.organizationId;
  if (rules.organizationIds.length > 0) serialized.organizationIds = rules.organizationIds;
  if (rules.institutionDomain) serialized.institutionDomain = rules.institutionDomain;
  if (rules.institutionDomains.length > 0) serialized.institutionDomains = rules.institutionDomains;
  if (rules.requiredDomain) serialized.requiredDomain = rules.requiredDomain;
  if (rules.requiredDomains.length > 0) serialized.requiredDomains = rules.requiredDomains;
  if (rules.scope) serialized.scope = rules.scope;
  if (rules.visibility) serialized.visibility = rules.visibility;
  if (rules.cardShadowTone) serialized.cardShadowTone = rules.cardShadowTone;
  if (rules.cardShadowColor) serialized.cardShadowColor = rules.cardShadowColor;

  return serialized;
}
