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

const APPROVE_URL = "http://localhost/api/admin/markets/market-1/approve";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

function createContext(marketId = "market-1") {
  return {
    params: Promise.resolve({ marketId }),
  };
}

function createApproveRequest(body: unknown = { reason: "objective market" }) {
  return createRouteRequest(APPROVE_URL, { body });
}

describe("POST /api/admin/markets/[marketId]/approve", () => {
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
        status: "open",
        question: "Will the dining hall extend hours?",
      },
    });
  });

  it("returns the admin guard response before applying the action", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createApproveRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(performAdminMarketAction).not.toHaveBeenCalled();
  });

  it("forwards market id, admin user, action, and string reason", async () => {
    const response = await POST(createApproveRequest({ reason: "  objective market  " }), createContext("market-1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      message: "Market approved and opened for trading.",
      market: {
        id: "market-1",
        status: "open",
        question: "Will the dining hall extend hours?",
      },
    });
    expect(performAdminMarketAction).toHaveBeenCalledWith({
      marketId: "market-1",
      action: "approve",
      adminUserId: ADMIN_USER.id,
      reason: "  objective market  ",
    });
  });

  it("treats malformed JSON and non-string reasons as null", async () => {
    const malformedResponse = await POST(
      new Request(APPROVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{bad json",
      }),
      createContext("malformed-market")
    );

    expect(malformedResponse.status).toBe(200);
    expect(performAdminMarketAction).toHaveBeenLastCalledWith({
      marketId: "malformed-market",
      action: "approve",
      adminUserId: ADMIN_USER.id,
      reason: null,
    });

    const nonStringResponse = await POST(createApproveRequest({ reason: 123 }), createContext("non-string-market"));

    expect(nonStringResponse.status).toBe(200);
    expect(performAdminMarketAction).toHaveBeenLastCalledWith({
      marketId: "non-string-market",
      action: "approve",
      adminUserId: ADMIN_USER.id,
      reason: null,
    });
  });

  it("propagates admin action errors with detail and missing env metadata", async () => {
    vi.mocked(performAdminMarketAction).mockResolvedValue({
      ok: false,
      status: 503,
      error: "Admin market action unavailable: missing service role configuration.",
      detail: "missing service key",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });

    const response = await POST(createApproveRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Admin market action unavailable: missing service role configuration.",
      detail: "missing service key",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
  });
});
