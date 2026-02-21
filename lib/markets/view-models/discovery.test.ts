import { describe, expect, it } from "vitest";

import type { MarketCardDTO } from "@/lib/markets/read-markets";

import {
  cleanText,
  formatCurrency,
  formatDiscoveryDate,
  formatPoolShares,
  formatProbabilityPercent,
  formatMarketStatus,
  parseNumberish,
  shouldWarnAccess,
} from "./discovery";

describe("discovery view-models", () => {
  it("formats numeric and string values consistently", () => {
    expect(formatProbabilityPercent(0.523)).toBe("52%");
    expect(formatPoolShares(1_250)).toBe("1.3K");
    expect(formatPoolShares(1_250_000)).toBe("1.3M");
    expect(formatCurrency(1250.45)).toBe("$1,250.45");
    expect(formatMarketStatus("pending_resolution")).toBe("pending resolution");
  });

  it("handles invalid date and string cleaning fallbacks", () => {
    expect(formatDiscoveryDate("not-a-date")).toBe("Unknown");
    expect(cleanText("  hello  ")).toBe("hello");
    expect(cleanText(null)).toBe("");
  });

  it("parses numberish values with fallback behavior", () => {
    expect(parseNumberish(10, 0)).toBe(10);
    expect(parseNumberish("20.5", 0)).toBe(20.5);
    expect(parseNumberish("NaN", 7)).toBe(7);
    expect(parseNumberish(undefined, 3)).toBe(3);
  });

  it("flags restricted cards when access requires login", () => {
    const restrictedCard = {
      accessRequiresLogin: true,
    } as MarketCardDTO;
    const openCard = {
      accessRequiresLogin: false,
    } as MarketCardDTO;

    expect(shouldWarnAccess(restrictedCard)).toBe(true);
    expect(shouldWarnAccess(openCard)).toBe(false);
  });
});
