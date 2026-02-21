import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("@/lib/api/env-guards", () => ({
  getServerEnvReadiness: vi.fn(() => ({ isConfigured: true, missingEnv: [] })),
  getServiceEnvReadiness: vi.fn(() => ({ isConfigured: false, missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/markets/read-markets", () => ({
  getMarketViewerContext: vi.fn(() => ({
    isAuthenticated: true,
    userId: "user-123",
    activeOrganizationId: null,
    hasActiveInstitution: false,
  })),
  getMarketDetail: vi.fn(),
}));

import { getServerEnvReadiness } from "@/lib/api/env-guards";
import { createClient } from "@/lib/supabase/server";
import { getMarketDetail } from "@/lib/markets/read-markets";

describe("GET /api/markets/[marketId]", () => {
  const context = {
    params: Promise.resolve({ marketId: "market-123" }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerEnvReadiness).mockReturnValue({ isConfigured: true, missingEnv: [] });
    vi.mocked(createClient).mockResolvedValue({} as unknown as Awaited<ReturnType<typeof createClient>>);
  });

  it("returns 503 with missingEnv when server env is not configured", async () => {
    vi.mocked(getServerEnvReadiness).mockReturnValue({
      isConfigured: false,
      missingEnv: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    });

    const response = await GET(new Request("http://localhost/api/markets/market-123"), context);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Market detail is unavailable: missing Supabase environment variables.");
    expect(Array.isArray(json.missingEnv)).toBe(true);
    expect(json.missingEnv[0]).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("preserves login-required status and code payload", async () => {
    vi.mocked(getMarketDetail).mockResolvedValue({
      kind: "login_required",
    });

    const response = await GET(new Request("http://localhost/api/markets/market-123"), context);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Login required to view this market.");
    expect(json.code).toBe("LOGIN_REQUIRED");
  });
});
