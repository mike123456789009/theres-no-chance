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
