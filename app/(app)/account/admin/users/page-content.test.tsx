// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminUsersPageContent } from "./page-content";
import type { AdminUsersPageData } from "./page-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

function createPageData(overrides: Partial<AdminUsersPageData> = {}): AdminUsersPageData {
  const base: AdminUsersPageData = {
    usersError: null,
    users: [
      {
        id: "user-1",
        email: "student@example.edu",
        phone: "555-0101",
        createdAt: "2026-06-01T12:00:00.000Z",
        lastSignInAt: "2026-06-20T12:00:00.000Z",
        metadata: {},
      },
      {
        id: "user-2",
        email: "admin@example.edu",
        phone: "",
        createdAt: "2026-05-01T12:00:00.000Z",
        lastSignInAt: "2026-06-18T12:00:00.000Z",
        metadata: {},
      },
    ],
    profilesById: {
      "user-1": {
        id: "user-1",
        display_name: "Student User",
        avatar_url: null,
        city_region: "Claremont",
        interests: ["markets", "campus"],
        kyc_status: "verified",
        bio: null,
      },
    },
    walletsByUserId: {
      "user-1": {
        user_id: "user-1",
        available_balance: 20,
        reserved_balance: 5,
        updated_at: "2026-06-20T12:00:00.000Z",
      },
    },
    displayNameByUserId: {
      "user-1": "Student User",
      "user-2": "Admin User",
    },
    adminStatusByUserId: {
      "user-1": false,
      "user-2": true,
    },
    selectedUser: {
      id: "user-1",
      email: "student@example.edu",
      phone: "555-0101",
      createdAt: "2026-06-01T12:00:00.000Z",
      lastSignInAt: "2026-06-20T12:00:00.000Z",
      metadata: {},
    },
    selectedUserIsAdmin: false,
    ledgerEntries: [
      {
        id: "ledger-1",
        entry_type: "deposit",
        amount: 25,
        currency: "USD",
        created_at: "2026-06-15T12:00:00.000Z",
        metadata: {
          provider: "venmo",
        },
      },
    ],
    tradeFills: [
      {
        id: "fill-1",
        market_id: "market-1",
        side: "yes",
        action: "buy",
        shares: 12,
        price: 0.62,
        notional: 7.44,
        fee_amount: 0.15,
        created_at: "2026-06-16T12:00:00.000Z",
      },
    ],
    createdMarkets: [
      {
        id: "created-1",
        question: "Will campus host a debate night?",
        status: "open",
        close_time: "2026-07-01T12:00:00.000Z",
        created_at: "2026-06-10T12:00:00.000Z",
        resolved_at: null,
      },
    ],
    withdrawals: [
      {
        id: "withdrawal-1",
        amount: 10,
        currency: "USD",
        status: "pending",
        failure_reason: null,
        requested_at: "2026-06-17T12:00:00.000Z",
        processed_at: null,
      },
    ],
    disputes: [
      {
        id: "dispute-1",
        market_id: "market-1",
        status: "open",
        reason: "Source changed after close.",
        created_at: "2026-06-18T12:00:00.000Z",
      },
    ],
    marketQuestionById: {
      "market-1": "Will the team win?",
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("AdminUsersPageContent", () => {
  it("renders selected user profile, role controls, and account histories", () => {
    render(<AdminUsersPageContent data={createPageData()} />);

    expect(screen.getByRole("heading", { name: "User accounts + comprehensive history" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Student User/ })).toHaveAttribute("href", "/account/admin/users?uid=user-1");
    expect(screen.getByRole("link", { name: /Admin User/ })).toHaveTextContent("Role: Platform admin");
    expect(screen.getAllByText("student@example.edu").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("venmo deposit")).toBeInTheDocument();
    expect(screen.getByText("Will campus host a debate night?")).toBeInTheDocument();
    expect(screen.getAllByText("Will the team win?")).toHaveLength(2);
    expect(screen.getByText("Source changed after close.")).toBeInTheDocument();
    expect(screen.getByLabelText("Grant platform admin access")).toHaveTextContent("Promote Student User");
  });

  it("renders loader errors and the no-selection state", () => {
    render(
      <AdminUsersPageContent
        data={createPageData({
          usersError: { message: "Supabase auth failed." },
          selectedUser: null,
          selectedUserIsAdmin: false,
          ledgerEntries: [],
          tradeFills: [],
          createdMarkets: [],
          withdrawals: [],
          disputes: [],
        })}
      />,
    );

    expect(screen.getByText("Supabase auth failed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Select a user" })).toBeInTheDocument();
    expect(screen.getByText("Pick a user from the directory to inspect complete account history.")).toBeInTheDocument();
  });
});
