import { describe, expect, it, vi } from "vitest";

import type {
  MarketDiscoveryQuery,
  MarketViewerContext,
} from "@/lib/markets/read-markets";
import type { ViewerAccountSummary } from "@/lib/markets/view-models/discovery";

import { loadDiscoveryPageData } from "./discovery";

function createDiscoveryQuery(): MarketDiscoveryQuery {
  return {
    search: "election",
    category: "trending",
    status: "all",
    access: "all",
    sort: "closing_soon",
  };
}

describe("loadDiscoveryPageData", () => {
  it("returns env-missing state when server env is not configured", async () => {
    const result = await loadDiscoveryPageData({
      dependencies: {
        isSupabaseServerEnvConfigured: () => false,
        getMissingSupabaseServerEnv: () => ["SUPABASE_URL"],
      },
    });

    expect(result).toEqual({
      kind: "env_missing",
      missingEnv: ["SUPABASE_URL"],
    });
  });

  it("loads viewer, account summary, and markets for ready state", async () => {
    const query = createDiscoveryQuery();
    const viewer: MarketViewerContext = {
      userId: "user-1",
      isAuthenticated: true,
      activeOrganizationId: "org-1",
      hasActiveInstitution: true,
    };
    const marketResult = {
      markets: [],
      error: null,
      schemaMissing: false,
    };
    const accountSummary: ViewerAccountSummary = {
      portfolioUsd: 120,
      cashUsd: 75,
      avatarUrl: "/assets/avatars/pixel-scout.svg",
      displayName: "Trader",
      isAdmin: false,
    };

    const result = await loadDiscoveryPageData({
      searchParams: { q: "election" },
      dependencies: {
        isSupabaseServerEnvConfigured: () => true,
        getMissingSupabaseServerEnv: () => [],
        createClient: vi.fn(async () => ({}) as never),
        toUrlSearchParams: vi.fn(() => new URLSearchParams("q=election")),
        parseMarketDiscoveryQuery: vi.fn(() => query),
        getMarketViewerContext: vi.fn(async () => viewer),
        listDiscoveryMarketCards: vi.fn(async () => marketResult),
        getViewerAccountSummary: vi.fn(async () => accountSummary),
      },
    });

    expect(result).toEqual({
      kind: "ready",
      query,
      viewer,
      result: marketResult,
      accountSummary,
      loadError: null,
    });
  });

  it("captures discovery load errors without throwing", async () => {
    const result = await loadDiscoveryPageData({
      dependencies: {
        isSupabaseServerEnvConfigured: () => true,
        getMissingSupabaseServerEnv: () => [],
        createClient: vi.fn(async () => ({}) as never),
        toUrlSearchParams: vi.fn(() => new URLSearchParams()),
        parseMarketDiscoveryQuery: vi.fn(createDiscoveryQuery),
        getMarketViewerContext: vi.fn(async () => {
          throw new Error("viewer failed");
        }),
      },
    });

    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.loadError).toBe("viewer failed");
      expect(result.result.markets).toEqual([]);
    }
  });
});
