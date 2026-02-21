import { describe, expect, it } from "vitest";

import { parseMarketDiscoveryQuery, shouldIncludeForCategory, shouldIncludeForSearch, toUrlSearchParams } from "./query";
import type { MarketCardDTO } from "./types";

function makeMarket(overrides: Partial<MarketCardDTO> = {}): MarketCardDTO {
  return {
    id: "market-1",
    question: "Will ETH price close above $5,000 this year?",
    status: "open",
    resolutionMode: "community",
    closeTime: "2026-12-31T00:00:00.000Z",
    createdAt: "2026-02-01T00:00:00.000Z",
    tags: ["crypto", "ethereum"],
    accessBadge: "Public",
    accessRequiresLogin: false,
    priceYes: 0.5,
    priceNo: 0.5,
    poolShares: 0,
    cardShadowTone: "mint",
    actionRequired: "account_ready",
    ...overrides,
  };
}

describe("read-markets query parsing", () => {
  it("applies defaults for unknown params", () => {
    const params = new URLSearchParams({
      q: "hello",
      category: "not-real",
      status: "not-real",
      access: "not-real",
      sort: "not-real",
    });

    expect(parseMarketDiscoveryQuery(params)).toEqual({
      search: "hello",
      category: "trending",
      status: "all",
      access: "all",
      sort: "closing_soon",
    });
  });

  it("maps legacy category search query to category and clears raw search", () => {
    const params = new URLSearchParams({ q: "crypto" });
    const parsed = parseMarketDiscoveryQuery(params);

    expect(parsed.category).toBe("crypto");
    expect(parsed.search).toBe("");
  });

  it("keeps explicit category and search text", () => {
    const params = new URLSearchParams({ q: "federal reserve", category: "finance" });

    expect(parseMarketDiscoveryQuery(params)).toMatchObject({
      category: "finance",
      search: "federal reserve",
    });
  });

  it("normalizes raw search params object", () => {
    const params = toUrlSearchParams({
      q: ["", "crypto"],
      status: "open",
      empty: "",
      ignored: undefined,
    });

    expect(params.get("q")).toBe("crypto");
    expect(params.get("status")).toBe("open");
    expect(params.has("empty")).toBe(false);
    expect(params.has("ignored")).toBe(false);
  });
});

describe("read-markets category/search filtering", () => {
  it("includes market for matching category terms in question/tags", () => {
    const market = makeMarket();

    expect(shouldIncludeForCategory({ category: "crypto", market, nowMs: Date.now() })).toBe(true);
    expect(shouldIncludeForCategory({ category: "sports", market, nowMs: Date.now() })).toBe(false);
  });

  it("handles new category by creation date window", () => {
    const nowMs = Date.parse("2026-02-21T00:00:00.000Z");
    const recent = makeMarket({ createdAt: "2026-02-18T00:00:00.000Z" });
    const old = makeMarket({ createdAt: "2025-12-01T00:00:00.000Z" });

    expect(shouldIncludeForCategory({ category: "new", market: recent, nowMs })).toBe(true);
    expect(shouldIncludeForCategory({ category: "new", market: old, nowMs })).toBe(false);
  });

  it("requires all search tokens to be present", () => {
    const market = makeMarket();

    expect(shouldIncludeForSearch(market, "eth price")).toBe(true);
    expect(shouldIncludeForSearch(market, "eth senate")).toBe(false);
  });
});
