import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
}));

import { createServiceClient } from "@/lib/supabase/service";

const ORIGINAL_ENV = { ...process.env };

type QueryResolver = (input: {
  table: string;
  operation: "select" | "insert" | "update" | "upsert";
  filters: Record<string, unknown>;
  payload: Record<string, unknown> | null;
  terminal: "await" | "single" | "maybeSingle";
}) => Promise<{ data: unknown; error: { message: string } | null }>;

class MockQuery {
  private table: string;
  private resolver: QueryResolver;
  private operation: "select" | "insert" | "update" | "upsert" = "select";
  private filters: Record<string, unknown> = {};
  private payload: Record<string, unknown> | null = null;

  constructor(table: string, resolver: QueryResolver) {
    this.table = table;
    this.resolver = resolver;
  }

  select() {
    if (this.operation === "select") {
      this.operation = "select";
    }
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  in(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: Record<string, unknown>) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  async single() {
    return this.resolver({
      table: this.table,
      operation: this.operation,
      filters: this.filters,
      payload: this.payload,
      terminal: "single",
    });
  }

  async maybeSingle() {
    return this.resolver({
      table: this.table,
      operation: this.operation,
      filters: this.filters,
      payload: this.payload,
      terminal: "maybeSingle",
    });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.resolver({
      table: this.table,
      operation: this.operation,
      filters: this.filters,
      payload: this.payload,
      terminal: "await",
    }).then(onfulfilled as any, onrejected as any);
  }
}

function createMockService(options: {
  existingCredited: boolean;
  rpcErrorMessage?: string;
  fundingIntentRows?: Array<{
    id: string;
    user_id: string;
    requested_amount_usd: number;
    status: string;
  }>;
}) {
  const rpc = vi.fn().mockResolvedValue(
    options.rpcErrorMessage
      ? {
          data: null,
          error: { message: options.rpcErrorMessage },
        }
      : {
          data: {
            ledgerEntryId: "ledger-1",
            reused: false,
          },
          error: null,
        }
  );

  const resolver: QueryResolver = async ({ table, operation, filters, terminal }) => {
    if (table === "venmo_incoming_payments" && operation === "select" && terminal === "maybeSingle") {
      if (filters.provider_payment_id && options.existingCredited) {
        return {
          data: {
            id: "incoming-existing",
            gmail_message_id: "msg-1",
            provider_payment_id: String(filters.provider_payment_id),
            match_status: "credited",
            ledger_entry_id: "ledger-existing",
          },
          error: null,
        };
      }

      return {
        data: null,
        error: null,
      };
    }

    if (table === "funding_intents" && operation === "select" && terminal === "await") {
      return {
        data:
          options.fundingIntentRows ??
          [
            {
              id: "fi-1",
              user_id: "user-1",
              requested_amount_usd: 10,
              status: "awaiting_payment",
            },
          ],
        error: null,
      };
    }

    if (table === "deposit_receipts" && operation === "upsert" && terminal === "single") {
      return {
        data: { id: "receipt-1" },
        error: null,
      };
    }

    if (table === "venmo_incoming_payments" && operation === "insert" && terminal === "single") {
      return {
        data: { id: "incoming-1" },
        error: null,
      };
    }

    if (
      (table === "deposit_receipts" || table === "funding_intents" || table === "venmo_incoming_payments") &&
      operation === "update" &&
      terminal === "await"
    ) {
      return {
        data: null,
        error: null,
      };
    }

    return {
      data: null,
      error: null,
    };
  };

  return {
    from: vi.fn((table: string) => new MockQuery(table, resolver)),
    rpc,
  };
}

describe("POST /api/payments/venmo/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      VENMO_RECONCILE_BEARER_SECRET: "test-secret",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("credits gross amount when payment auto-matches", async () => {
    const service = createMockService({ existingCredited: false });
    vi.mocked(createServiceClient).mockReturnValue(service as any);

    const request = new Request("http://localhost/api/payments/venmo/reconcile", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        payments: [
          {
            gmailMessageId: "msg-1",
            venmoTransactionId: "tx-1",
            amountUsd: 10,
            note: "Payment note VC-ABCD23",
          },
        ],
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.credited).toBe(1);
    expect(json.creditedNetTotalUsd).toBe(10);
    expect(service.rpc).toHaveBeenCalledTimes(1);
    expect(service.rpc.mock.calls[0][1].p_amount).toBe(10);
  });

  it("treats already-credited incoming rows as duplicates", async () => {
    const service = createMockService({ existingCredited: true });
    vi.mocked(createServiceClient).mockReturnValue(service as any);

    const request = new Request("http://localhost/api/payments/venmo/reconcile", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        payments: [
          {
            gmailMessageId: "msg-1",
            venmoTransactionId: "tx-1",
            amountUsd: 10,
            note: "Payment note VC-ABCD23",
          },
        ],
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.duplicates).toBe(1);
    expect(json.credited).toBe(0);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("returns 401 when authorization header is missing or invalid", async () => {
    const service = createMockService({ existingCredited: false });
    vi.mocked(createServiceClient).mockReturnValue(service as any);

    const request = new Request("http://localhost/api/payments/venmo/reconcile", {
      method: "POST",
      body: JSON.stringify({
        payments: [
          {
            gmailMessageId: "msg-1",
            venmoTransactionId: "tx-1",
            amountUsd: 10,
            note: "Payment note VC-ABCD23",
          },
        ],
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized reconcile request.");
  });

  it("returns 400 for malformed or empty payments payloads", async () => {
    const service = createMockService({ existingCredited: false });
    vi.mocked(createServiceClient).mockReturnValue(service as any);

    const malformedRequest = new Request("http://localhost/api/payments/venmo/reconcile", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret",
        "Content-Type": "application/json",
      },
      body: "{not valid json",
    });

    const malformedResponse = await POST(malformedRequest);
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(400);
    expect(malformedJson.error).toBe("Request body must be valid JSON.");

    const emptyPaymentsRequest = new Request("http://localhost/api/payments/venmo/reconcile", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({ payments: [] }),
    });

    const emptyPaymentsResponse = await POST(emptyPaymentsRequest);
    const emptyPaymentsJson = await emptyPaymentsResponse.json();

    expect(emptyPaymentsResponse.status).toBe(400);
    expect(emptyPaymentsJson.error).toBe("payments must be a non-empty array.");
  });

  it("counts provider RPC failures without crashing the batch", async () => {
    const service = createMockService({
      existingCredited: false,
      rpcErrorMessage: "rpc apply_wallet_credit unavailable",
    });
    vi.mocked(createServiceClient).mockReturnValue(service as any);

    const request = new Request("http://localhost/api/payments/venmo/reconcile", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret",
      },
      body: JSON.stringify({
        payments: [
          {
            gmailMessageId: "msg-1",
            venmoTransactionId: "tx-1",
            amountUsd: 10,
            note: "Payment note VC-ABCD23",
          },
        ],
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.processed).toBe(1);
    expect(json.credited).toBe(0);
    expect(json.errors).toBe(1);
  });
});
