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

const ADJUDICATE_URL = "http://localhost/api/admin/markets/market-1/challenges/challenge-1/adjudicate";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

function createContext(marketId = "market-1", challengeId = "challenge-1") {
  return {
    params: Promise.resolve({ marketId, challengeId }),
  };
}

function createAdjudicateRequest(body: unknown = { status: "upheld", notes: "admin note" }) {
  return createRouteRequest(ADJUDICATE_URL, { body });
}

describe("POST /api/admin/markets/[marketId]/challenges/[challengeId]/adjudicate", () => {
  let rpcMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock = vi.fn().mockResolvedValue({
      data: {
        challengeId: "challenge-1",
        marketId: "market-1",
        status: "upheld",
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
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createAdjudicateRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(createAdjudicateRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Challenge adjudication unavailable: missing service role configuration.",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid statuses before invoking the RPC", async () => {
    const malformedResponse = await POST(
      new Request(ADJUDICATE_URL, {
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

    const invalidResponse = await POST(createAdjudicateRequest({ status: "closed" }), createContext());
    const invalidJson = await invalidResponse.json();

    expect(invalidResponse.status).toBe(400);
    expect(invalidJson).toEqual({
      error: "Validation failed.",
      details: ["status must be one of: upheld, rejected, under_review."],
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("calls admin_adjudicate_market_challenge with normalized status and sanitized metadata", async () => {
    const response = await POST(
      createAdjudicateRequest({
        status: " REJECTED ",
        notes: "  source update reviewed  ",
        successGroupId: "  challenge-group-1  ",
      }),
      createContext("market-adjudicate-1", "challenge-adjudicate-1")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: "Challenge adjudicated.",
      challenge: {
        challengeId: "challenge-1",
        marketId: "market-1",
        status: "upheld",
      },
    });
    expect(rpcMock).toHaveBeenCalledWith("admin_adjudicate_market_challenge", {
      p_market_id: "market-adjudicate-1",
      p_dispute_id: "challenge-adjudicate-1",
      p_admin_user_id: ADMIN_USER.id,
      p_status: "rejected",
      p_notes: "source update reviewed",
      p_success_group_id: "challenge-group-1",
    });
  });

  it("passes null notes and success group when omitted", async () => {
    const response = await POST(
      createAdjudicateRequest({
        status: "under_review",
      }),
      createContext("market-review", "challenge-review")
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenLastCalledWith("admin_adjudicate_market_challenge", {
      p_market_id: "market-review",
      p_dispute_id: "challenge-review",
      p_admin_user_id: ADMIN_USER.id,
      p_status: "under_review",
      p_notes: null,
      p_success_group_id: null,
    });
  });

  it("maps adjudication RPC errors and malformed responses", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "[CHALLENGE_CONFLICT] Challenge already adjudicated.",
      },
    });

    const conflictResponse = await POST(createAdjudicateRequest({ status: "upheld" }), createContext());
    const conflictJson = await conflictResponse.json();

    expect(conflictResponse.status).toBe(409);
    expect(conflictJson).toEqual({
      error: "Challenge adjudication conflict.",
      detail: "Challenge already adjudicated.",
    });

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const malformedResponse = await POST(createAdjudicateRequest({ status: "rejected" }), createContext());
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(500);
    expect(malformedJson).toEqual({
      error: "Challenge adjudication failed.",
      detail: "Malformed admin_adjudicate_market_challenge RPC response.",
    });
  });
});
