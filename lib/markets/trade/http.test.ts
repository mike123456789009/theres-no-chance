import { describe, expect, it } from "vitest";

import {
  buildTradeDetailGuards,
  normalizeExecutePayloadWithIdempotencyKey,
  tradeUnavailableMessage,
} from "./http";

describe("normalizeExecutePayloadWithIdempotencyKey", () => {
  it("uses idempotency key from header when body key is missing", () => {
    const payload = {
      side: "yes",
      action: "buy",
      shares: 10,
    };

    const headers = new Headers({
      "Idempotency-Key": "header-key-12345678",
    });

    expect(normalizeExecutePayloadWithIdempotencyKey(payload, headers)).toEqual({
      side: "yes",
      action: "buy",
      shares: 10,
      idempotencyKey: "header-key-12345678",
    });
  });

  it("prefers header idempotency key over body key", () => {
    const payload = {
      side: "yes",
      action: "buy",
      shares: 10,
      idempotencyKey: "body-key-87654321",
    };

    const headers = new Headers({
      "Idempotency-Key": "header-key-12345678",
    });

    expect(normalizeExecutePayloadWithIdempotencyKey(payload, headers)).toEqual({
      side: "yes",
      action: "buy",
      shares: 10,
      idempotencyKey: "header-key-12345678",
    });
  });

  it("keeps body idempotency key when header is absent", () => {
    const payload = {
      side: "yes",
      action: "buy",
      shares: 10,
      idempotencyKey: "body-key-87654321",
    };

    const headers = new Headers();

    expect(normalizeExecutePayloadWithIdempotencyKey(payload, headers)).toEqual({
      side: "yes",
      action: "buy",
      shares: 10,
      idempotencyKey: "body-key-87654321",
    });
  });

  it("returns non-record payload unchanged", () => {
    expect(normalizeExecutePayloadWithIdempotencyKey("raw", new Headers())).toBe("raw");
  });
});

describe("trade http helpers", () => {
  it("builds quote and execution guard messaging", () => {
    const quoteGuards = buildTradeDetailGuards("quote");
    const executeGuards = buildTradeDetailGuards("execution");

    expect(quoteGuards.institutionVerificationRequired.detail).toBe(
      "Verify an institution email to quote this market."
    );
    expect(executeGuards.institutionVerificationRequired.detail).toBe(
      "Verify an institution email to trade this market."
    );
  });

  it("returns mode-specific env unavailable messages", () => {
    expect(tradeUnavailableMessage("quote")).toContain("Trade quote is unavailable");
    expect(tradeUnavailableMessage("execution")).toContain("Trade execution is unavailable");
  });
});
