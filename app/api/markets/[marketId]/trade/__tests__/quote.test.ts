import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../quote/route";

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
  validateTradeQuotePayload: vi.fn(),
  quoteMarketTrade: vi.fn(),
}));

import { isSupabaseServerEnvConfigured, getMissingSupabaseServerEnv } from "@/lib/supabase/server";
import { getMarketViewerContext, getMarketDetail } from "@/lib/markets/read-markets";
import { validateTradeQuotePayload, quoteMarketTrade } from "@/lib/markets/trade-engine";

describe("/api/markets/[marketId]/trade/quote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("environment configuration", () => {
    it("should return 503 when Supabase is not configured", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(false);
      vi.mocked(getMissingSupabaseServerEnv).mockReturnValue(["NEXT_PUBLIC_SUPABASE_URL"]);

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
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

      expect(response.status).toBe(503);
      expect(data.error).toContain("Trade quote is unavailable");
      expect(data.missingEnv).toContain("NEXT_PUBLIC_SUPABASE_URL");
    });
  });

  describe("request validation", () => {
    it("should return 400 for invalid JSON", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
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
      vi.mocked(validateTradeQuotePayload).mockReturnValue({
        ok: false,
        errors: ["side must be one of: yes, no."],
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "invalid",
          action: "buy",
          shares: 100,
        }),
      });

      const context = { params: Promise.resolve({ marketId: "test-market" }) };
      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Validation failed.");
      expect(data.details).toContain("side must be one of: yes, no.");
    });
  });

  describe("authentication", () => {
    it("should return 401 when user is not authenticated", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeQuotePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
        },
      });
      vi.mocked(getMarketViewerContext).mockResolvedValue({
        isAuthenticated: false,
        userId: null,
        onboardingStatus: null,
        walletBalance: 0,
        isAdmin: false,
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
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

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized.");
    });
  });

  describe("market access", () => {
    it("should return 404 when market not found", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeQuotePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
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

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
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

      expect(response.status).toBe(404);
      expect(data.error).toBe("Market not found.");
    });

    it("should return 409 when market is not open", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeQuotePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
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
          status: "closed",
          feeBps: 200,
          priceYes: 0.5,
          priceNo: 0.5,
        },
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
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

      expect(response.status).toBe(409);
      expect(data.error).toBe("Trade quote unavailable.");
      expect(data.detail).toBe("Market must be open for trading.");
    });
  });

  describe("successful quote", () => {
    it("should return quote data for valid request", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeQuotePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
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
      vi.mocked(quoteMarketTrade).mockResolvedValue({
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
        },
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
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

      expect(response.status).toBe(200);
      expect(data.quote).toBeDefined();
      expect(data.quote.marketId).toBe("test-market");
      expect(data.quote.shares).toBe(100);
      expect(data.market).toBeDefined();
      expect(data.market.id).toBe("test-market");
      expect(data.viewer).toBeDefined();
      expect(data.viewer.userId).toBe("user-123");
    });
  });

  describe("trade engine errors", () => {
    it("should handle trade engine errors", async () => {
      vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
      vi.mocked(validateTradeQuotePayload).mockReturnValue({
        ok: true,
        data: {
          side: "yes",
          action: "buy",
          shares: 100,
          maxSlippageBps: 500,
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
      vi.mocked(quoteMarketTrade).mockResolvedValue({
        ok: false,
        status: 400,
        error: "Trade validation failed.",
        detail: "Insufficient liquidity",
      });

      const request = new Request("http://localhost:3000/api/markets/test-market/trade/quote", {
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
      expect(data.error).toBe("Trade validation failed.");
      expect(data.detail).toBe("Insufficient liquidity");
    });
  });
});
