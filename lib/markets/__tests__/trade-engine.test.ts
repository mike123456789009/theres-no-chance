import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateTradeQuotePayload,
  validateTradeExecutePayload,
  quoteMarketTrade,
  executeMarketTrade,
  TRADE_SIDES,
  TRADE_ACTIONS,
} from "../trade-engine";

describe("Trade Engine - Validation", () => {
  describe("validateTradeQuotePayload", () => {
    it("should validate a correct quote payload", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
        expect(result.data.shares).toBe(100);
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should default maxSlippageBps to 500 when not provided", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should reject invalid side value", () => {
      const payload = {
        side: "maybe",
        action: "buy",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should reject invalid action value", () => {
      const payload = {
        side: "yes",
        action: "hold",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("action must be one of: buy, sell.");
      }
    });

    it("should reject non-numeric shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: "invalid",
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

    it("should reject zero shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 0,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be greater than zero.");
      }
    });

    it("should reject negative shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: -50,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be greater than zero.");
      }
    });

    it("should reject shares exceeding maximum limit", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 1_000_001,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be less than or equal to 1,000,000.");
      }
    });

    it("should accept maximum allowed shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 1_000_000,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should reject invalid maxSlippageBps (negative)", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: -10,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("maxSlippageBps must be between 0 and 10000.");
      }
    });

    it("should reject maxSlippageBps exceeding maximum", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 10_001,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("maxSlippageBps must be between 0 and 10000.");
      }
    });

    it("should floor decimal maxSlippageBps values", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500.9,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should reject non-object payloads", () => {
      const result = validateTradeQuotePayload(null);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Invalid request body.");
      }
    });

    it("should reject array payloads", () => {
      const result = validateTradeQuotePayload([]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Invalid request body.");
      }
    });

    it("should handle case-insensitive side and action", () => {
      const payload = {
        side: "YES",
        action: "BUY",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
      }
    });

    it("should accumulate multiple validation errors", () => {
      const payload = {
        side: "invalid",
        action: "invalid",
        shares: -1,
        maxSlippageBps: -500,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain("side must be one of: yes, no.");
        expect(result.errors).toContain("action must be one of: buy, sell.");
      }
    });
  });

  describe("validateTradeExecutePayload", () => {
    it("should validate a correct execute payload", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500,
        idempotencyKey: "test-key-12345678",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.idempotencyKey).toBe("test-key-12345678");
      }
    });

    it("should reject missing idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("idempotencyKey is required.");
      }
    });

    it("should reject short idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "short",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain(
          "idempotencyKey must be 8-120 characters and use only letters, numbers, :, _, -."
        );
      }
    });

    it("should reject long idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "a".repeat(121),
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain(
          "idempotencyKey must be 8-120 characters and use only letters, numbers, :, _, -."
        );
      }
    });

    it("should accept idempotency key with allowed special characters", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "user:123_trade-456",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should reject idempotency key with invalid characters", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "invalid@key#here",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain(
          "idempotencyKey must be 8-120 characters and use only letters, numbers, :, _, -."
        );
      }
    });

    it("should inherit validation errors from quote payload", () => {
      const payload = {
        side: "invalid",
        action: "buy",
        shares: 100,
        idempotencyKey: "valid-key-12345",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should accumulate both quote and execute validation errors", () => {
      const payload = {
        side: "invalid",
        action: "buy",
        shares: -1,
        idempotencyKey: "bad",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(1);
      }
    });
  });
});

describe("Trade Engine - Service Calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("quoteMarketTrade", () => {
    it("should return error when Supabase service is not configured", async () => {
      const { isSupabaseServiceEnvConfigured, getMissingSupabaseServiceEnv } = await import(
        "@/lib/supabase/service"
      );
      vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
      vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

      const result = await quoteMarketTrade({
        marketId: "test-market",
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(503);
        expect(result.error).toContain("missing service role configuration");
        expect(result.missingEnv).toContain("SUPABASE_SERVICE_ROLE_KEY");
      }
    });

    it("should call Supabase RPC with correct parameters", async () => {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          marketId: "test-market",
          side: "yes",
          action: "buy",
          shares: 100,
          feeBps: 200,
          priceBeforeYes: 0.5,
          priceAfterYes: 0.52,
          priceBeforeSide: 0.5,
          priceAfterSide: 0.52,
          averagePrice: 0.51,
          notional: 51,
          feeAmount: 1.02,
          netCashChange: -52.02,
          slippageBps: 200,
        },
        error: null,
      });

      vi.mocked(createServiceClient).mockReturnValue({
        rpc: mockRpc,
      } as any);

      const result = await quoteMarketTrade({
        marketId: "test-market",
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500,
      });

      expect(mockRpc).toHaveBeenCalledWith("quote_market_trade", {
        p_market_id: "test-market",
        p_side: "yes",
        p_action: "buy",
        p_shares: 100,
        p_max_slippage_bps: 500,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.marketId).toBe("test-market");
        expect(result.data.shares).toBe(100);
      }
    });
  });

  describe("executeMarketTrade", () => {
    it("should return error when Supabase service is not configured", async () => {
      const { isSupabaseServiceEnvConfigured, getMissingSupabaseServiceEnv } = await import(
        "@/lib/supabase/service"
      );
      vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
      vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

      const result = await executeMarketTrade({
        marketId: "test-market",
        userId: "user-123",
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500,
        idempotencyKey: "test-key-12345",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(503);
        expect(result.error).toContain("missing service role configuration");
      }
    });

    it("should call Supabase RPC with correct parameters including idempotency key", async () => {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          marketId: "test-market",
          side: "yes",
          action: "buy",
          shares: 100,
          feeBps: 200,
          priceBeforeYes: 0.5,
          priceAfterYes: 0.52,
          priceBeforeSide: 0.5,
          priceAfterSide: 0.52,
          averagePrice: 0.51,
          notional: 51,
          feeAmount: 1.02,
          netCashChange: -52.02,
          slippageBps: 200,
          reused: false,
          tradeFillId: "fill-123",
          userId: "user-123",
          walletAvailableBalance: 1000,
          positionYesShares: 100,
          positionNoShares: 0,
          positionRealizedPnl: 0,
          executedAt: "2026-02-17T00:00:00Z",
        },
        error: null,
      });

      vi.mocked(createServiceClient).mockReturnValue({
        rpc: mockRpc,
      } as any);

      const result = await executeMarketTrade({
        marketId: "test-market",
        userId: "user-123",
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500,
        idempotencyKey: "test-key-12345",
      });

      expect(mockRpc).toHaveBeenCalledWith("execute_market_trade", {
        p_market_id: "test-market",
        p_user_id: "user-123",
        p_side: "yes",
        p_action: "buy",
        p_shares: 100,
        p_idempotency_key: "test-key-12345",
        p_max_slippage_bps: 500,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.tradeFillId).toBe("fill-123");
        expect(result.data.reused).toBe(false);
      }
    });
  });
});
