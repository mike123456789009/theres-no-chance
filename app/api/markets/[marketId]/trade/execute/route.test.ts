import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/api/env-guards", () => ({
  getServerEnvReadiness: vi.fn(() => ({ isConfigured: true, missingEnv: [] })),
  getServiceEnvReadiness: vi.fn(() => ({ isConfigured: false, missingEnv: [] })),
}));

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  isSupabaseServerEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServerEnv: vi.fn(() => []),
}));

vi.mock("@/lib/markets/read-markets", () => ({
  getMarketViewerContext: vi.fn(),
  getMarketDetail: vi.fn(),
}));

vi.mock("@/lib/markets/trade-engine", () => ({
  validateTradeExecutePayload: vi.fn(),
  executeMarketTrade: vi.fn(),
}));

import { getMarketViewerContext, getMarketDetail } from "@/lib/markets/read-markets";
import { validateTradeExecutePayload, executeMarketTrade } from "@/lib/markets/trade-engine";

describe("POST /api/markets/[marketId]/trade/execute", () => {
  const mockContext = {
    params: Promise.resolve({ marketId: "test-market-123" }),
  };
  const baseMarketDetail = {
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
    cardShadowTone: "mint" as const,
    actionRequired: "account_ready" as const,
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
  };

  function okMarketDetail(overrides: Partial<typeof baseMarketDetail> = {}) {
    return {
      kind: "ok" as const,
      market: {
        ...baseMarketDetail,
        ...overrides,
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful execution", () => {
    it("should execute trade and return 201 for new execution", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        headers: {
          "Idempotency-Key": "test-key-12345678",
        },
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "test-key-12345678",
        },
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      vi.mocked(getMarketDetail).mockResolvedValue(okMarketDetail());

      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
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
          reused: false,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 1000,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.execution).toBeDefined();
      expect(json.execution.tradeFillId).toBe("fill-123");
      expect(json.execution.reused).toBe(false);
      expect(json.market.id).toBe("test-market-123");
      expect(json.viewer.userId).toBe("user-123");
    });

    it("should return 200 for reused/duplicate execution", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "duplicate-key-12345678",
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "duplicate-key-12345678",
        },
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      vi.mocked(getMarketDetail).mockResolvedValue(okMarketDetail());

      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
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
          reused: true,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 1000,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.execution.reused).toBe(true);
    });
  });

  describe("idempotency key handling", () => {
    it("should accept idempotency key from header", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        headers: {
          "Idempotency-Key": "header-key-12345678",
        },
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockImplementation((payload: any) => {
        expect(payload.idempotencyKey).toBe("header-key-12345678");
        return {
          ok: true,
          data: {
            side: "yes",
            action: "buy",
            shares: 100,
            maxSlippageBps: 500,
            idempotencyKey: "header-key-12345678",
          },
        };
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      vi.mocked(getMarketDetail).mockResolvedValue(okMarketDetail());

      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
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
          reused: false,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 1000,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      await POST(mockRequest, mockContext);
    });

    it("should prefer header idempotency key over body", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        headers: {
          "Idempotency-Key": "header-key-12345678",
        },
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "body-key-12345678",
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockImplementation((payload: any) => {
        expect(payload.idempotencyKey).toBe("header-key-12345678");
        return {
          ok: true,
          data: {
            side: "yes",
            action: "buy",
            shares: 100,
            maxSlippageBps: 500,
            idempotencyKey: "header-key-12345678",
          },
        };
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      vi.mocked(getMarketDetail).mockResolvedValue(okMarketDetail());

      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
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
          reused: false,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 1000,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      await POST(mockRequest, mockContext);
    });
  });

  describe("validation errors", () => {
    it("should return 400 for invalid JSON", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        body: "invalid json",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Request body must be valid JSON.");
    });

    it("should return 400 for missing idempotency key", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: false,
        errors: ["idempotencyKey is required."],
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Validation failed.");
      expect(json.details).toContain("idempotencyKey is required.");
    });
  });

  describe("authentication errors", () => {
    it("should return 401 for unauthenticated user", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "test-key-12345678",
        },
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: false,
        userId: null,
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Unauthorized.");
    });
  });

  describe("execution service errors", () => {
    it("should return appropriate status for execution failure", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "test-key-12345678",
        },
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      vi.mocked(getMarketDetail).mockResolvedValue(okMarketDetail());

      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: false,
        status: 409,
        error: "Insufficient funds",
        detail: "Wallet balance too low for this trade",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error).toBe("Insufficient funds");
      expect(json.detail).toBe("Wallet balance too low for this trade");
    });
  });

  describe("shared guard behavior", () => {
    it("should preserve institution verification guard messaging", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "test-key-12345678",
        },
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "institution_verification_required",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Institution verification required.");
      expect(json.detail).toBe("Verify an institution email to trade this market.");
    });

    it("should preserve schema-missing detail passthrough", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "test-key-12345678",
        },
      });

      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        activeOrganizationId: null,
        hasActiveInstitution: false,
      });

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "schema_missing",
        message: "relation \"markets\" does not exist",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toBe("Market tables are not provisioned in this environment yet.");
      expect(json.detail).toBe("relation \"markets\" does not exist");
    });
  });
});
