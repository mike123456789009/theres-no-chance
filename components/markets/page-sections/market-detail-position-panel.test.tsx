// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MarketDetailDTO } from "@/lib/markets/read-markets";

import { MarketDetailPositionPanel } from "./market-detail-position-panel";

function createMarket(overrides: Partial<MarketDetailDTO>): MarketDetailDTO {
  return {
    actionRequired: "account_ready",
    viewerPosition: null,
    ...overrides,
  } as MarketDetailDTO;
}

describe("MarketDetailPositionPanel", () => {
  it("prompts guests to log in before showing personal exposure", () => {
    render(<MarketDetailPositionPanel market={createMarket({ actionRequired: "create_account" })} />);

    expect(screen.getByRole("heading", { name: "Your position" })).toBeInTheDocument();
    expect(screen.getByText("Log in to view personal exposure, P&L, and mark value.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
  });

  it("shows an empty state when an authenticated viewer has no position", () => {
    render(<MarketDetailPositionPanel market={createMarket({ viewerPosition: null })} />);

    expect(screen.getByText("No position in this market yet. Your first fill will appear here.")).toBeInTheDocument();
  });

  it("renders shares, mark value, average entries, and signed P&L for an existing position", () => {
    render(
      <MarketDetailPositionPanel
        market={createMarket({
          viewerPosition: {
            yesShares: 12.345,
            noShares: 2,
            totalShares: 14.345,
            markValue: 9.75,
            averageEntryPriceYes: 0.41,
            averageEntryPriceNo: null,
            realizedPnl: -3.5,
          },
        })}
      />
    );

    expect(screen.getByText("YES shares").closest("p")).toHaveTextContent("YES shares12.35");
    expect(screen.getByText("NO shares").closest("p")).toHaveTextContent("NO shares2");
    expect(screen.getByText("Total shares").closest("p")).toHaveTextContent("Total shares14.35");
    expect(screen.getByText("Mark value").closest("p")).toHaveTextContent("Mark value$9.75");
    expect(screen.getByText("Avg YES entry").closest("p")).toHaveTextContent("Avg YES entry41.00%");
    expect(screen.getByText("Avg NO entry").closest("p")).toHaveTextContent("Avg NO entryN/A");

    const pnl = screen.getByText("-$3.50");
    expect(pnl).toHaveClass("market-detail-negative");
  });
});
