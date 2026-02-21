import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { createOkMarketDetailResult, createTradeQuoteFixture, createViewerContextFixture } from "@/lib/test-helpers/api-mocks";

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

      vi.mocked(getMarketViewerContext).mockResolvedValue(createViewerContextFixture());

      vi.mocked(getMarketDetail).mockResolvedValue(createOkMarketDetailResult());

      vi.mocked(quoteMarketTrade).mockResolvedValue({
        ok: true,
        data: createTradeQuoteFixture(),
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

      vi.mocked(getMarketViewerContext).mockResolvedValue(
        createViewerContextFixture({
          isAuthenticated: false,
          userId: null,
        })
      );

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

      vi.mocked(getMarketViewerContext).mockResolvedValue(createViewerContextFixture());

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

      vi.mocked(getMarketViewerContext).mockResolvedValue(createViewerContextFixture());

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

      vi.mocked(getMarketViewerContext).mockResolvedValue(createViewerContextFixture());

      vi.mocked(getMarketDetail).mockResolvedValue(createOkMarketDetailResult({ status: "closed" }));

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error).toBe("Trade quote unavailable.");
      expect(json.detail).toBe("Market must be open for trading.");
    });

    it("should preserve institution verification guard messaging", async () => {
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

      vi.mocked(getMarketViewerContext).mockResolvedValue(createViewerContextFixture());

      vi.mocked(getMarketDetail).mockResolvedValue({
        kind: "institution_verification_required",
      });

      const response = await POST(mockRequest, mockContext);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Institution verification required.");
      expect(json.detail).toBe("Verify an institution email to quote this market.");
    });

    it("should preserve schema-missing detail passthrough", async () => {
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

      vi.mocked(getMarketViewerContext).mockResolvedValue(createViewerContextFixture());

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

      vi.mocked(getMarketViewerContext).mockResolvedValue(createViewerContextFixture());

      vi.mocked(getMarketDetail).mockResolvedValue(createOkMarketDetailResult());

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
