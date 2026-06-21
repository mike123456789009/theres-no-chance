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
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";

import { POST } from "./route";

const RESOLVE_URL = "http://localhost/api/admin/markets/market-1/resolve";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

function createContext(marketId = "market-1") {
  return {
    params: Promise.resolve({ marketId }),
  };
}

function createResolveRequest(body: unknown = { outcome: "yes", notes: "admin note" }) {
  return createRouteRequest(RESOLVE_URL, { body });
}

describe("POST /api/admin/markets/[marketId]/resolve", () => {
  let rpcMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock = vi.fn().mockResolvedValue({
      data: {
        marketId: "market-1",
        status: "resolved",
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

  it("returns the admin guard response before checking service configuration", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(createResolveRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(createResolveRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Market resolution unavailable: missing service role configuration.",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid outcomes before invoking the RPC", async () => {
    const malformedResponse = await POST(
      new Request(RESOLVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{bad json",
      }),
      createContext()
    );
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(400);
    expect(malformedJson.error).toBe("Request body must be valid JSON.");

    const invalidResponse = await POST(createResolveRequest({ outcome: "maybe" }), createContext());
    const invalidJson = await invalidResponse.json();

    expect(invalidResponse.status).toBe(400);
    expect(invalidJson).toEqual({
      error: "Validation failed.",
      details: ["outcome must be one of: yes, no, void."],
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("calls admin_resolve_market with normalized outcome and sanitized notes", async () => {
    const response = await POST(
      createResolveRequest({
        outcome: " NO ",
        notes: "  credible source reviewed  ",
      }),
      createContext("market-resolve-1")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: "Market resolved.",
      resolution: {
        marketId: "market-1",
        status: "resolved",
        outcome: "yes",
      },
    });
    expect(rpcMock).toHaveBeenCalledWith("admin_resolve_market", {
      p_market_id: "market-resolve-1",
      p_resolver_id: ADMIN_USER.id,
      p_outcome: "no",
      p_notes: "credible source reviewed",
    });
  });

  it("passes null notes when notes are blank or non-string", async () => {
    const response = await POST(createResolveRequest({ outcome: "void", notes: "  " }), createContext("market-blank"));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenLastCalledWith("admin_resolve_market", {
      p_market_id: "market-blank",
      p_resolver_id: ADMIN_USER.id,
      p_outcome: "void",
      p_notes: null,
    });
  });

  it("maps resolve RPC errors and malformed responses", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "[RESOLVE_NOT_FOUND] Market row not found.",
      },
    });

    const notFoundResponse = await POST(createResolveRequest({ outcome: "yes" }), createContext());
    const notFoundJson = await notFoundResponse.json();

    expect(notFoundResponse.status).toBe(404);
    expect(notFoundJson).toEqual({
      error: "Market not found.",
      detail: "Market row not found.",
    });

    rpcMock.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const malformedResponse = await POST(createResolveRequest({ outcome: "yes" }), createContext());
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(500);
    expect(malformedJson).toEqual({
      error: "Market resolution failed.",
      detail: "Malformed admin_resolve_market RPC response.",
    });
  });
});
