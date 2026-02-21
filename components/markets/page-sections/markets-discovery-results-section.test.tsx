// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DiscoveryMarketCardsResult } from "@/lib/markets/pages/discovery";
import type { MarketViewerContext } from "@/lib/markets/read-markets";

import { MarketsDiscoveryResultsSection } from "./markets-discovery-results-section";

describe("MarketsDiscoveryResultsSection", () => {
  it("renders market cards for successful discovery results", () => {
    const viewer: MarketViewerContext = {
      userId: "user-1",
      isAuthenticated: true,
      activeOrganizationId: "org-1",
      hasActiveInstitution: true,
    };
    const result: DiscoveryMarketCardsResult = {
      schemaMissing: false,
      error: null,
      markets: [
        {
          id: "market-1",
          question: "Will this smoke test render?",
          status: "open",
          resolutionMode: "community",
          closeTime: "2026-06-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          tags: ["testing"],
          accessBadge: "Public",
          accessRequiresLogin: false,
          priceYes: 0.6,
          priceNo: 0.4,
          poolShares: 2500,
          cardShadowTone: "mint",
          actionRequired: "account_ready",
        },
      ],
    };

    render(<MarketsDiscoveryResultsSection viewer={viewer} result={result} loadError={null} />);

    expect(screen.getByText("Will this smoke test render?")).toBeInTheDocument();
    expect(screen.getByText("Pool 2.5K")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toBeInTheDocument();
  });
});
