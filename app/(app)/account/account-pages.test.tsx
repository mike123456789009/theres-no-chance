// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccountActivityPage from "./activity/page";
import AccountOverviewPage from "./overview/page";
import PortfolioPage from "./portfolio/page";

const mocks = vi.hoisted(() => ({
  loadAccountPageContext: vi.fn(),
  getPortfolioSnapshot: vi.fn(),
}));

vi.mock("@/lib/account/page-context", () => ({
  loadAccountPageContext: mocks.loadAccountPageContext,
}));

vi.mock("@/lib/markets/portfolio", () => ({
  getPortfolioSnapshot: mocks.getPortfolioSnapshot,
}));

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "trader@example.edu",
    user_metadata: {},
    ...overrides,
  };
}

function createMaybeSingleQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  return query;
}

function createListQuery(data: unknown[], error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data, error })),
  };
  return query;
}

describe("account pages", () => {
  beforeEach(() => {
    mocks.loadAccountPageContext.mockReset();
    mocks.getPortfolioSnapshot.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders overview env and login states", async () => {
    mocks.loadAccountPageContext.mockResolvedValueOnce({
      ok: false,
      reason: "env",
      missingEnv: ["SUPABASE_URL"],
    });

    render(await AccountOverviewPage());

    expect(screen.getByRole("heading", { name: "Account Unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/Missing env vars:/)).toHaveTextContent("SUPABASE_URL");
    cleanup();

    mocks.loadAccountPageContext.mockResolvedValueOnce({ ok: false, reason: "auth" });

    render(await AccountOverviewPage());

    expect(screen.getByRole("heading", { name: "Log in to open account center" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("renders overview profile, wallet balances, email, and quick actions", async () => {
    const walletQuery = createMaybeSingleQuery({
      available_balance: "120.5",
      reserved_balance: 4.25,
    });
    const profileQuery = createMaybeSingleQuery({
      display_name: "Profile Trader",
      avatar_url: "/assets/avatars/pixel-ranger.svg",
      ui_style: "retro",
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "wallet_accounts") return walletQuery;
        if (table === "profiles") return profileQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.loadAccountPageContext.mockResolvedValueOnce({
      ok: true,
      supabase,
      user: createUser(),
    });

    render(await AccountOverviewPage());

    expect(screen.getByRole("heading", { name: "Welcome back, Profile Trader" })).toBeInTheDocument();
    expect(screen.getByText("Email: trader@example.edu")).toBeInTheDocument();
    expect(screen.getByText("$120.50")).toBeInTheDocument();
    expect(screen.getByText("$4.25")).toBeInTheDocument();
    expect(screen.getByText("$124.75")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open portfolio" })).toHaveAttribute("href", "/account/portfolio");
    expect(screen.getByRole("link", { name: "View activity" })).toHaveAttribute("href", "/account/activity");
  });

  it("renders portfolio summary, positions, fills, and CSV export", async () => {
    mocks.loadAccountPageContext.mockResolvedValueOnce({
      ok: true,
      supabase: {},
      user: createUser(),
    });
    mocks.getPortfolioSnapshot.mockResolvedValueOnce({
      wallet: {
        cashUsd: 100,
        reservedUsd: 20,
      },
      summary: {
        markValueUsd: 32.5,
        unrealizedPnlUsd: 4.5,
        realizedPnlUsd: -2,
        feesPaidUsd: 1.25,
        openPositions: 1,
        tradeCount: 2,
      },
      positions: [
        {
          marketId: "market-1",
          question: "Will the test pass?",
          status: "open",
          yesShares: 10,
          noShares: 0,
          averageEntryPriceYes: 0.52,
          averageEntryPriceNo: null,
          markValue: 6,
          unrealizedPnl: 0.8,
          realizedPnl: -1.2,
          closeTime: "2026-06-22T18:00:00.000Z",
        },
      ],
      fills: [
        {
          id: "fill-1",
          marketId: "market-1",
          question: "Will the test pass?",
          side: "yes",
          action: "buy",
          shares: 10,
          averagePrice: 0.52,
          notional: 5.2,
          feeAmount: 0.1,
          cashDelta: -5.3,
          executedAt: "2026-06-21T18:00:00.000Z",
        },
      ],
    });

    render(await PortfolioPage());

    expect(screen.getByRole("heading", { name: "Holdings + P&L" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/portfolio?format=csv");
    const marketLinks = screen.getAllByRole("link", { name: "Will the test pass?" });
    expect(marketLinks).toHaveLength(2);
    expect(marketLinks[0]).toHaveAttribute("href", "/markets/market-1");
    expect(marketLinks[1]).toHaveAttribute("href", "/markets/market-1");
    expect(screen.getByText("+$4.50")).toBeInTheDocument();
    expect(screen.getByText("-$2.00")).toBeInTheDocument();
    expect(screen.getByText("-$5.30")).toBeInTheDocument();
  });

  it("renders portfolio load errors with retry and market links", async () => {
    mocks.loadAccountPageContext.mockResolvedValueOnce({
      ok: true,
      supabase: {},
      user: createUser(),
    });
    mocks.getPortfolioSnapshot.mockRejectedValueOnce(new Error("RPC unavailable"));

    render(await PortfolioPage());

    expect(screen.getByRole("heading", { name: "Unable to load portfolio" })).toBeInTheDocument();
    expect(screen.getByText(/Error detail:/)).toHaveTextContent("RPC unavailable");
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute("href", "/account/portfolio");
    expect(screen.getByRole("link", { name: "Back to markets" })).toHaveAttribute("href", "/markets");
  });

  it("renders activity fills and ledger entries with market links", async () => {
    const ledgerQuery = createListQuery([
      {
        id: "ledger-1",
        entry_type: "deposit",
        amount: "50",
        currency: "USD",
        created_at: "2026-06-21T18:00:00.000Z",
      },
    ]);
    const fillsQuery = createListQuery([
      {
        id: "fill-1",
        market_id: "market-1234567890",
        side: "yes",
        action: "buy",
        shares: "12.5",
        price: "0.44",
        notional: "5.5",
        created_at: "2026-06-21T18:05:00.000Z",
      },
    ]);
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "ledger_entries") return ledgerQuery;
        if (table === "trade_fills") return fillsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.loadAccountPageContext.mockResolvedValueOnce({
      ok: true,
      supabase,
      user: createUser(),
    });

    render(await AccountActivityPage());

    expect(screen.getByRole("heading", { name: "Recent account activity" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "market-1..." })).toHaveAttribute("href", "/markets/market-1234567890");
    expect(screen.getByText("BUY YES")).toBeInTheDocument();
    expect(screen.getByText("+$50.00")).toBeInTheDocument();
    expect(screen.getByText("Deposit")).toBeInTheDocument();
  });

  it("renders activity load errors for fills and ledger sections independently", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "ledger_entries") return createListQuery([], { message: "ledger failed" });
        if (table === "trade_fills") return createListQuery([], { message: "fills failed" });
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mocks.loadAccountPageContext.mockResolvedValueOnce({
      ok: true,
      supabase,
      user: createUser(),
    });

    render(await AccountActivityPage());

    expect(screen.getByText(/Unable to load trade fills:/)).toHaveTextContent("fills failed");
    expect(screen.getByText(/Unable to load ledger entries:/)).toHaveTextContent("ledger failed");
  });
});
