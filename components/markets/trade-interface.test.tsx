// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TradeInterface } from "./trade-interface";

function createQuote() {
  return {
    marketId: "market-1",
    side: "yes",
    action: "buy",
    shares: 25,
    feeBps: 200,
    priceBeforeYes: 0.5,
    priceAfterYes: 0.52,
    priceBeforeSide: 0.5,
    priceAfterSide: 0.52,
    averagePrice: 0.51,
    notional: 12.75,
    feeAmount: 0.26,
    netCashChange: -13.01,
    slippageBps: 50,
  };
}

function createExecution() {
  return {
    ...createQuote(),
    reused: false,
    tradeFillId: "fill-1",
    userId: "user-1",
    walletAvailableBalance: 100,
    positionYesShares: 30,
    positionNoShares: 0,
    positionRealizedPnl: 0,
    executedAt: "2026-02-21T00:00:00.000Z",
  };
}

function mockJsonResponse(ok: boolean, payload: unknown): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function waitForQuoteDebounce(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 350);
  });
}

describe("TradeInterface", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("disables controls when trading is not eligible", () => {
    render(
      <TradeInterface
        marketId="market-1"
        marketStatus="open"
        currentPriceYes={0.5}
        currentPriceNo={0.5}
        isAuthenticated
        canTrade={false}
        tradeDisabledReason="Read-only access"
      />
    );

    expect(screen.getByRole("button", { name: "Buy YES" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buy NO" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sell YES" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sell NO" })).toBeDisabled();
    expect(screen.getByLabelText(/Order size \(shares\)/i)).toBeDisabled();
    expect(screen.getByLabelText(/Max slippage \(%\)/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /shares$/i })).not.toBeInTheDocument();
    expect(screen.getByText("Read-only access")).toBeInTheDocument();
  });

  it("shows quote errors and keeps execute button disabled", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(false, { error: "Quote unavailable" }));

    render(
      <TradeInterface
        marketId="market-1"
        marketStatus="open"
        currentPriceYes={0.5}
        currentPriceNo={0.5}
        isAuthenticated
      />
    );

    await act(async () => waitForQuoteDebounce());

    await waitFor(() => {
      expect(screen.getByText("Quote unavailable")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Buy 25 YES shares" })).toBeDisabled();
  });

  it("handles execute success path and resets order size", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse(true, { quote: createQuote() }))
      .mockResolvedValueOnce(mockJsonResponse(true, { execution: createExecution() }));

    const user = userEvent.setup();

    render(
      <TradeInterface
        marketId="market-1"
        marketStatus="open"
        currentPriceYes={0.5}
        currentPriceNo={0.5}
        isAuthenticated
      />
    );

    const orderSizeInput = screen.getByLabelText(/Order size \(shares\)/i);
    await user.clear(orderSizeInput);
    await user.type(orderSizeInput, "30");

    await act(async () => waitForQuoteDebounce());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Buy 30 YES shares" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Buy 30 YES shares" }));

    await waitFor(() => {
      expect(screen.getByText("Trade executed successfully!")).toBeInTheDocument();
    });

    expect(orderSizeInput).toHaveValue(25);
  });

  it("shows execute error and keeps trading actionable for retry", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse(true, { quote: createQuote() }))
      .mockResolvedValueOnce(mockJsonResponse(false, { error: "Execution exploded" }));

    const user = userEvent.setup();

    render(
      <TradeInterface
        marketId="market-1"
        marketStatus="open"
        currentPriceYes={0.5}
        currentPriceNo={0.5}
        isAuthenticated
      />
    );

    await act(async () => waitForQuoteDebounce());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Buy 25 YES shares" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Buy 25 YES shares" }));

    await waitFor(() => {
      expect(screen.getByText("Execution exploded")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Buy 25 YES shares" })).toBeEnabled();
  });
});
