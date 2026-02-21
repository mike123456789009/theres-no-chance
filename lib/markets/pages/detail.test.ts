import { describe, expect, it, vi } from "vitest";

import type { MarketDetailDTO, MarketViewerContext } from "@/lib/markets/read-markets";

import { loadDetailPageData } from "./detail";

describe("loadDetailPageData", () => {
  it("returns env-missing state when server env is not configured", async () => {
    const result = await loadDetailPageData({
      marketId: "market-1",
      dependencies: {
        isSupabaseServerEnvConfigured: () => false,
        getMissingSupabaseServerEnv: () => ["SUPABASE_SERVICE_ROLE_KEY"],
      },
    });

    expect(result).toEqual({
      kind: "env_missing",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
  });

  it("returns not-found state for missing market", async () => {
    const result = await loadDetailPageData({
      marketId: "market-1",
      dependencies: {
        isSupabaseServerEnvConfigured: () => true,
        getMissingSupabaseServerEnv: () => [],
        isSupabaseServiceEnvConfigured: () => false,
        createClient: vi.fn(async () => ({}) as never),
        getMarketViewerContext: vi.fn(async () => ({}) as MarketViewerContext),
        getMarketDetail: vi.fn(async () => ({ kind: "not_found" } as const)),
      },
    });

    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns ready data and runs sync RPCs when service env is configured", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const viewer = {
      userId: "user-1",
      isAuthenticated: true,
      activeOrganizationId: "org-1",
      hasActiveInstitution: true,
    } as MarketViewerContext;
    const market = {
      id: "market-1",
      question: "Will this test pass?",
    } as MarketDetailDTO;

    const result = await loadDetailPageData({
      marketId: "market-1",
      dependencies: {
        isSupabaseServerEnvConfigured: () => true,
        getMissingSupabaseServerEnv: () => [],
        isSupabaseServiceEnvConfigured: () => true,
        createServiceClient: vi.fn(() => ({ rpc }) as never),
        createClient: vi.fn(async () => ({}) as never),
        getMarketViewerContext: vi.fn(async () => viewer),
        getMarketDetail: vi.fn(async () => ({ kind: "ok", market } as const)),
      },
    });

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      kind: "ready",
      marketId: "market-1",
      viewer,
      market,
    });
  });
});
