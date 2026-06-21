import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAllowlistedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
}));

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";

import { POST } from "./route";

const MATCH_URL = "http://localhost/api/admin/payments/venmo/match";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryInput = {
  table: string;
  operation: "select" | "update" | "upsert";
  filters: Record<string, unknown>;
  payload: Record<string, unknown> | null;
  terminal: "await" | "single" | "maybeSingle";
};

type QueryResolver = (input: QueryInput) => Promise<QueryResult>;

class MockQuery {
  private operation: QueryInput["operation"] = "select";
  private filters: Record<string, unknown> = {};
  private payload: Record<string, unknown> | null = null;

  constructor(
    private table: string,
    private resolver: QueryResolver
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
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
    return this.resolve("single");
  }

  async maybeSingle() {
    return this.resolve("maybeSingle");
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.resolve("await").then(onfulfilled, onrejected);
  }

  private resolve(terminal: QueryInput["terminal"]) {
    return this.resolver({
      table: this.table,
      operation: this.operation,
      filters: this.filters,
      payload: this.payload,
      terminal,
    });
  }
}

function createMatchRequest(body: unknown = validBody()) {
  return createRouteRequest(MATCH_URL, { body });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    incomingPaymentId: "incoming-1",
    fundingIntentId: "intent-1",
    ...overrides,
  };
}

function asServiceClient(client: ReturnType<typeof createMatchServiceMock>["client"]): ReturnType<typeof createServiceClient> {
  return client as unknown as ReturnType<typeof createServiceClient>;
}

function createMatchServiceMock(options: {
  incomingRow?: Record<string, unknown> | null;
  incomingError?: { message: string } | null;
  intentRow?: Record<string, unknown> | null;
  intentError?: { message: string } | null;
  receiptError?: { message: string } | null;
  receiptId?: string | null;
  rpcData?: Record<string, unknown> | null;
  rpcError?: { message: string } | null;
} = {}) {
  const incomingRow =
    options.incomingRow === undefined
      ? {
          id: "incoming-1",
          gmail_message_id: "gmail-1",
          venmo_transaction_id: "tx-1",
          provider_payment_id: "venmo-payment-1",
          gross_amount_usd: 25,
          note: "TNC-123",
          payer_display_name: "Payer Person",
          payer_handle: "@payer",
          match_status: "review_required",
        }
      : options.incomingRow;
  const intentRow =
    options.intentRow === undefined
      ? {
          id: "intent-1",
          user_id: "user-1",
          provider: "venmo",
          status: "awaiting_payment",
          requested_amount_usd: 25,
          invoice_code: "TNC-123",
        }
      : options.intentRow;
  const receiptId = options.receiptId === undefined ? "receipt-1" : options.receiptId;
  const updates: Array<{
    table: string;
    payload: Record<string, unknown>;
    filters: Record<string, unknown>;
  }> = [];

  const rpc = vi.fn(async () => ({
    data:
      options.rpcData === undefined
        ? {
            ledgerEntryId: "ledger-1",
            reused: false,
          }
        : options.rpcData,
    error: options.rpcError ?? null,
  }));

  const resolver: QueryResolver = async ({ table, operation, filters, payload, terminal }) => {
    if (table === "venmo_incoming_payments" && operation === "select" && terminal === "maybeSingle") {
      return {
        data: options.incomingError ? null : incomingRow,
        error: options.incomingError ?? null,
      };
    }

    if (table === "funding_intents" && operation === "select" && terminal === "maybeSingle") {
      return {
        data: options.intentError ? null : intentRow,
        error: options.intentError ?? null,
      };
    }

    if (table === "deposit_receipts" && operation === "upsert" && terminal === "single") {
      return {
        data: options.receiptError ? null : receiptId ? { id: receiptId } : null,
        error: options.receiptError ?? null,
      };
    }

    if (operation === "update" && terminal === "await") {
      updates.push({
        table,
        payload: payload ?? {},
        filters,
      });
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
    client: {
      from: vi.fn((table: string) => new MockQuery(table, resolver)),
      rpc,
    },
    rpc,
    updates,
  };
}

describe("POST /api/admin/payments/venmo/match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: true,
      adminUser: ADMIN_USER,
    });
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(createMatchServiceMock().client));
  });

  it("returns the admin guard response before checking service configuration", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createMatchRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(createMatchRequest());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Manual Venmo matching unavailable: missing service environment variables.");
    expect(json.missingEnv).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and missing ids before loading payment rows", async () => {
    const malformedResponse = await POST(
      new Request(MATCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{bad json",
      })
    );
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(400);
    expect(malformedJson.error).toBe("Request body must be valid JSON.");

    const missingResponse = await POST(createMatchRequest({ incomingPaymentId: " ", fundingIntentId: "" }));
    const missingJson = await missingResponse.json();

    expect(missingResponse.status).toBe(400);
    expect(missingJson.error).toBe("incomingPaymentId and fundingIntentId are required.");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 404 when incoming payment or funding intent rows are missing", async () => {
    const missingIncoming = createMatchServiceMock({ incomingRow: null });
    vi.mocked(createServiceClient).mockReturnValueOnce(asServiceClient(missingIncoming.client));

    const incomingResponse = await POST(createMatchRequest());
    const incomingJson = await incomingResponse.json();

    expect(incomingResponse.status).toBe(404);
    expect(incomingJson.error).toBe("Incoming payment row not found.");

    const missingIntent = createMatchServiceMock({ intentRow: null });
    vi.mocked(createServiceClient).mockReturnValueOnce(asServiceClient(missingIntent.client));

    const intentResponse = await POST(createMatchRequest());
    const intentJson = await intentResponse.json();

    expect(intentResponse.status).toBe(404);
    expect(intentJson.error).toBe("Funding intent not found.");
  });

  it("returns duplicate success when incoming payment is already credited", async () => {
    const service = createMatchServiceMock({
      incomingRow: {
        id: "incoming-1",
        match_status: "credited",
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createMatchRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.duplicate).toBe(true);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("rejects non-Venmo funding intents and gross amount mismatches", async () => {
    const nonVenmo = createMatchServiceMock({
      intentRow: {
        id: "intent-1",
        user_id: "user-1",
        provider: "stripe",
        requested_amount_usd: 25,
      },
    });
    vi.mocked(createServiceClient).mockReturnValueOnce(asServiceClient(nonVenmo.client));

    const providerResponse = await POST(createMatchRequest());
    const providerJson = await providerResponse.json();

    expect(providerResponse.status).toBe(400);
    expect(providerJson.error).toBe("Funding intent provider must be venmo.");

    const mismatch = createMatchServiceMock({
      intentRow: {
        id: "intent-1",
        user_id: "user-1",
        provider: "venmo",
        requested_amount_usd: 40,
      },
    });
    vi.mocked(createServiceClient).mockReturnValueOnce(asServiceClient(mismatch.client));

    const amountResponse = await POST(createMatchRequest());
    const amountJson = await amountResponse.json();

    expect(amountResponse.status).toBe(409);
    expect(amountJson.error).toBe("Funding intent gross amount does not match incoming payment gross amount.");
  });

  it("returns 500 when deposit receipt creation or wallet credit fails", async () => {
    const receiptFailure = createMatchServiceMock({
      receiptError: {
        message: "receipt insert failed",
      },
    });
    vi.mocked(createServiceClient).mockReturnValueOnce(asServiceClient(receiptFailure.client));

    const receiptResponse = await POST(createMatchRequest());
    const receiptJson = await receiptResponse.json();

    expect(receiptResponse.status).toBe(500);
    expect(receiptJson.error).toBe("Unable to create deposit receipt: receipt insert failed");

    const rpcFailure = createMatchServiceMock({
      rpcError: {
        message: "rpc unavailable",
      },
    });
    vi.mocked(createServiceClient).mockReturnValueOnce(asServiceClient(rpcFailure.client));

    const rpcResponse = await POST(createMatchRequest());
    const rpcJson = await rpcResponse.json();

    expect(rpcResponse.status).toBe(500);
    expect(rpcJson.error).toBe("Wallet credit failed: rpc unavailable");
  });

  it("credits a manual match, updates related rows, and records admin metadata", async () => {
    const service = createMatchServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createMatchRequest(validBody({ incomingPaymentId: " incoming-1 ", fundingIntentId: " intent-1 " })));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Manual match credited successfully.");
    expect(json.ledgerEntryId).toBe("ledger-1");
    expect(json.depositReceiptId).toBe("receipt-1");
    expect(json.netAmountUsd).toBe(25);
    expect(service.rpc).toHaveBeenCalledWith("apply_wallet_credit", {
      p_user_id: "user-1",
      p_amount: 25,
      p_entry_type: "deposit",
      p_idempotency_key: "venmo:payment:venmo-payment-1:deposit",
      p_reference_table: "deposit_receipts",
      p_reference_id: "receipt-1",
      p_metadata: expect.objectContaining({
        provider: "venmo",
        fundingIntentId: "intent-1",
        invoiceCode: "TNC-123",
        matchedByAdminId: ADMIN_USER.id,
      }),
    });
    expect(service.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "deposit_receipts",
          payload: { ledger_entry_id: "ledger-1" },
          filters: { id: "receipt-1" },
        }),
        expect.objectContaining({
          table: "funding_intents",
          payload: expect.objectContaining({
            status: "credited",
            ledger_entry_id: "ledger-1",
            venmo_transaction_id: "tx-1",
          }),
          filters: {
            id: "intent-1",
            provider: "venmo",
          },
        }),
        expect.objectContaining({
          table: "venmo_incoming_payments",
          payload: expect.objectContaining({
            match_status: "credited",
            matched_funding_intent_id: "intent-1",
            deposit_receipt_id: "receipt-1",
            ledger_entry_id: "ledger-1",
            error_message: null,
          }),
          filters: {
            id: "incoming-1",
          },
        }),
      ])
    );
  });
});
