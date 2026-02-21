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

import {
  createClient,
  getMissingSupabaseServerEnv,
  isSupabaseServerEnvConfigured,
} from "@/lib/supabase/server";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

describe("POST /api/markets/[marketId]/resolve/bond", () => {
  const context = {
    params: Promise.resolve({ marketId: "market-123" }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServerEnv).mockReturnValue([]);
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
    } as any);

    vi.mocked(createServiceClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          marketId: "market-123",
          userId: "user-123",
          outcome: "yes",
          bondAmount: 2.5,
          reused: false,
        },
        error: null,
      }),
    } as any);
  });

  it("returns 503 with missing env when service config is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(new Request("http://localhost/api/markets/market-123/resolve/bond", { method: "POST" }), context);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Resolver bond submission is unavailable: missing service role configuration.");
    expect(json.missingEnv).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns 400 for invalid outcome values", async () => {
    const response = await POST(
      new Request("http://localhost/api/markets/market-123/resolve/bond", {
        method: "POST",
        body: JSON.stringify({
          outcome: "maybe",
          bondAmount: 2,
        }),
      }),
      context
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Validation failed.");
    expect(json.details).toContain("outcome must be one of: yes, no.");
  });

  it("returns 401 for unauthenticated callers", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any);

    const response = await POST(
      new Request("http://localhost/api/markets/market-123/resolve/bond", {
        method: "POST",
        body: JSON.stringify({
          outcome: "yes",
          bondAmount: 2.5,
        }),
      }),
      context
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
  });

  it("maps RPC conflict errors to 409 while preserving detail", async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message: "[RESOLVE_CONFLICT] Resolver window has ended.",
        },
      }),
    } as any);

    const response = await POST(
      new Request("http://localhost/api/markets/market-123/resolve/bond", {
        method: "POST",
        body: JSON.stringify({
          outcome: "yes",
          bondAmount: 2.5,
        }),
      }),
      context
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Resolver bond submission unavailable.");
    expect(json.detail).toContain("Resolver window has ended.");
  });

  it("returns 201 and resolverBond payload on success", async () => {
    const response = await POST(
      new Request("http://localhost/api/markets/market-123/resolve/bond", {
        method: "POST",
        body: JSON.stringify({
          outcome: "yes",
          bondAmount: 2.5,
        }),
      }),
      context
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.resolverBond.marketId).toBe("market-123");
    expect(json.resolverBond.outcome).toBe("yes");
  });
});
