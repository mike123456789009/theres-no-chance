import { describe, expect, it } from "vitest";

import type { MarketDetailDTO, MarketViewerContext } from "@/lib/markets/read-markets";

import {
  deriveDetailCapabilities,
  formatCurrency,
  formatDetailDate,
  formatDetailStatus,
  formatPercent,
  formatShares,
  formatSignedCurrency,
} from "./detail";

describe("detail view-models", () => {
  it("formats values for detail labels", () => {
    expect(formatDetailDate(null)).toBe("Not specified");
    expect(formatDetailDate("bad-date")).toBe("Unknown");
    expect(formatPercent(0.532, 1)).toBe("53.2%");
    expect(formatDetailStatus("pending_resolution")).toBe("Pending Resolution");
    expect(formatShares(1234.56)).toBe("1,234.56");
    expect(formatCurrency(15)).toBe("$15.00");
    expect(formatSignedCurrency(-42)).toBe("-$42.00");
    expect(formatSignedCurrency(42)).toBe("+$42.00");
  });

  it("derives evidence and contribution capabilities from viewer and market state", () => {
    const viewer = {
      isAuthenticated: true,
    } as MarketViewerContext;
    const closedMarket = {
      status: "closed",
      finalizedAt: null,
    } as MarketDetailDTO;
    const finalizedMarket = {
      status: "finalized",
      finalizedAt: "2026-01-01T00:00:00.000Z",
    } as MarketDetailDTO;

    expect(deriveDetailCapabilities({ market: closedMarket, viewer })).toEqual({
      showEvidenceCard: true,
      canSubmitEvidence: true,
      canContributePrize: true,
    });

    expect(deriveDetailCapabilities({ market: finalizedMarket, viewer })).toEqual({
      showEvidenceCard: true,
      canSubmitEvidence: false,
      canContributePrize: false,
    });
  });
});
