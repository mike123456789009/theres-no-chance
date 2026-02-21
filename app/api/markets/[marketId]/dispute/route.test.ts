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

describe("POST /api/markets/[marketId]/dispute", () => {
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
          challengeId: "challenge-123",
          marketId: "market-123",
          userId: "user-123",
          reason: "Evidence indicates the outcome should be challenged.",
          proposedOutcome: "no",
          reused: false,
        },
        error: null,
      }),
    } as any);
  });

  it("returns 503 with missing env when server config is unavailable", async () => {
    vi.mocked(isSupabaseServerEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServerEnv).mockReturnValue(["NEXT_PUBLIC_SUPABASE_URL"]);

    const response = await POST(new Request("http://localhost/api/markets/market-123/dispute", { method: "POST" }), context);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Market dispute is unavailable: missing Supabase environment variables.");
    expect(json.missingEnv).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("returns 400 for malformed JSON body", async () => {
    const response = await POST(
      new Request("http://localhost/api/markets/market-123/dispute", {
        method: "POST",
        body: "{bad json",
      }),
      context
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Request body must be valid JSON.");
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
      new Request("http://localhost/api/markets/market-123/dispute", {
        method: "POST",
        body: JSON.stringify({
          reason: "Evidence indicates the outcome should be challenged.",
          proposedOutcome: "no",
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
          message: "[CHALLENGE_CONFLICT] Challenge window is already closed.",
        },
      }),
    } as any);

    const response = await POST(
      new Request("http://localhost/api/markets/market-123/dispute", {
        method: "POST",
        body: JSON.stringify({
          reason: "Evidence indicates the outcome should be challenged.",
          proposedOutcome: "yes",
        }),
      }),
      context
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe("Challenge submission unavailable.");
    expect(json.detail).toContain("Challenge window is already closed.");
  });

  it("returns 201 and dispute payload on success", async () => {
    const response = await POST(
      new Request("http://localhost/api/markets/market-123/dispute", {
        method: "POST",
        body: JSON.stringify({
          reason: "Evidence indicates the outcome should be challenged.",
          proposedOutcome: "yes",
        }),
      }),
      context
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.dispute.challengeId).toBe("challenge-123");
    expect(json.dispute.marketId).toBe("market-123");
  });
});
