import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  getMissingSupabaseServiceEnv: vi.fn((): string[] => []),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
  getMissingSupabaseServiceEnv: mocks.getMissingSupabaseServiceEnv,
  isSupabaseServiceEnvConfigured: mocks.isSupabaseServiceEnvConfigured,
}));

import { performAdminMarketAction } from "./admin-actions";

type MockError = { message: string };

type MarketRow = {
  id: string;
  status: string;
  question: string;
};

type QueryCall = {
  table: string;
  operation: "select" | "update" | "insert";
  filters: Record<string, unknown>;
  payload: Record<string, unknown> | null;
};

type MockOptions = {
  marketRow?: MarketRow | null;
  lookupError?: MockError | null;
  updateRow?: MarketRow | null;
  updateError?: MockError | null;
  insertError?: MockError | null;
};

class MockQuery {
  private operation: QueryCall["operation"] = "select";
  private filters: Record<string, unknown> = {};
  private payload: Record<string, unknown> | null = null;

  constructor(
    private table: string,
    private options: MockOptions,
    private calls: QueryCall[]
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

  async insert(payload: Record<string, unknown>) {
    this.operation = "insert";
    this.payload = payload;
    this.calls.push(this.currentCall());
    return {
      data: null,
      error: this.options.insertError ?? null,
    };
  }

  async maybeSingle() {
    this.calls.push(this.currentCall());

    if (this.table !== "markets") {
      return {
        data: null,
        error: null,
      };
    }

    if (this.operation === "select") {
      return {
        data: this.options.lookupError ? null : this.options.marketRow,
        error: this.options.lookupError ?? null,
      };
    }

    const updateRow =
      this.options.updateRow === undefined
        ? {
            id: this.options.marketRow?.id ?? "market-1",
            status: String(this.payload?.status ?? "open"),
            question: this.options.marketRow?.question ?? "Will the market open?",
          }
        : this.options.updateRow;

    return {
      data: this.options.updateError ? null : updateRow,
      error: this.options.updateError ?? null,
    };
  }

  private currentCall(): QueryCall {
    return {
      table: this.table,
      operation: this.operation,
      filters: this.filters,
      payload: this.payload,
    };
  }
}

function createServiceMock(options: MockOptions = {}) {
  const calls: QueryCall[] = [];
  const normalizedOptions: MockOptions = {
    marketRow:
      options.marketRow === undefined
        ? {
            id: "market-1",
            status: "review",
            question: "Will the dining hall extend hours?",
          }
        : options.marketRow,
    lookupError: options.lookupError ?? null,
    updateRow: options.updateRow,
    updateError: options.updateError ?? null,
    insertError: options.insertError ?? null,
  };

  return {
    client: {
      from: vi.fn((table: string) => new MockQuery(table, normalizedOptions, calls)),
    },
    calls,
  };
}

describe("performAdminMarketAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseServiceEnvConfigured.mockReturnValue(true);
    mocks.getMissingSupabaseServiceEnv.mockReturnValue([]);
    mocks.createServiceClient.mockReturnValue(createServiceMock().client);
  });

  it("returns a service-configuration error before creating a service client", async () => {
    mocks.isSupabaseServiceEnvConfigured.mockReturnValue(false);
    mocks.getMissingSupabaseServiceEnv.mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const result = await performAdminMarketAction({
      marketId: "market-1",
      action: "approve",
      adminUserId: "admin-1",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 503,
      error: "Admin market action unavailable: missing service role configuration.",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("approves review markets, records the reviewer, and writes bounded audit details", async () => {
    const service = createServiceMock();
    mocks.createServiceClient.mockReturnValue(service.client);

    const result = await performAdminMarketAction({
      marketId: "market-1",
      action: "approve",
      adminUserId: "admin-1",
      reason: ` ${"x".repeat(1100)} `,
    });

    expect(result).toEqual({
      ok: true,
      market: {
        id: "market-1",
        status: "open",
        question: "Will the dining hall extend hours?",
      },
    });
    expect(service.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "markets",
          operation: "update",
          filters: {
            id: "market-1",
            status: "review",
          },
          payload: {
            status: "open",
            reviewer_id: "admin-1",
          },
        }),
        expect.objectContaining({
          table: "admin_action_log",
          operation: "insert",
          payload: expect.objectContaining({
            admin_user_id: "admin-1",
            action: "market_approve",
            target_type: "market",
            target_id: "market-1",
            details: expect.objectContaining({
              action: "approve",
              fromStatus: "review",
              toStatus: "open",
              reason: "x".repeat(1000),
              marketQuestion: "Will the dining hall extend hours?",
            }),
          }),
        }),
      ])
    );
  });

  it("rejects review markets back to draft and logs null blank reasons", async () => {
    const service = createServiceMock();
    mocks.createServiceClient.mockReturnValue(service.client);

    const result = await performAdminMarketAction({
      marketId: "market-1",
      action: "reject",
      adminUserId: "admin-1",
      reason: "   ",
    });

    expect(result).toMatchObject({
      ok: true,
      market: {
        status: "draft",
      },
    });
    expect(service.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "markets",
          operation: "update",
          filters: {
            id: "market-1",
            status: "review",
          },
          payload: {
            status: "draft",
            reviewer_id: "admin-1",
          },
        }),
        expect.objectContaining({
          table: "admin_action_log",
          payload: expect.objectContaining({
            action: "market_reject",
            details: expect.objectContaining({
              action: "reject",
              fromStatus: "review",
              toStatus: "draft",
              reason: null,
            }),
          }),
        }),
      ])
    );
  });

  it("halts open markets without assigning a reviewer id", async () => {
    const service = createServiceMock({
      marketRow: {
        id: "market-1",
        status: "open",
        question: "Will the team win the opener?",
      },
    });
    mocks.createServiceClient.mockReturnValue(service.client);

    const result = await performAdminMarketAction({
      marketId: "market-1",
      action: "halt",
      adminUserId: "admin-1",
      reason: "source invalidated",
    });

    expect(result).toMatchObject({
      ok: true,
      market: {
        status: "trading_halted",
      },
    });
    expect(service.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "markets",
          operation: "update",
          filters: {
            id: "market-1",
            status: "open",
          },
          payload: {
            status: "trading_halted",
          },
        }),
        expect.objectContaining({
          table: "admin_action_log",
          payload: expect.objectContaining({
            action: "market_halt",
            details: expect.objectContaining({
              action: "halt",
              fromStatus: "open",
              toStatus: "trading_halted",
              reason: "source invalidated",
            }),
          }),
        }),
      ])
    );
  });

  it("returns not-found, wrong-status, and concurrent-update conflicts without writing audit logs", async () => {
    const missing = createServiceMock({ marketRow: null });
    mocks.createServiceClient.mockReturnValueOnce(missing.client);

    await expect(
      performAdminMarketAction({
        marketId: "missing-market",
        action: "approve",
        adminUserId: "admin-1",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 404,
      error: "Market not found.",
    });

    const wrongStatus = createServiceMock({
      marketRow: {
        id: "market-1",
        status: "open",
        question: "Already open?",
      },
    });
    mocks.createServiceClient.mockReturnValueOnce(wrongStatus.client);

    await expect(
      performAdminMarketAction({
        marketId: "market-1",
        action: "approve",
        adminUserId: "admin-1",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      error: "Market must be in 'review' status for 'approve' action.",
    });

    const concurrentUpdate = createServiceMock({ updateRow: null });
    mocks.createServiceClient.mockReturnValueOnce(concurrentUpdate.client);

    await expect(
      performAdminMarketAction({
        marketId: "market-1",
        action: "approve",
        adminUserId: "admin-1",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      error: "Market status changed before this action could be applied.",
    });

    expect(missing.calls.some((call) => call.table === "admin_action_log")).toBe(false);
    expect(wrongStatus.calls.some((call) => call.table === "admin_action_log")).toBe(false);
    expect(concurrentUpdate.calls.some((call) => call.table === "admin_action_log")).toBe(false);
  });

  it("returns lookup, update, and audit-log failures with details", async () => {
    const lookupFailure = createServiceMock({
      lookupError: {
        message: "lookup failed",
      },
    });
    mocks.createServiceClient.mockReturnValueOnce(lookupFailure.client);

    await expect(
      performAdminMarketAction({
        marketId: "market-1",
        action: "approve",
        adminUserId: "admin-1",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 500,
      error: "Unable to load market for admin action.",
      detail: "lookup failed",
    });

    const updateFailure = createServiceMock({
      updateError: {
        message: "update failed",
      },
    });
    mocks.createServiceClient.mockReturnValueOnce(updateFailure.client);

    await expect(
      performAdminMarketAction({
        marketId: "market-1",
        action: "approve",
        adminUserId: "admin-1",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 500,
      error: "Unable to update market status.",
      detail: "update failed",
    });

    const auditFailure = createServiceMock({
      insertError: {
        message: "audit failed",
      },
    });
    mocks.createServiceClient.mockReturnValueOnce(auditFailure.client);

    await expect(
      performAdminMarketAction({
        marketId: "market-1",
        action: "approve",
        adminUserId: "admin-1",
      })
    ).resolves.toMatchObject({
      ok: false,
      status: 500,
      error: "Market status updated but audit logging failed.",
      detail: "audit failed",
    });
  });
});
