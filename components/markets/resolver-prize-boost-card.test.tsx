// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResolverPrizeBoostCard } from "./resolver-prize-boost-card";

type ResolverPrizeProps = Parameters<typeof ResolverPrizeBoostCard>[0];

function createProps(overrides: Partial<ResolverPrizeProps> = {}): ResolverPrizeProps {
  return {
    marketId: "market-1",
    viewerIsAuthenticated: true,
    canContribute: true,
    resolverPrizeLockedTotal: 12.5,
    resolverPrizeContributionCount: 2,
    recentContributions: [],
    ...overrides,
  };
}

function mockJsonResponse(ok: boolean, payload: unknown): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function mockLocationReload() {
  const reload = vi.fn();
  const original = window.location;

  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...original,
      reload,
    },
  });

  return {
    reload,
    restore: () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    },
  };
}

describe("ResolverPrizeBoostCard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows pool totals, guest links, and an empty contribution feed", () => {
    render(<ResolverPrizeBoostCard {...createProps({ viewerIsAuthenticated: false })} />);

    expect(screen.getByRole("heading", { name: "Resolver prize boost" })).toBeInTheDocument();
    expect(screen.getByText(/Locked resolver prize pool:/)).toHaveTextContent("Locked resolver prize pool: $12.50");
    expect(screen.getByText(/Contributions:/)).toHaveTextContent("Contributions: 2");
    expect(screen.getByRole("link", { name: "Log in to contribute" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
    expect(screen.getByText("No resolver prize contributions yet.")).toBeInTheDocument();
  });

  it("shows closed contribution copy for authenticated users after finalization", () => {
    render(<ResolverPrizeBoostCard {...createProps({ canContribute: false })} />);

    expect(screen.getByText("Resolver prize contributions are closed after market finalization.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add resolver prize" })).not.toBeInTheDocument();
  });

  it("renders recent contributions with formatted amount, status, and truncated contributor id", () => {
    render(
      <ResolverPrizeBoostCard
        {...createProps({
          recentContributions: [
            {
              id: "contribution-1",
              contributorId: "user-1234567890",
              amount: 3.25,
              status: "locked",
              createdAt: "2026-06-22T18:00:00.000Z",
            },
          ],
        })}
      />
    );

    expect(screen.getByText(/^\$3.25 by/)).toHaveTextContent("$3.25 by user-1...7890");
    expect(screen.getByText(/^\$3.25 by/)).toHaveTextContent("Locked");
  });

  it("validates minimum contribution amount before calling the API", async () => {
    const user = userEvent.setup();
    render(<ResolverPrizeBoostCard {...createProps()} />);

    const amountInput = screen.getByLabelText("Contribution amount (USD)");
    await user.clear(amountInput);
    await user.type(amountInput, "0.5");
    await user.click(screen.getByRole("button", { name: "Add resolver prize" }));

    expect(screen.getByText("Contribution amount must be at least $1.00.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits resolver prize contributions, resets amount, and reloads on success", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(true, {}));
    const locationMock = mockLocationReload();
    const user = userEvent.setup();

    try {
      render(<ResolverPrizeBoostCard {...createProps()} />);

      const amountInput = screen.getByLabelText("Contribution amount (USD)");
      await user.clear(amountInput);
      await user.type(amountInput, "4.5");
      await user.click(screen.getByRole("button", { name: "Add resolver prize" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/markets/market-1/resolve/prize-contribution",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ amount: 4.5 }),
          })
        );
      });
      expect(screen.getByText("Resolver prize contribution added.")).toBeInTheDocument();
      expect(amountInput).toHaveValue(1);
      expect(locationMock.reload).toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });

  it("surfaces contribution API errors without reloading", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(false, { detail: "Insufficient available wallet balance." }));
    const locationMock = mockLocationReload();
    const user = userEvent.setup();

    try {
      render(<ResolverPrizeBoostCard {...createProps()} />);

      await user.click(screen.getByRole("button", { name: "Add resolver prize" }));

      expect(await screen.findByText("Insufficient available wallet balance.")).toBeInTheDocument();
      expect(locationMock.reload).not.toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });
});
