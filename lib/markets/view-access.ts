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
};

type ViewerAccessResult = {
  allowed: boolean;
  reason: "ok" | "login_required" | "not_discoverable";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasInstitutionAccessRule(accessRules: Record<string, unknown> | null): boolean {
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

export function requiresAuthenticatedViewer(input: Pick<MarketAccessInput, "visibility" | "accessRules">): boolean {
  if (input.visibility !== "public") {
    return true;
  }
  return hasInstitutionAccessRule(input.accessRules);
}

export function canViewerSeeMarket(market: MarketAccessInput, viewer: ViewerAccessInput): ViewerAccessResult {
  const isCreator = Boolean(viewer.userId && viewer.userId === market.creatorId);

  if (!isDiscoverableMarketStatus(market.status) && !isCreator) {
    return { allowed: false, reason: "not_discoverable" };
  }

  if (requiresAuthenticatedViewer(market) && !viewer.isAuthenticated) {
    return { allowed: false, reason: "login_required" };
  }

  return { allowed: true, reason: "ok" };
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
