export const DISCOVERABLE_MARKET_STATUSES = [
  "open",
  "trading_halted",
  "closed",
  "pending_resolution",
  "resolved",
  "finalized",
] as const;

type DiscoverableMarketStatus = (typeof DISCOVERABLE_MARKET_STATUSES)[number];

type MarketAccessInput = {
  status: string;
  visibility: string;
  creatorId: string;
  accessRules: Record<string, unknown> | null;
};

type ViewerAccessInput = {
  userId: string | null;
  isAuthenticated: boolean;
  activeOrganizationId?: string | null;
};

export type ViewerAccessReason =
  | "ok"
  | "login_required"
  | "institution_verification_required"
  | "forbidden"
  | "not_discoverable";

export type ViewerAccessResult = {
  allowed: boolean;
  reason: ViewerAccessReason;
  readOnlyLegacy: boolean;
  isInstitutionMarket: boolean;
  requiredOrganizationId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function extractRequiredOrganizationId(accessRules: Record<string, unknown> | null): string | null {
  if (!accessRules) return null;

  const direct = clean(accessRules.organizationId).toLowerCase();
  if (direct && isLikelyUuid(direct)) {
    return direct;
  }

  const list = Array.isArray(accessRules.organizationIds) ? accessRules.organizationIds : [];
  for (const raw of list) {
    const candidate = clean(raw).toLowerCase();
    if (candidate && isLikelyUuid(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function hasInstitutionAccessRule(accessRules: Record<string, unknown> | null): boolean {
  if (!accessRules) return false;

  const valueByKey = [
    accessRules.organizationId,
    accessRules.organizationIds,
    accessRules.institutionDomain,
    accessRules.institutionDomains,
    accessRules.requiredDomain,
    accessRules.requiredDomains,
  ];

  if (
    valueByKey.some((value) => {
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    })
  ) {
    return true;
  }

  if (accessRules.institutionOnly === true) return true;

  const scopeValue = accessRules.scope;
  const visibilityValue = accessRules.visibility;
  const scope = typeof scopeValue === "string" ? scopeValue.toLowerCase() : "";
  const visibility = typeof visibilityValue === "string" ? visibilityValue.toLowerCase() : "";

  return scope === "institution" || visibility === "institution";
}

export function normalizeAccessRules(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return value;
}

export function isDiscoverableMarketStatus(status: string): status is DiscoverableMarketStatus {
  return (DISCOVERABLE_MARKET_STATUSES as readonly string[]).includes(status);
}

export function isInstitutionMarket(input: Pick<MarketAccessInput, "accessRules">): boolean {
  return hasInstitutionAccessRule(input.accessRules);
}

export function requiresAuthenticatedViewer(input: Pick<MarketAccessInput, "visibility" | "accessRules">): boolean {
  if (input.visibility !== "public") {
    return true;
  }

  return hasInstitutionAccessRule(input.accessRules);
}

export function canViewerDiscoverMarket(market: MarketAccessInput, viewer: ViewerAccessInput): ViewerAccessResult {
  const isCreator = Boolean(viewer.userId && viewer.userId === market.creatorId);
  const institutionMarket = isInstitutionMarket(market);
  const requiredOrganizationId = extractRequiredOrganizationId(market.accessRules);
  const activeOrganizationId = clean(viewer.activeOrganizationId).toLowerCase() || null;

  if (!isDiscoverableMarketStatus(market.status) && !isCreator) {
    return {
      allowed: false,
      reason: "not_discoverable",
      readOnlyLegacy: false,
      isInstitutionMarket: institutionMarket,
      requiredOrganizationId,
    };
  }

  if (!institutionMarket) {
    if (requiresAuthenticatedViewer(market) && !viewer.isAuthenticated) {
      return {
        allowed: false,
        reason: "login_required",
        readOnlyLegacy: false,
        isInstitutionMarket: false,
        requiredOrganizationId,
      };
    }

    return {
      allowed: true,
      reason: "ok",
      readOnlyLegacy: false,
      isInstitutionMarket: false,
      requiredOrganizationId,
    };
  }

  if (!viewer.isAuthenticated) {
    return {
      allowed: false,
      reason: "login_required",
      readOnlyLegacy: false,
      isInstitutionMarket: true,
      requiredOrganizationId,
    };
  }

  if (!activeOrganizationId) {
    return {
      allowed: true,
      reason: "ok",
      readOnlyLegacy: false,
      isInstitutionMarket: true,
      requiredOrganizationId,
    };
  }

  if (requiredOrganizationId && activeOrganizationId === requiredOrganizationId) {
    return {
      allowed: true,
      reason: "ok",
      readOnlyLegacy: false,
      isInstitutionMarket: true,
      requiredOrganizationId,
    };
  }

  return {
    allowed: false,
    reason: "forbidden",
    readOnlyLegacy: false,
    isInstitutionMarket: true,
    requiredOrganizationId,
  };
}

export function canViewerAccessMarketDetail(
  market: MarketAccessInput,
  viewer: ViewerAccessInput,
  options?: { hasLegacyPosition?: boolean }
): ViewerAccessResult {
  const isCreator = Boolean(viewer.userId && viewer.userId === market.creatorId);
  const institutionMarket = isInstitutionMarket(market);
  const requiredOrganizationId = extractRequiredOrganizationId(market.accessRules);
  const activeOrganizationId = clean(viewer.activeOrganizationId).toLowerCase() || null;
  const hasLegacyPosition = options?.hasLegacyPosition === true;

  if (!isDiscoverableMarketStatus(market.status) && !isCreator) {
    return {
      allowed: false,
      reason: "not_discoverable",
      readOnlyLegacy: false,
      isInstitutionMarket: institutionMarket,
      requiredOrganizationId,
    };
  }

  if (!institutionMarket) {
    if (requiresAuthenticatedViewer(market) && !viewer.isAuthenticated) {
      return {
        allowed: false,
        reason: "login_required",
        readOnlyLegacy: false,
        isInstitutionMarket: false,
        requiredOrganizationId,
      };
    }

    return {
      allowed: true,
      reason: "ok",
      readOnlyLegacy: false,
      isInstitutionMarket: false,
      requiredOrganizationId,
    };
  }

  if (!viewer.isAuthenticated) {
    return {
      allowed: false,
      reason: "login_required",
      readOnlyLegacy: false,
      isInstitutionMarket: true,
      requiredOrganizationId,
    };
  }

  if (!activeOrganizationId) {
    return {
      allowed: false,
      reason: "institution_verification_required",
      readOnlyLegacy: false,
      isInstitutionMarket: true,
      requiredOrganizationId,
    };
  }

  if (requiredOrganizationId && activeOrganizationId === requiredOrganizationId) {
    return {
      allowed: true,
      reason: "ok",
      readOnlyLegacy: false,
      isInstitutionMarket: true,
      requiredOrganizationId,
    };
  }

  if (hasLegacyPosition) {
    return {
      allowed: true,
      reason: "ok",
      readOnlyLegacy: true,
      isInstitutionMarket: true,
      requiredOrganizationId,
    };
  }

  return {
    allowed: false,
    reason: "forbidden",
    readOnlyLegacy: false,
    isInstitutionMarket: true,
    requiredOrganizationId,
  };
}

export function canViewerSeeMarket(market: MarketAccessInput, viewer: ViewerAccessInput): ViewerAccessResult {
  return canViewerAccessMarketDetail(market, viewer);
}

export function marketAccessBadge(visibility: string, accessRules: Record<string, unknown> | null): string {
  if (visibility === "public" && !hasInstitutionAccessRule(accessRules)) {
    return "Public";
  }

  if (hasInstitutionAccessRule(accessRules)) {
    return "Institution";
  }

  if (visibility === "private") {
    return "Private";
  }

  if (visibility === "unlisted") {
    return "Unlisted";
  }

  return "Restricted";
}
