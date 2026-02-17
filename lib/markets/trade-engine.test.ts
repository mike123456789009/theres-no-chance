import { describe, it, expect } from "vitest";
import {
  validateTradeQuotePayload,
  validateTradeExecutePayload,
  TRADE_SIDES,
  TRADE_ACTIONS,
} from "./trade-engine";

describe("validateTradeQuotePayload", () => {
  describe("valid payloads", () => {
    it("should validate a minimal valid payload", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
        expect(result.data.shares).toBe(100);
        expect(result.data.maxSlippageBps).toBe(500); // default
      }
    });

    it("should validate with custom maxSlippageBps", () => {
      const payload = {
        side: "no",
        action: "sell",
        shares: 50.5,
        maxSlippageBps: 1000,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("no");
        expect(result.data.action).toBe("sell");
        expect(result.data.shares).toBe(50.5);
        expect(result.data.maxSlippageBps).toBe(1000);
      }
    });

    it("should normalize side and action to lowercase", () => {
      const payload = {
        side: "YES",
        action: "BUY",
        shares: 10,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
      }
    });

    it("should handle maxSlippageBps as string number", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: "750",
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(750);
      }
    });

    it("should handle shares at maximum limit", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 1_000_000,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.shares).toBe(1_000_000);
      }
    });

    it("should handle maxSlippageBps at boundaries", () => {
      const payloadZero = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 0,
      };

      const resultZero = validateTradeQuotePayload(payloadZero);
      expect(resultZero.ok).toBe(true);

      const payloadMax = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 10_000,
      };

      const resultMax = validateTradeQuotePayload(payloadMax);
      expect(resultMax.ok).toBe(true);
    });
  });

  describe("invalid payloads - structure", () => {
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

    it("should reject string payload", () => {
      const result = validateTradeQuotePayload("invalid");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Invalid request body.");
      }
    });
  });

  describe("invalid payloads - side", () => {
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

    it("should reject missing side", () => {
      const payload = {
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

  describe("invalid payloads - action", () => {
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
  });

  describe("invalid payloads - shares", () => {
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
        shares: -10,
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

    it("should reject non-numeric shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: "not-a-number",
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

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

    it("should reject NaN shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: NaN,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });

    it("should reject Infinity shares", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: Infinity,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("shares must be a numeric value.");
      }
    });
  });

  describe("invalid payloads - maxSlippageBps", () => {
    it("should reject negative maxSlippageBps", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: -1,
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

    it("should default invalid maxSlippageBps to 500 and report error", () => {
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

    it("should floor decimal maxSlippageBps", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        maxSlippageBps: 750.9,
      };

      const result = validateTradeQuotePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.maxSlippageBps).toBe(750);
      }
    });
  });

  describe("invalid payloads - multiple errors", () => {
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
  describe("valid payloads", () => {
    it("should validate a complete valid payload", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "test-key-12345",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.side).toBe("yes");
        expect(result.data.action).toBe("buy");
        expect(result.data.shares).toBe(100);
        expect(result.data.idempotencyKey).toBe("test-key-12345");
        expect(result.data.maxSlippageBps).toBe(500);
      }
    });

    it("should validate idempotency key with allowed characters", () => {
      const validKeys = [
        "simple-key",
        "key_with_underscores",
        "key:with:colons",
        "ABC123xyz-_:",
        "a".repeat(120), // maximum length
      ];

      validKeys.forEach((key) => {
        const payload = {
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: key,
        };

        const result = validateTradeExecutePayload(payload);
        expect(result.ok).toBe(true);
      });
    });

    it("should validate minimum length idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "12345678", // exactly 8 characters
      };

      const result = validateTradeExecutePayload(payload);
      expect(result.ok).toBe(true);
    });
  });

  describe("invalid payloads - idempotency key", () => {
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

    it("should reject idempotency key that is too short", () => {
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

    it("should reject idempotency key that is too long", () => {
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
      const invalidKeys = [
        "key with spaces",
        "key@with#special",
        "key.with.dots",
        "key/with/slashes",
        "key(with)parens",
      ];

      invalidKeys.forEach((key) => {
        const payload = {
          side: "yes",
          action: "buy",
          shares: 100,
          idempotencyKey: key,
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
  });

  describe("invalid payloads - inherited validation", () => {
    it("should inherit validation errors from quote payload", () => {
      const payload = {
        side: "invalid",
        action: "buy",
        shares: 100,
        idempotencyKey: "valid-key-123",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("side must be one of: yes, no.");
      }
    });

    it("should return both quote and execute validation errors", () => {
      const payload = {
        side: "invalid",
        action: "buy",
        shares: 0,
        idempotencyKey: "short",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(1);
      }
    });
  });

  describe("edge cases", () => {
    it("should trim and validate idempotency key", () => {
      const payload = {
        side: "yes",
        action: "buy",
        shares: 100,
        idempotencyKey: "  valid-key-123  ",
      };

      const result = validateTradeExecutePayload(payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.idempotencyKey).toBe("valid-key-123");
      }
    });
  });
});

describe("trade constants", () => {
  it("should export correct trade sides", () => {
    expect(TRADE_SIDES).toEqual(["yes", "no"]);
  });

  it("should export correct trade actions", () => {
    expect(TRADE_ACTIONS).toEqual(["buy", "sell"]);
  });
});
