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

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const context = {
  params: Promise.resolve({ marketId: "market-123" }),
};

function buildAuthClient(userId: string | null) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });

  return {
    client: {
      auth: {
        getUser,
      },
    },
    getUser,
  };
}

function buildServiceClient() {
  const rpc = vi.fn();
  return {
    client: {
      rpc,
    },
    rpc,
  };
}

describe("POST /api/markets/[marketId]/resolve/prize-contribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a resolver prize contribution for authenticated users", async () => {
    const auth = buildAuthClient("user-123");
    const service = buildServiceClient();
    service.rpc.mockResolvedValue({
      data: {
        contributionId: "contrib-1",
        amount: 5,
        status: "locked",
        marketId: "market-123",
      },
      error: null,
    });

    vi.mocked(createClient).mockResolvedValue(auth.client as any);
    vi.mocked(createServiceClient).mockReturnValue(service.client as any);

    const request = new Request("http://localhost/api/markets/market-123/resolve/prize-contribution", {
      method: "POST",
      body: JSON.stringify({ amount: "5.00" }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(service.rpc).toHaveBeenCalledWith("submit_market_resolver_prize_contribution", {
      p_market_id: "market-123",
      p_user_id: "user-123",
      p_amount: 5,
    });
    expect(json.contribution.contributionId).toBe("contrib-1");
  });

  it("rejects contributions below the $1 minimum", async () => {
    const request = new Request("http://localhost/api/markets/market-123/resolve/prize-contribution", {
      method: "POST",
      body: JSON.stringify({ amount: 0.5 }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect((json.details as string[])[0]).toContain("at least 1.00");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const auth = buildAuthClient(null);
    vi.mocked(createClient).mockResolvedValue(auth.client as any);

    const request = new Request("http://localhost/api/markets/market-123/resolve/prize-contribution", {
      method: "POST",
      body: JSON.stringify({ amount: 2 }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
  });

  it("maps RPC validation errors to HTTP 400", async () => {
    const auth = buildAuthClient("user-123");
    const service = buildServiceClient();
    service.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "[PRIZE_VALIDATION] amount must be greater than zero",
      },
    });

    vi.mocked(createClient).mockResolvedValue(auth.client as any);
    vi.mocked(createServiceClient).mockReturnValue(service.client as any);

    const request = new Request("http://localhost/api/markets/market-123/resolve/prize-contribution", {
      method: "POST",
      body: JSON.stringify({ amount: 2 }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Prize contribution validation failed.");
  });

  it("maps RPC funds/conflict errors to HTTP 409", async () => {
    const auth = buildAuthClient("user-123");
    const service = buildServiceClient();
    service.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "[PRIZE_FUNDS] insufficient balance",
      },
    });

    vi.mocked(createClient).mockResolvedValue(auth.client as any);
    vi.mocked(createServiceClient).mockReturnValue(service.client as any);

    const request = new Request("http://localhost/api/markets/market-123/resolve/prize-contribution", {
      method: "POST",
      body: JSON.stringify({ amount: 2 }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Prize contribution unavailable.");
    expect(json.detail).toContain("insufficient balance");
  });
});
