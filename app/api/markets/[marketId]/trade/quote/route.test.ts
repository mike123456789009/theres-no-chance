import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextResponse } from "next/server";

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
  validateTradeQuotePayload: vi.fn(),
  quoteMarketTrade: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getMarketViewerContext, getMarketDetail } from "@/lib/markets/read-markets";
import { validateTradeQuotePayload, quoteMarketTrade } from "@/lib/markets/trade-engine";

describe("POST /api/markets/[marketId]/trade/quote", () => {
  const mockContext = {
    params: Promise.resolve({ marketId: "test-market-123" }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful quote", () => {
    it("should return quote for valid authenticated request", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

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
      });

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "ok",
        market: {
          id: "test-market-123",
          status: "open",
          feeBps: 200,
          priceYes: 0.55,
          priceNo: 0.45,
        },
      });

      vi.mocked(quoteMarketTrade).mockResolvedValue({
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
        },
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.quote).toBeDefined();
      expect(json.quote.shares).toBe(100);
      expect(json.market).toBeDefined();
      expect(json.market.id).toBe("test-market-123");
      expect(json.viewer.userId).toBe("user-123");
    });
  });

  describe("validation errors", () => {
    it("should return 400 for invalid JSON", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: "invalid json",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Request body must be valid JSON.");
    });

    it("should return 400 for validation failure", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "invalid",
          action: "buy",
          shares: 100,
        }),
      });

      vi.mocked(validateTradeQuotePayload).mockReturnValue({
        ok: false,
        errors: ["side must be one of: yes, no."],
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("Validation failed.");
      expect(json.details).toContain("side must be one of: yes, no.");
    });
  });

  describe("authentication errors", () => {
    it("should return 401 for unauthenticated user", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

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
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Unauthorized.");
    });

    it("should return 401 for login_required market detail", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

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
      });

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "login_required",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe("Unauthorized.");
    });
  });

  describe("market errors", () => {
    it("should return 404 for not found market", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

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
      });

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "not_found",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toBe("Market not found.");
    });

    it("should return 409 for closed market", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

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
      });

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "ok",
        market: {
          id: "test-market-123",
          status: "closed",
          feeBps: 200,
          priceYes: 0.55,
          priceNo: 0.45,
        },
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error).toBe("Trade quote unavailable.");
      expect(json.detail).toBe("Market must be open for trading.");
    });
  });

  describe("quote service errors", () => {
    it("should return appropriate status for quote service error", async () => {
      const mockRequest = new Request("http://localhost/api/markets/test-market-123/trade/quote", {
        method: "POST",
        body: JSON.stringify({
          side: "yes",
          action: "buy",
          shares: 100,
        }),
      });

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
      });

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "ok",
        market: {
          id: "test-market-123",
          status: "open",
          feeBps: 200,
          priceYes: 0.55,
          priceNo: 0.45,
        },
      });

      vi.mocked(quoteMarketTrade).mockResolvedValue({
        ok: false,
        status: 409,
        error: "Insufficient liquidity",
        detail: "Order size exceeds available liquidity",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error).toBe("Insufficient liquidity");
      expect(json.detail).toBe("Order size exceeds available liquidity");
    });
  });
});
