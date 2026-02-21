import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("@/lib/api/env-guards", () => ({
  getServerEnvReadiness: vi.fn(() => ({ isConfigured: true, missingEnv: [] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/markets/portfolio", () => ({
  getPortfolioSnapshot: vi.fn(),
  portfolioFillsToCsv: vi.fn(() => "timestamp,side\n"),
}));

import { getServerEnvReadiness } from "@/lib/api/env-guards";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioSnapshot } from "@/lib/markets/portfolio";

describe("GET /api/portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerEnvReadiness).mockReturnValue({ isConfigured: true, missingEnv: [] });
  });

  it("returns 503 with missingEnv when server env is not configured", async () => {
    vi.mocked(getServerEnvReadiness).mockReturnValue({
      isConfigured: false,
      missingEnv: ["NEXT_PUBLIC_SUPABASE_URL"],
    });

    const response = await GET(new Request("http://localhost/api/portfolio"));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Portfolio is unavailable: missing Supabase environment variables.");
    expect(Array.isArray(json.missingEnv)).toBe(true);
    expect(json.missingEnv[0]).toBe("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("returns 401 for unauthenticated users", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(new Request("http://localhost/api/portfolio"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
  });

  it("returns portfolio/user payload keys on success", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    vi.mocked(getPortfolioSnapshot).mockResolvedValue({
      wallet: {
        cashUsd: 0,
        reservedUsd: 0,
        totalUsd: 0,
      },
      summary: {
        openPositions: 0,
        markValueUsd: 0,
        unrealizedPnlUsd: 0,
        realizedPnlUsd: 0,
        feesPaidUsd: 0,
        tradeCount: 0,
      },
      positions: [],
      fills: [],
    });

    const response = await GET(new Request("http://localhost/api/portfolio"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.portfolio).toBeDefined();
    expect(json.user).toBeDefined();
    expect(json.user.id).toBe("user-123");
  });
});
