import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateTradeQuotePayload,
  validateTradeExecutePayload,
  quoteMarketTrade,
  executeMarketTrade,
  type ValidatedTradeQuotePayload,
  type ValidatedTradeExecutePayload,
} from "../trade-engine";

describe("validateTradeQuotePayload", () => {
  describe("valid inputs", () => {
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

    it("should accept 'no' as a valid side", () => {
      const payload = {
        side: "no",
        action: "sell",
        shares: 50,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("no");
      }
    });

    it("should use default maxSlippageBps when not provided", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500); // DEFAULT_MAX_SLIPPAGE_BPS
      }
    });

    it("should handle case-insensitive side values", () => {
      const payload = {
        side: "YES",
        action: "buy",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
      }
    });

    it("should handle case-insensitive action values", () => {
      const payload = {
        side: "yes",
        action: "SELL",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.action).toBe("sell");
      }
    });
  });

  describe("invalid side", () => {
    it("should reject empty side", () => {
      const payload = {
        side: "",
        action: "buy",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
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
  });

  describe("invalid action", () => {
    it("should reject empty action", () => {
      const payload = {
        side: "yes",
        action: "",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("action must be one of: buy, sell.");
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
  });

  describe("shares validation", () => {
    it("should reject null shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: null,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

    it("should reject non-numeric shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: "abc",
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

    it("should reject shares exceeding maximum", () => {
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

    it("should accept shares at maximum limit", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 1_000_000,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should accept very small positive shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 0.01,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
    });
  });

  describe("maxSlippageBps validation", () => {
    it("should accept valid slippage within bounds", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 1000,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(1000);
      }
    });

    it("should reject negative slippage", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: -100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("maxSlippageBps must be between 0 and 10000.");
      }
    });

    it("should reject slippage exceeding maximum", () => {
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

    it("should accept zero slippage", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 0,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should accept maximum slippage", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 10_000,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should floor decimal slippage values", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 500.99,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should use default when null provided", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: null,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should use default when empty string provided", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: "",
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should report error for non-numeric slippage but still return default", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: "invalid",
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("maxSlippageBps must be a number.");
      }
    });
  });

  describe("invalid request body", () => {
    it("should reject non-object payloads", () => {
      const result = validateTradeQuotePayload("not an object");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Invalid request body.");
      }
    });

    it("should reject null payloads", () => {
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
  });

  describe("multiple validation errors", () => {
    it("should return all validation errors", () => {
      const payload = {
        side: "invalid",
        action: "invalid",
        shares: -1,
        maxSlippageBps: -100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain("side must be one of: yes, no.");
        expect(result.errors).toContain("action must be one of: buy, sell.");
        expect(result.errors).toContain("shares must be greater than zero.");
        expect(result.errors).toContain("maxSlippageBps must be between 0 and 10000.");
      }
    });
  });
});

describe("validateTradeExecutePayload", () => {
  describe("valid inputs", () => {
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
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
        expect(result.data.shares).toBe(100);
        expect(result.data.maxSlippageBps).toBe(500);
        expect(result.data.idempotencyKey).toBe("test-key-12345678");
      }
    });

    it("should accept idempotency keys with colons", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "user:123:trade:456",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should accept idempotency keys with underscores", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade_key_123_456",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should accept idempotency keys with hyphens", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade-key-123-456",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should accept 120 character idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "a".repeat(120),
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
    });

    it("should accept 8 character idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "abcd1234",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
    });
  });

  describe("idempotency key validation", () => {
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

    it("should reject empty idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("idempotencyKey is required.");
      }
    });

    it("should reject idempotency key shorter than 8 characters", () => {
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

    it("should reject idempotency key longer than 120 characters", () => {
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

    it("should reject idempotency key with invalid characters", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "invalid@key#123",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain(
          "idempotencyKey must be 8-120 characters and use only letters, numbers, :, _, -."
        );
      }
    });

    it("should reject idempotency key with spaces", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "key with spaces",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain(
          "idempotencyKey must be 8-120 characters and use only letters, numbers, :, _, -."
        );
      }
    });
  });

  describe("inherits quote validation", () => {
    it("should reject invalid side in execute payload", () => {
      const payload = {
        side: "maybe",
        action: "buy",
        shares: 100,
        idempotencyKey: "test-key-12345678",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should reject invalid shares in execute payload", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 0,
        idempotencyKey: "test-key-12345678",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be greater than zero.");
      }
    });
  });

  describe("multiple validation errors", () => {
    it("should return both quote and execute validation errors", () => {
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

describe("quoteMarketTrade", () => {
  it("should be defined", () => {
    expect(quoteMarketTrade).toBeDefined();
    expect(typeof quoteMarketTrade).toBe("function");
  });

  // Note: Full integration tests for quoteMarketTrade are in the API tests
  // since it requires Supabase service client configuration
});

describe("executeMarketTrade", () => {
  it("should be defined", () => {
    expect(executeMarketTrade).toBeDefined();
    expect(typeof executeMarketTrade).toBe("function");
  });

  // Note: Full integration tests for executeMarketTrade are in the API tests
  // since it requires Supabase service client configuration
});
