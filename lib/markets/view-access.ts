import {
  extractRequiredOrganizationIdFromAccessRules,
  hasInstitutionAccessRuleInRules,
  normalizeMarketAccessRules,
  type MarketAccessRules,
} from "@/lib/markets/access-rules";

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
  accessRules: MarketAccessRules;
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAccessRules(value: unknown): MarketAccessRules {
  return normalizeMarketAccessRules(value);
}

export function extractRequiredOrganizationId(accessRules: MarketAccessRules): string | null {
  return extractRequiredOrganizationIdFromAccessRules(accessRules);
}

export function hasInstitutionAccessRule(accessRules: MarketAccessRules): boolean {
  return hasInstitutionAccessRuleInRules(accessRules);
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

function accessResult(input: {
  allowed: boolean;
  reason: ViewerAccessReason;
  readOnlyLegacy?: boolean;
  isInstitutionMarket: boolean;
  requiredOrganizationId: string | null;
}): ViewerAccessResult {
  return {
    allowed: input.allowed,
    reason: input.reason,
    readOnlyLegacy: input.readOnlyLegacy === true,
    isInstitutionMarket: input.isInstitutionMarket,
    requiredOrganizationId: input.requiredOrganizationId,
  };
}

function evaluateViewerMarketAccess(
  mode: "discovery" | "detail",
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
    return accessResult({
      allowed: false,
      reason: "not_discoverable",
      isInstitutionMarket: institutionMarket,
      requiredOrganizationId,
    });
  }

  if (!institutionMarket) {
    if (requiresAuthenticatedViewer(market) && !viewer.isAuthenticated) {
      return accessResult({
        allowed: false,
        reason: "login_required",
        isInstitutionMarket: false,
        requiredOrganizationId,
      });
    }

    return accessResult({
      allowed: true,
      reason: "ok",
      isInstitutionMarket: false,
      requiredOrganizationId,
    });
  }

  if (!viewer.isAuthenticated) {
    return accessResult({
      allowed: false,
      reason: "login_required",
      isInstitutionMarket: true,
      requiredOrganizationId,
    });
  }

  if (!activeOrganizationId) {
    return accessResult({
      allowed: mode === "discovery",
      reason: mode === "discovery" ? "ok" : "institution_verification_required",
      isInstitutionMarket: true,
      requiredOrganizationId,
    });
  }

  if (requiredOrganizationId && activeOrganizationId === requiredOrganizationId) {
    return accessResult({
      allowed: true,
      reason: "ok",
      isInstitutionMarket: true,
      requiredOrganizationId,
    });
  }

  if (hasLegacyPosition) {
    return accessResult({
      allowed: true,
      reason: "ok",
      readOnlyLegacy: true,
      isInstitutionMarket: true,
      requiredOrganizationId,
    });
  }

  return accessResult({
    allowed: false,
    reason: "forbidden",
    isInstitutionMarket: true,
    requiredOrganizationId,
  });
}

export function canViewerDiscoverMarket(market: MarketAccessInput, viewer: ViewerAccessInput): ViewerAccessResult {
  return evaluateViewerMarketAccess("discovery", market, viewer);
}

export function canViewerAccessMarketDetail(
  market: MarketAccessInput,
  viewer: ViewerAccessInput,
  options?: { hasLegacyPosition?: boolean }
): ViewerAccessResult {
  return evaluateViewerMarketAccess("detail", market, viewer, options);
}

export function canViewerSeeMarket(market: MarketAccessInput, viewer: ViewerAccessInput): ViewerAccessResult {
  return canViewerAccessMarketDetail(market, viewer);
}

export function marketAccessBadge(visibility: string, accessRules: MarketAccessRules): string {
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
