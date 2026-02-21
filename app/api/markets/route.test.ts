import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

vi.mock("@/lib/api/env-guards", () => ({
  getServerEnvReadiness: vi.fn(() => ({ isConfigured: true, missingEnv: [] })),
  getServiceEnvReadiness: vi.fn(() => ({ isConfigured: true, missingEnv: [] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/markets/create-market", () => ({
  validateCreateMarketPayload: vi.fn(),
}));

vi.mock("@/lib/markets/view-access", () => ({
  hasInstitutionAccessRule: vi.fn(() => false),
  extractRequiredOrganizationId: vi.fn(() => null),
}));

vi.mock("@/lib/markets/read-markets", () => ({
  parseMarketDiscoveryQuery: vi.fn(() => ({
    search: "",
    category: "trending",
    status: "all",
    access: "all",
    sort: "newest",
  })),
  getMarketViewerContext: vi.fn(() => ({
    isAuthenticated: false,
    userId: null,
    activeOrganizationId: null,
    hasActiveInstitution: false,
  })),
  listDiscoveryMarketCards: vi.fn(),
}));

import { getServerEnvReadiness } from "@/lib/api/env-guards";
import { listDiscoveryMarketCards, parseMarketDiscoveryQuery } from "@/lib/markets/read-markets";
import { validateCreateMarketPayload } from "@/lib/markets/create-market";
import { createClient } from "@/lib/supabase/server";

describe("Routes: /api/markets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerEnvReadiness).mockReturnValue({ isConfigured: true, missingEnv: [] });
  });

  it("GET returns 503 with missingEnv when server env is not configured", async () => {
    vi.mocked(getServerEnvReadiness).mockReturnValue({
      isConfigured: false,
      missingEnv: ["NEXT_PUBLIC_SUPABASE_URL"],
    });

    const response = await GET(new Request("http://localhost/api/markets"));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Market discovery is unavailable: missing Supabase environment variables.");
    expect(Array.isArray(json.missingEnv)).toBe(true);
    expect(json.missingEnv[0]).toBe("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("GET preserves 500 error shape when discovery provider reports an error", async () => {
    vi.mocked(parseMarketDiscoveryQuery).mockReturnValue({
      search: "weather",
      category: "trending",
      status: "all",
      access: "all",
      sort: "newest",
    });
    vi.mocked(createClient).mockResolvedValue({} as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(listDiscoveryMarketCards).mockResolvedValue({
      markets: [],
      schemaMissing: false,
      error: "read_markets_failed",
    });

    const response = await GET(new Request("http://localhost/api/markets?q=weather"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Unable to load markets.");
    expect(json.detail).toBe("read_markets_failed");
  });

  it("POST preserves validation failure status and payload keys", async () => {
    vi.mocked(validateCreateMarketPayload).mockReturnValue({
      ok: false,
      errors: ["question is required."],
    });

    const response = await POST(
      new Request("http://localhost/api/markets", {
        method: "POST",
        body: JSON.stringify({ question: "" }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Validation failed.");
    expect(Array.isArray(json.details)).toBe(true);
  });
});
