// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LedgerTable } from "./ledger-table";

describe("LedgerTable", () => {
  it("renders an empty state when there are no ledger entries", () => {
    render(<LedgerTable entries={[]} />);

    expect(screen.getByText("No ledger entries yet.")).toBeInTheDocument();
  });

  it("links market ledger metadata back to the market detail page", () => {
    render(
      <LedgerTable
        entries={[
          {
            id: "ledger-1",
            entryType: "trade_debit",
            amount: -12.5,
            currency: "USD",
            createdAt: "2026-06-21T18:00:00.000Z",
            metadata: { marketId: "market-1234567890" },
          },
        ]}
      />
    );

    expect(screen.getByText("-$12.50")).toBeInTheDocument();
    expect(screen.getByText(/market-1/).closest("a")).toHaveAttribute("href", "/markets/market-1234567890");
  });

  it("renders Venmo funding metadata with gross, fee, net, and invoice code", () => {
    render(
      <LedgerTable
        entries={[
          {
            id: "ledger-2",
            entryType: "deposit",
            amount: 48.25,
            currency: "USD",
            createdAt: "2026-06-21T18:00:00.000Z",
            metadata: {
              provider: "venmo",
              grossAmountUsd: "50",
              feeAmountUsd: 1.75,
              netAmountUsd: 48.25,
              invoiceCode: "TNC-1234",
            },
          },
        ]}
      />
    );

    const detailCell = screen.getByText(/venmo/);
    expect(detailCell).toHaveTextContent("gross $50.00");
    expect(detailCell).toHaveTextContent("fee $1.75");
    expect(detailCell).toHaveTextContent("net $48.25");
    expect(detailCell).toHaveTextContent("TNC-1234");
    expect(screen.getByText("+$48.25")).toBeInTheDocument();
  });

  it("renders token grant metadata from intent and key fields", () => {
    render(
      <LedgerTable
        entries={[
          {
            id: "ledger-3",
            entryType: "token_grant",
            amount: 0,
            currency: "USD",
            createdAt: "invalid-date",
            metadata: {
              intent: "referral",
              key: "friend-signup",
              tokensGranted: "25",
            },
          },
        ]}
      />
    );

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("referral:friend-signup (25 tokens)")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });
});
