import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAllowlistedAdmin: vi.fn(),
}));

vi.mock("@/lib/markets/admin-actions", () => ({
  performAdminMarketAction: vi.fn(),
}));

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { performAdminMarketAction } from "@/lib/markets/admin-actions";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";

import { POST } from "./route";

const REJECT_URL = "http://localhost/api/admin/markets/market-1/reject";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

function createContext(marketId = "market-1") {
  return {
    params: Promise.resolve({ marketId }),
  };
}

function createRejectRequest(body: unknown = { reason: "source is too vague" }) {
  return createRouteRequest(REJECT_URL, { body });
}

describe("POST /api/admin/markets/[marketId]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: true,
      adminUser: ADMIN_USER,
    });
    vi.mocked(performAdminMarketAction).mockResolvedValue({
      ok: true,
      market: {
        id: "market-1",
        status: "draft",
        question: "Will the dining hall extend hours?",
      },
    });
  });

  it("returns the admin guard response before applying the action", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(createRejectRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
    expect(performAdminMarketAction).not.toHaveBeenCalled();
  });

  it("rejects a review market back to draft through the shared admin action service", async () => {
    const response = await POST(createRejectRequest(), createContext("market-1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: "Market rejected and moved back to draft.",
      market: {
        id: "market-1",
        status: "draft",
        question: "Will the dining hall extend hours?",
      },
    });
    expect(performAdminMarketAction).toHaveBeenCalledWith({
      marketId: "market-1",
      action: "reject",
      adminUserId: ADMIN_USER.id,
      reason: "source is too vague",
    });
  });

  it("returns shared action conflicts with the route error status", async () => {
    vi.mocked(performAdminMarketAction).mockResolvedValue({
      ok: false,
      status: 409,
      error: "Market must be in 'review' status for 'reject' action.",
    });

    const response = await POST(createRejectRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Market must be in 'review' status for 'reject' action.");
  });
});
