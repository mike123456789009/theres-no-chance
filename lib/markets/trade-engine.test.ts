import { describe, it, expect } from "vitest";
import {
  validateTradeQuotePayload,
  validateTradeExecutePayload,
  TRADE_SIDES,
  TRADE_ACTIONS,
} from "./trade-engine";

describe("validateTradeQuotePayload", () => {
  describe("valid payloads", () => {
    it("should accept valid buy YES order", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
        expect(result.data.shares).toBe(100);
        expect(result.data.maxSlippageBps).toBe(500); // default
      }
    });

    it("should accept valid sell NO order", () => {
      const result = validateTradeQuotePayload({
        side: "no",
        action: "sell",
        shares: 50.5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("no");
        expect(result.data.action).toBe("sell");
        expect(result.data.shares).toBe(50.5);
      }
    });

    it("should accept custom maxSlippageBps", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 1000,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(1000);
      }
    });

    it("should accept maxSlippageBps as string number", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: "750",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(750);
      }
    });

    it("should accept shares as string number", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: "100.5",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.shares).toBe(100.5);
      }
    });

    it("should handle uppercase side and action", () => {
      const result = validateTradeQuotePayload({
        side: "YES",
        action: "BUY",
        shares: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
      }
    });

    it("should accept minimum valid shares (0.01)", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 0.01,
      });

      expect(result.ok).toBe(true);
    });

    it("should accept maximum valid shares (1,000,000)", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 1_000_000,
      });

      expect(result.ok).toBe(true);
    });

    it("should accept zero slippage", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 0,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(0);
      }
    });

    it("should accept maximum slippage (10,000 bps)", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 10_000,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(10_000);
      }
    });
  });

  describe("invalid payloads", () => {
    it("should reject non-object payload", () => {
      const result = validateTradeQuotePayload("not an object");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Invalid request body.");
      }
    });

    it("should reject null payload", () => {
      const result = validateTradeQuotePayload(null);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Invalid request body.");
      }
    });

    it("should reject array payload", () => {
      const result = validateTradeQuotePayload([]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Invalid request body.");
      }
    });

    it("should reject invalid side", () => {
      const result = validateTradeQuotePayload({
        side: "maybe",
        action: "buy",
        shares: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should reject invalid action", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "trade",
        shares: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("action must be one of: buy, sell.");
      }
    });

    it("should reject missing side", () => {
      const result = validateTradeQuotePayload({
        action: "buy",
        shares: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should reject missing action", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        shares: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("action must be one of: buy, sell.");
      }
    });

    it("should reject missing shares", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

    it("should reject non-numeric shares", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: "abc",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

    it("should reject zero shares", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be greater than zero.");
      }
    });

    it("should reject negative shares", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: -10,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be greater than zero.");
      }
    });

    it("should reject shares over limit", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 1_000_001,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be less than or equal to 1,000,000.");
      }
    });

    it("should reject NaN shares", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: NaN,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

    it("should reject Infinity shares", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: Infinity,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

    it("should reject non-numeric maxSlippageBps", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: "not-a-number",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("maxSlippageBps must be a number.");
      }
    });

    it("should reject negative maxSlippageBps", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: -100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("maxSlippageBps must be between 0 and 10000.");
      }
    });

    it("should reject maxSlippageBps over limit", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 10_001,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("maxSlippageBps must be between 0 and 10000.");
      }
    });

    it("should accumulate multiple errors", () => {
      const result = validateTradeQuotePayload({
        side: "invalid",
        action: "wrong",
        shares: -100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(1);
        expect(result.errors).toContain("side must be one of: yes, no.");
        expect(result.errors).toContain("action must be one of: buy, sell.");
        expect(result.errors).toContain("shares must be greater than zero.");
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty string for side", () => {
      const result = validateTradeQuotePayload({
        side: "",
        action: "buy",
        shares: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should handle whitespace-only side", () => {
      const result = validateTradeQuotePayload({
        side: "   ",
        action: "buy",
        shares: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should use default maxSlippageBps when undefined", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: undefined,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should use default maxSlippageBps when null", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: null,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should use default maxSlippageBps when empty string", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: "",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should floor maxSlippageBps decimal values", () => {
      const result = validateTradeQuotePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 999.9,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(999);
      }
    });
  });
});

describe("validateTradeExecutePayload", () => {
  describe("valid payloads", () => {
    it("should accept valid execute payload with idempotency key", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade-12345678-abcd",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
        expect(result.data.shares).toBe(100);
        expect(result.data.idempotencyKey).toBe("trade-12345678-abcd");
      }
    });

    it("should accept idempotency key with colons", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "user:123:trade:456",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.idempotencyKey).toBe("user:123:trade:456");
      }
    });

    it("should accept idempotency key with underscores", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade_user_456_order_789",
      });

      expect(result.ok).toBe(true);
    });

    it("should accept idempotency key with hyphens", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade-user-456-order-789",
      });

      expect(result.ok).toBe(true);
    });

    it("should accept 8 character idempotency key (minimum)", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "12345678",
      });

      expect(result.ok).toBe(true);
    });

    it("should accept 120 character idempotency key (maximum)", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "a".repeat(120),
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("invalid payloads", () => {
    it("should reject missing idempotency key", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("idempotencyKey is required.");
      }
    });

    it("should reject empty idempotency key", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("idempotencyKey is required.");
      }
    });

    it("should reject idempotency key too short (7 chars)", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "1234567",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("8-120 characters"))).toBe(true);
      }
    });

    it("should reject idempotency key too long (121 chars)", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "a".repeat(121),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("8-120 characters"))).toBe(true);
      }
    });

    it("should reject idempotency key with spaces", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade 12345 abc",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("letters, numbers, :, _, -"))).toBe(true);
      }
    });

    it("should reject idempotency key with special characters", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade@12345#abc",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("letters, numbers, :, _, -"))).toBe(true);
      }
    });

    it("should reject idempotency key with unicode characters", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "trade-🎯-12345",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("letters, numbers, :, _, -"))).toBe(true);
      }
    });

    it("should inherit quote validation errors", () => {
      const result = validateTradeExecutePayload({
        side: "invalid",
        action: "buy",
        shares: -100,
        idempotencyKey: "valid-key-12345",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(1);
      }
    });

    it("should accumulate both quote and execute errors", () => {
      const result = validateTradeExecutePayload({
        side: "invalid",
        action: "buy",
        shares: 100,
        idempotencyKey: "bad",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
        expect(result.errors.some((e) => e.includes("8-120 characters"))).toBe(true);
      }
    });
  });

  describe("edge cases", () => {
    it("should trim whitespace from idempotency key", () => {
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "  trade-12345678  ",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.idempotencyKey).toBe("trade-12345678");
      }
    });

    it("should truncate very long idempotency key to 140 chars before validation", () => {
      const longKey = "a".repeat(150);
      const result = validateTradeExecutePayload({
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: longKey,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("8-120 characters"))).toBe(true);
      }
    });
  });
});

describe("Constants", () => {
  it("should export TRADE_SIDES constant", () => {
    expect(TRADE_SIDES).toEqual(["yes", "no"]);
  });

  it("should export TRADE_ACTIONS constant", () => {
    expect(TRADE_ACTIONS).toEqual(["buy", "sell"]);
  });
});
