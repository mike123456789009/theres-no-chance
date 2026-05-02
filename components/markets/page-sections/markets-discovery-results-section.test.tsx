// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DiscoveryMarketCardsResult } from "@/lib/markets/pages/discovery";
import type { MarketDiscoveryQuery, MarketViewerContext } from "@/lib/markets/read-markets";

import { MarketsDiscoveryResultsSection } from "./markets-discovery-results-section";

describe("MarketsDiscoveryResultsSection", () => {
  const query: MarketDiscoveryQuery = {
    search: "",
    category: "trending",
    status: "all",
    access: "all",
    sort: "volume",
  };

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
          resolutionOutcome: null,
          finalizedAt: null,
          voidReason: null,
          adjudicationRequired: false,
          openChallengeCount: 0,
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

    render(
      <MarketsDiscoveryResultsSection
        viewer={viewer}
        result={result}
        loadError={null}
        query={query}
        viewerIsAdmin={false}
      />
    );

    expect(screen.getByText("Will this smoke test render?")).toBeInTheDocument();
    expect(screen.getByText("Open for trading")).toBeInTheDocument();
    expect(screen.getByText("Pool 2.5K")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toBeInTheDocument();
  });

  it("renders retired no-action lifecycle labels", () => {
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
          id: "market-void",
          question: "Will this retired market label render?",
          status: "finalized",
          resolutionMode: "community",
          resolutionOutcome: "void",
          finalizedAt: "2026-01-02T00:00:00.000Z",
          voidReason: "no_activity_at_close",
          adjudicationRequired: false,
          openChallengeCount: 0,
          closeTime: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          tags: [],
          accessBadge: "Public",
          accessRequiresLogin: false,
          priceYes: 0.5,
          priceNo: 0.5,
          poolShares: 0,
          cardShadowTone: "mint",
          actionRequired: "account_ready",
        },
      ],
    };

    render(
      <MarketsDiscoveryResultsSection
        viewer={viewer}
        result={result}
        loadError={null}
        query={query}
        viewerIsAdmin={false}
      />
    );

    expect(screen.getByText("Retired: no action")).toBeInTheDocument();
  });

  it("renders open-filter empty-state CTAs for admins", () => {
    const viewer: MarketViewerContext = {
      userId: "admin-1",
      isAuthenticated: true,
      activeOrganizationId: null,
      hasActiveInstitution: false,
    };
    const result: DiscoveryMarketCardsResult = {
      schemaMissing: false,
      error: null,
      markets: [],
    };

    render(
      <MarketsDiscoveryResultsSection
        viewer={viewer}
        result={result}
        loadError={null}
        query={{ ...query, status: "open" }}
        viewerIsAdmin
      />
    );

    expect(screen.getByRole("heading", { name: "No open markets right now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse finalized markets" })).toHaveAttribute(
      "href",
      "/markets?status=finalized&access=all&sort=volume"
    );
    expect(screen.getByRole("link", { name: "Create a market" })).toHaveAttribute("href", "/create");
    expect(screen.getByRole("link", { name: "Check back after the next market scan" })).toHaveAttribute(
      "href",
      "/markets"
    );
    expect(screen.getByRole("link", { name: "Open market maker" })).toHaveAttribute(
      "href",
      "/account/admin/market-maker"
    );
  });

  it("renders proposal login CTA for guests with no open markets", () => {
    const viewer: MarketViewerContext = {
      userId: null,
      isAuthenticated: false,
      activeOrganizationId: null,
      hasActiveInstitution: false,
    };

    render(
      <MarketsDiscoveryResultsSection
        viewer={viewer}
        result={{ schemaMissing: false, error: null, markets: [] }}
        loadError={null}
        query={{ ...query, status: "open" }}
        viewerIsAdmin={false}
      />
    );

    expect(screen.getByRole("link", { name: "Log in to submit a proposal" })).toHaveAttribute("href", "/login");
  });
});
