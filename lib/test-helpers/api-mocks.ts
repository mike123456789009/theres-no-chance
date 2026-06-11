import type { TradeExecution, TradeQuote } from "@/lib/markets/trade-contract";
import type { MarketDetailDTO, MarketViewerContext } from "@/lib/markets/read-markets";
import type { InstitutionAccessSnapshot } from "@/lib/institutions/contracts";

export function createMarketDetailFixture(overrides: Partial<MarketDetailDTO> = {}): MarketDetailDTO {
  return {
    id: "test-market-123",
    question: "Will this market resolve by the target date?",
    description: "This is a test market description used for route tests.",
    resolvesYesIf: "An eligible source confirms the condition happened.",
    resolvesNoIf: "An eligible source confirms the condition did not happen.",
    status: "open",
    resolutionMode: "admin",
    visibility: "public",
    accessBadge: "Public",
    accessRequiresLogin: false,
    closeTime: "2026-12-31T00:00:00.000Z",
    expectedResolutionTime: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    feeBps: 200,
    tags: [],
    riskFlags: [],
    evidenceRules: null,
    disputeRules: null,
    resolutionOutcome: null,
    provisionalOutcome: null,
    resolvedAt: null,
    provisionalResolvedAt: null,
    finalizedAt: null,
    resolutionWindowEndsAt: null,
    challengeWindowEndsAt: null,
    adjudicationRequired: false,
    adjudicationReason: null,
    voidReason: null,
    challengeBonusRate: 0.1,
    challengeBondAmount: 1,
    listingFeeAmount: 0.5,
    creatorRakePaidAmount: 0,
    creatorRakePaidAt: null,
    finalOutcomeChangedByChallenge: false,
    priceYes: 0.55,
    priceNo: 0.45,
    yesShares: 0,
    noShares: 0,
    poolShares: 0,
    liquidityParameter: 100,
    chartPoints: [{ timestamp: "2026-01-01T00:00:00.000Z", priceYes: 0.55 }],
    viewerPosition: null,
    sources: [],
    cardShadowTone: "mint",
    actionRequired: "account_ready",
    viewerCanTrade: true,
    viewerReadOnlyReason: null,
    resolverStakeCap: 1,
    yesBondTotal: 0,
    noBondTotal: 0,
    challengeCount: 0,
    openChallengeCount: 0,
    viewerResolverBond: null,
    viewerChallenge: null,
    viewerCanResolve: false,
    viewerCanChallenge: false,
    evidence: [],
    resolverPrizeLockedTotal: 0,
    resolverPrizeContributionCount: 0,
    resolverPrizeRecentContributions: [],
    ...overrides,
  };
}

export function createOkMarketDetailResult(overrides: Partial<MarketDetailDTO> = {}) {
  return {
    kind: "ok" as const,
    market: createMarketDetailFixture(overrides),
  };
}

export function createTradeQuoteFixture(overrides: Partial<TradeQuote> = {}): TradeQuote {
  return {
    marketId: "test-market-123",
    side: "yes",
    action: "buy",
    shares: 100,
    feeBps: 200,
    priceBeforeYes: 0.55,
    priceAfterYes: 0.56,
    priceBeforeSide: 0.55,
    priceAfterSide: 0.56,
    averagePrice: 0.555,
    notional: 55.5,
    feeAmount: 1.11,
    netCashChange: -56.61,
    slippageBps: 90,
    ...overrides,
  };
}

export function createTradeExecutionFixture(overrides: Partial<TradeExecution> = {}): TradeExecution {
  return {
    ...createTradeQuoteFixture(),
    reused: false,
    tradeFillId: "fill-123",
    userId: "user-123",
    walletAvailableBalance: 1000,
    positionYesShares: 100,
    positionNoShares: 0,
    positionRealizedPnl: 0,
    executedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

export function createViewerContextFixture(overrides: Partial<MarketViewerContext> = {}): MarketViewerContext {
  return {
    isAuthenticated: true,
    userId: "user-123",
    activeOrganizationId: null,
    hasActiveInstitution: false,
    ...overrides,
  };
}

export function createRouteRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
  } = {}
): Request {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(url, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export function createMockSupabaseAuthUser(overrides: { id?: string; email?: string | null } = {}) {
  return {
    id: overrides.id ?? "user-123",
    email: overrides.email ?? "user@example.edu",
  };
}

export function createMockSupabaseAuth(overrides: { id?: string; email?: string | null; error?: unknown } = {}) {
  return {
    getUser: async () => ({
      data: {
        user: overrides.error ? null : createMockSupabaseAuthUser(overrides),
      },
      error: overrides.error ?? null,
    }),
  };
}

export function createInstitutionAccessSnapshotFixture(
  overrides: Partial<InstitutionAccessSnapshot> = {}
): InstitutionAccessSnapshot {
  return {
    activeMembership: {
      organizationId: "org-123",
      organizationName: "Alpha University",
      organizationSlug: "alpha-university",
      verifiedAt: "2026-01-01T00:00:00.000Z",
    },
    verifiedInstitutionEmails: [],
    pendingChallenge: null,
    canCreateInstitutionMarkets: true,
    ...overrides,
  };
}

export function createVenmoPaymentFixture(
  overrides: Partial<{
    id: string;
    paymentId: string;
    gmailMessageId: string;
    venmoTransactionId: string;
    payerHandle: string;
    amountUsd: number;
    note: string;
    paidAt: string;
  }> = {}
) {
  return {
    id: "venmo-payment-123",
    paymentId: "payment-123",
    gmailMessageId: "msg-123",
    venmoTransactionId: "tx-123",
    payerHandle: "@example",
    amountUsd: 25,
    note: "Payment note VC-ABCD23",
    paidAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
