// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MarketDetailDTO } from "@/lib/markets/read-markets";

import { MarketDetailContextSection } from "./market-detail-context-section";

describe("MarketDetailContextSection", () => {
  it("renders context fields and market metadata", () => {
    const market = {
      description: "A quick smoke test market.",
      createdAt: "2026-01-01T00:00:00.000Z",
      closeTime: "2026-06-01T00:00:00.000Z",
      expectedResolutionTime: "2026-06-03T00:00:00.000Z",
      feeBps: 200,
      resolverStakeCap: 100,
      creatorRakePaidAmount: 4.25,
      tags: ["test"],
      riskFlags: ["volatility"],
    } as MarketDetailDTO;

    render(<MarketDetailContextSection market={market} />);

    expect(screen.getByRole("heading", { name: "Market context" })).toBeInTheDocument();
    expect(screen.getByText("A quick smoke test market.")).toBeInTheDocument();
    expect(screen.getByText(/Tags:/)).toHaveTextContent("Tags: test");
    expect(screen.getByText(/Risk flags:/)).toHaveTextContent("Risk flags: volatility");
  });
});
