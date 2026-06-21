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

const HALT_URL = "http://localhost/api/admin/markets/market-1/halt";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

function createContext(marketId = "market-1") {
  return {
    params: Promise.resolve({ marketId }),
  };
}

function createHaltRequest(body: unknown = { reason: "source invalidated" }) {
  return createRouteRequest(HALT_URL, { body });
}

describe("POST /api/admin/markets/[marketId]/halt", () => {
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
        status: "trading_halted",
        question: "Will the team win the opener?",
      },
    });
  });

  it("returns the admin guard response before applying the action", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createHaltRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(performAdminMarketAction).not.toHaveBeenCalled();
  });

  it("halts an open market through the shared admin action service", async () => {
    const response = await POST(createHaltRequest(), createContext("open-market-1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: "Trading halted for this market.",
      market: {
        id: "market-1",
        status: "trading_halted",
        question: "Will the team win the opener?",
      },
    });
    expect(performAdminMarketAction).toHaveBeenCalledWith({
      marketId: "open-market-1",
      action: "halt",
      adminUserId: ADMIN_USER.id,
      reason: "source invalidated",
    });
  });

  it("forwards null when the request omits a string reason", async () => {
    const response = await POST(createHaltRequest({}), createContext("open-market-2"));

    expect(response.status).toBe(200);
    expect(performAdminMarketAction).toHaveBeenCalledWith({
      marketId: "open-market-2",
      action: "halt",
      adminUserId: ADMIN_USER.id,
      reason: null,
    });
  });
});
