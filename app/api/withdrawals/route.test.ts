import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  isSupabaseServerEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServerEnv: vi.fn(() => []),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
}));

vi.mock("@/lib/payments/withdrawals", () => ({
  getWithdrawalConfig: vi.fn(),
  validateWithdrawalPayload: vi.fn(),
  requestWithdrawal: vi.fn(),
  processWithdrawalRequest: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getWithdrawalConfig,
  processWithdrawalRequest,
  requestWithdrawal,
  validateWithdrawalPayload,
} from "@/lib/payments/withdrawals";

function createServiceClientMock(options?: {
  kycStatus?: string | null;
  pendingCount?: number;
  completedRows?: Array<{ amount: number | string | null }>;
  profileError?: string;
  pendingError?: string;
  completedError?: string;
}) {
  const kycStatus = options?.kycStatus ?? "verified";
  const pendingCount = options?.pendingCount ?? 0;
  const completedRows = options?.completedRows ?? [];

  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options?.profileError ? null : { kyc_status: kycStatus },
                error: options?.profileError ? { message: options.profileError } : null,
              }),
            }),
          }),
        };
      }

      if (table === "withdrawal_requests") {
        return {
          select: (_columns: string, config?: { count?: "exact"; head?: boolean }) => {
            if (config?.head) {
              const pendingResult = {
                count: pendingCount,
                error: options?.pendingError ? { message: options.pendingError } : null,
              };

              const pendingQuery = {
                eq: () => pendingQuery,
                then: <TResult1 = unknown, TResult2 = never>(
                  onfulfilled?:
                    | ((value: { count: number; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
                    | null,
                  onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
                ) => Promise.resolve(pendingResult).then(onfulfilled as any, onrejected as any),
              };

              return pendingQuery;
            }

            const completedResult = {
              data: options?.completedError ? null : completedRows,
              error: options?.completedError ? { message: options.completedError } : null,
            };

            const completedQuery = {
              eq: () => completedQuery,
              gte: async () => completedResult,
            };

            return completedQuery;
          },
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }),
  };
}

describe("POST /api/withdrawals", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as any);

    vi.mocked(createServiceClient).mockReturnValue(createServiceClientMock() as any);

    vi.mocked(getWithdrawalConfig).mockReturnValue({
      minAmountUsd: 10,
      maxAmountUsd: 2_500,
      dailyLimitUsd: 5_000,
      maxPendingRequests: 2,
      autoPayoutEnabled: false,
    });

    vi.mocked(validateWithdrawalPayload).mockReturnValue({
      ok: true,
      data: {
        amount: 125,
        idempotencyKey: "withdrawal-key-1",
        destination: {
          network: "base",
          address: "0x1234567890abcdef",
        },
        note: "cash out",
      },
    });

    vi.mocked(requestWithdrawal).mockResolvedValue({
      ok: true,
      data: {
        reused: false,
        withdrawalRequestId: "withdrawal-1",
        status: "pending",
        amount: 125,
        currency: "USD",
        availableBalance: 875,
        reservedBalance: 125,
        requestedAt: "2026-02-21T08:00:00.000Z",
      },
    });

    vi.mocked(processWithdrawalRequest).mockResolvedValue({
      ok: true,
      data: {
        reused: false,
        withdrawalRequestId: "withdrawal-1",
        status: "completed",
        amount: 125,
        currency: "USD",
        availableBalance: 875,
        reservedBalance: 0,
        processedAt: "2026-02-21T08:05:00.000Z",
        failureReason: null,
      },
    });
  });

  it("returns 201 on happy path when request is accepted", async () => {
    const request = new Request("http://localhost/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: 125 }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.withdrawal.withdrawalRequestId).toBe("withdrawal-1");
    expect(json.withdrawal.autoPayout).toBe(false);
    expect(json.withdrawal.requestedAmountUsd).toBe(125);
    expect(json.withdrawal.estimatedWithdrawalFeeUsd).toBeGreaterThan(0);
    expect(json.withdrawal.estimatedNetPayoutUsd).toBeLessThan(125);
    expect(vi.mocked(requestWithdrawal)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestWithdrawal).mock.calls[0][0]).toMatchObject({
      amount: 125,
      metadata: expect.objectContaining({
        requestedAmountUsd: 125,
        estimatedWithdrawalFeeUsd: expect.any(Number),
        estimatedNetPayoutUsd: expect.any(Number),
      }),
    });
  });

  it("returns 200 for idempotent duplicate withdrawal requests", async () => {
    vi.mocked(requestWithdrawal).mockResolvedValue({
      ok: true,
      data: {
        reused: true,
        withdrawalRequestId: "withdrawal-1",
        status: "pending",
        amount: 125,
        currency: "USD",
        availableBalance: 875,
        reservedBalance: 125,
        requestedAt: "2026-02-21T08:00:00.000Z",
      },
    });

    const request = new Request("http://localhost/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: 125 }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.withdrawal.withdrawalRequestId).toBe("withdrawal-1");
    expect(json.withdrawal.autoPayout).toBe(false);
  });

  it("returns 401 when caller is unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any);

    const request = new Request("http://localhost/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: 125 }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
  });

  it("returns 400 when request body is not valid JSON", async () => {
    const request = new Request("http://localhost/api/withdrawals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{bad json",
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Request body must be valid JSON.");
  });

  it("returns 400 when payload validation fails", async () => {
    vi.mocked(validateWithdrawalPayload).mockReturnValue({
      ok: false,
      errors: ["destination.address is required and must be at least 8 characters."],
    });

    const request = new Request("http://localhost/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: 125 }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Validation failed.");
    expect(Array.isArray(json.details)).toBe(true);
  });

  it("returns provider/RPC failures from request_withdrawal as API errors", async () => {
    vi.mocked(requestWithdrawal).mockResolvedValue({
      ok: false,
      status: 409,
      error: "Withdrawal cannot be processed.",
      detail: "Insufficient available balance.",
    });

    const request = new Request("http://localhost/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({ amount: 125 }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Withdrawal cannot be processed.");
    expect(json.detail).toContain("Insufficient");
  });
});
