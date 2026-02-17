import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../execute/route";

// Mock the dependencies
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

import { isSupabaseServerEnvConfigured, getMissingSupabaseServerEnv } from "@/lib/supabase/server";
import { getMarketViewerContext, getMarketDetail } from "@/lib/markets/read-markets";
import { validateTradeExecutePayload, executeMarketTrade } from "@/lib/markets/trade-engine";

describe("/api/markets/[marketId]/trade/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("environment configuration", () => {
    it("should return 503 when Supabase is not configured", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(false);
      vi.mocked(getMissingSupabaseServerEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toContain("Trade execution is unavailable");
      expect(data.missingEnv).toContain("SUPABASE_SERVICE_ROLE_KEY");
    });
  });

  describe("request validation", () => {
    it("should return 400 for invalid JSON", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: "invalid json",
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Request body must be valid JSON.");
    });

    it("should return 400 for invalid payload", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: false,
        errors: ["idempotencyKey is required."],
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed.");
      expect(data.details).toContain("idempotencyKey is required.");
    });
  });

  describe("idempotency key handling", () => {
    it("should accept idempotency key from request header", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "header-key-12345678",
        },
      });
      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        onboardingStatus: "complete",
        walletBalance: 1000,
        isAdmin: false,
      });
      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "success",
        market: {
          id: "test-market",
          status: "open",
          feeBps: 200,
          priceYes: 0.5,
          priceNo: 0.5,
        },
      });
      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
          marketId: "test-market",
          side: "yes",
          action: "buy",
          shares: 100,
          feeBps: 200,
          priceBeforeYes: 0.5,
          priceAfterYes: 0.51,
          priceBeforeSide: 0.5,
          priceAfterSide: 0.51,
          averagePrice: 0.505,
          notional: 50.5,
          feeAmount: 0.1,
          netCashChange: -50.6,
          slippageBps: 100,
          reused: false,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 949.4,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
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

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);

      expect(response.status).toBe(201);
      expect(validateTradeExecutePayload).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "header-key-12345678",
        })
      );
    });

    it("should prioritize header over body idempotency key", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeExecutePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
          idempotencyKey: "header-key-12345678",
        },
      });
      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: true,
        userId: "user-123",
        onboardingStatus: "complete",
        walletBalance: 1000,
        isAdmin: false,
      });
      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "success",
        market: {
          id: "test-market",
          status: "open",
          feeBps: 200,
        },
      });
      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
          marketId: "test-market",
          side: "yes",
          action: "buy",
          shares: 100,
          feeBps: 200,
          priceBeforeYes: 0.5,
          priceAfterYes: 0.51,
          priceBeforeSide: 0.5,
          priceAfterSide: 0.51,
          averagePrice: 0.505,
          notional: 50.5,
          feeAmount: 0.1,
          netCashChange: -50.6,
          slippageBps: 100,
          reused: false,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 949.4,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        headers: {
          "Idempotency-Key": "header-key-12345678",
        },
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "body-key-87654321",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      await POST(request, context);

      expect(validateTradeExecutePayload).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "header-key-12345678",
        })
      );
    });
  });

  describe("authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
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
        onboardingStatus: null,
        walletBalance: 0,
        isAdmin: false,
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized.");
    });
  });

  describe("market access", () => {
    it("should return 404 when market not found", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
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
        onboardingStatus: "complete",
        walletBalance: 1000,
        isAdmin: false,
      });
      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "not_found",
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Market not found.");
    });

    it("should return 409 when market is not open", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
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
        onboardingStatus: "complete",
        walletBalance: 1000,
        isAdmin: false,
      });
      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "success",
        market: {
          id: "test-market",
          status: "resolved",
          feeBps: 200,
        },
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Trade execution unavailable.");
      expect(data.detail).toBe("Market must be open for trading.");
    });
  });

  describe("successful execution", () => {
    it("should return 201 for new execution", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
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
        onboardingStatus: "complete",
        walletBalance: 1000,
        isAdmin: false,
      });
      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "success",
        market: {
          id: "test-market",
          status: "open",
          feeBps: 200,
        },
      });
      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
          marketId: "test-market",
          side: "yes",
          action: "buy",
          shares: 100,
          feeBps: 200,
          priceBeforeYes: 0.5,
          priceAfterYes: 0.51,
          priceBeforeSide: 0.5,
          priceAfterSide: 0.51,
          averagePrice: 0.505,
          notional: 50.5,
          feeAmount: 0.1,
          netCashChange: -50.6,
          slippageBps: 100,
          reused: false,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 949.4,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.execution).toBeDefined();
      expect(data.execution.tradeFillId).toBe("fill-123");
      expect(data.execution.reused).toBe(false);
      expect(data.market).toBeDefined();
      expect(data.viewer).toBeDefined();
    });

    it("should return 200 for reused execution (idempotent request)", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
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
        onboardingStatus: "complete",
        walletBalance: 1000,
        isAdmin: false,
      });
      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "success",
        market: {
          id: "test-market",
          status: "open",
          feeBps: 200,
        },
      });
      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: true,
        data: {
          marketId: "test-market",
          side: "yes",
          action: "buy",
          shares: 100,
          feeBps: 200,
          priceBeforeYes: 0.5,
          priceAfterYes: 0.51,
          priceBeforeSide: 0.5,
          priceAfterSide: 0.51,
          averagePrice: 0.505,
          notional: 50.5,
          feeAmount: 0.1,
          netCashChange: -50.6,
          slippageBps: 100,
          reused: true,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 949.4,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2024-01-01T00:00:00Z",
        },
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.execution.reused).toBe(true);
    });
  });

  describe("trade engine errors", () => {
    it("should handle trade engine errors", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
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
        onboardingStatus: "complete",
        walletBalance: 1000,
        isAdmin: false,
      });
      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "success",
        market: {
          id: "test-market",
          status: "open",
          feeBps: 200,
        },
      });
      vi.mocked(executeMarketTrade).mockResolvedValue({
        ok: false,
        status: 409,
        error: "Trade cannot be executed.",
        detail: "Insufficient funds",
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/execute", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: "test-key-12345678",
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("Trade cannot be executed.");
      expect(data.detail).toBe("Insufficient funds");
    });
  });
});
