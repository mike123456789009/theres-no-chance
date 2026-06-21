import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAllowlistedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  getMissingSupabaseServiceEnv: vi.fn((): string[] => []),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
}));

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

import { POST } from "./route";

const FINALIZE_URL = "http://localhost/api/admin/markets/market-1/finalize";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

function createContext(marketId = "market-1") {
  return {
    params: Promise.resolve({ marketId }),
  };
}

function createFinalizeRequest(body: unknown = { outcome: "yes" }) {
  return createRouteRequest(FINALIZE_URL, { body });
}

describe("POST /api/admin/markets/[marketId]/finalize", () => {
  let rpcMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock = vi.fn().mockResolvedValue({
      data: {
        marketId: "market-1",
        status: "finalized",
        outcome: "yes",
      },
      error: null,
    });
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: true,
      adminUser: ADMIN_USER,
    });
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(createServiceClient).mockReturnValue({
      rpc: rpcMock,
    } as unknown as ReturnType<typeof createServiceClient>);
  });

  it("returns the admin guard response before checking service configuration or parsing the body", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createFinalizeRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(createFinalizeRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Market finalization unavailable: missing service role configuration.",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects invalid explicit outcomes before invoking the RPC", async () => {
    const response = await POST(createFinalizeRequest({ outcome: "maybe" }), createContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Validation failed.",
      details: ["outcome must be one of: yes, no, void."],
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("calls admin_finalize_market_v2 with normalized outcome and fixed dispute window", async () => {
    const response = await POST(createFinalizeRequest({ outcome: " YES " }), createContext("market-finalize-1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Market finalized.");
    expect(json.finalization).toEqual({
      marketId: "market-1",
      status: "finalized",
      outcome: "yes",
    });
    expect(rpcMock).toHaveBeenCalledWith("admin_finalize_market_v2", {
      p_market_id: "market-finalize-1",
      p_admin_user_id: ADMIN_USER.id,
      p_outcome: "yes",
      p_dispute_window_hours: 24,
    });
  });

  it("allows auto-finalization without a request body outcome", async () => {
    const response = await POST(
      new Request(FINALIZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{bad json",
      }),
      createContext("market-auto")
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("admin_finalize_market_v2", {
      p_market_id: "market-auto",
      p_admin_user_id: ADMIN_USER.id,
      p_outcome: null,
      p_dispute_window_hours: 24,
    });
  });

  it("maps finalize RPC conflicts and malformed responses", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "[FINALIZE_CONFLICT] Challenge window still open.",
      },
    });

    const conflictResponse = await POST(createFinalizeRequest({ outcome: "no" }), createContext());
    const conflictJson = await conflictResponse.json();

    expect(conflictResponse.status).toBe(409);
    expect(conflictJson).toEqual({
      error: "Market finalization unavailable.",
      detail: "Challenge window still open.",
    });

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const malformedResponse = await POST(createFinalizeRequest({ outcome: "void" }), createContext());
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(500);
    expect(malformedJson).toEqual({
      error: "Market finalization failed.",
      detail: "Malformed admin_finalize_market RPC response.",
    });
  });
});
