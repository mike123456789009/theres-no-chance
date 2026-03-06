import { describe, expect, it, vi } from "vitest";

import { loadAdminUsersPageData } from "./page-data";
import type { AdminUsersPageDataDependencies } from "./page-data";

function createDependencies(overrides?: Partial<AdminUsersPageDataDependencies>): AdminUsersPageDataDependencies {
  const base: AdminUsersPageDataDependencies = {
    createServiceClient: () => ({}) as never,
    getAdminAllowlistEmails: () => [],
    listPlatformAdminUserIds: async () => [],
    listUsers: async () => ({
      data: { users: [] },
      error: null,
    }),
    listProfiles: async () => [],
    listWallets: async () => [],
    listLedgerEntries: async () => [],
    listTradeFills: async () => [],
    listCreatedMarkets: async () => [],
    listWithdrawals: async () => [],
    listDisputes: async () => [],
    listMarketQuestions: async () => [],
  };

  return {
    ...base,
    ...(overrides ?? {}),
  };
}

describe("loadAdminUsersPageData", () => {
  it("transforms users, resolves selected user, and computes admin/display metadata", async () => {
    const listLedgerEntries = vi.fn(async () => [{ id: "ledger-1", entry_type: "deposit", amount: 100, currency: "USD", created_at: "2026-02-05", metadata: null }]);
    const listTradeFills = vi.fn(async () => [
      {
        id: "fill-1",
        market_id: "market-1",
        side: "yes",
        action: "buy",
        shares: 10,
        price: 0.55,
        notional: 5.5,
        fee_amount: 0.1,
        created_at: "2026-02-06",
      },
    ]);
    const listDisputes = vi.fn(async () => [
      {
        id: "dispute-1",
        market_id: "market-2",
        status: "open",
        reason: "Needs review",
        created_at: "2026-02-07",
      },
    ]);
    const listMarketQuestions = vi.fn(async () => [
      { id: "market-1", question: "Will alpha win?" },
      { id: "market-2", question: "Will beta launch?" },
    ]);

    const dependencies = createDependencies({
      getAdminAllowlistEmails: () => ["owner@example.edu"],
      listPlatformAdminUserIds: async () => ["user-2"],
      listUsers: async () => ({
        data: {
          users: [
            {
              id: "user-1",
              email: "OWNER@EXAMPLE.EDU",
              phone: "",
              created_at: "2026-02-01T12:00:00.000Z",
              last_sign_in_at: "2026-02-03T12:00:00.000Z",
              user_metadata: ["invalid-metadata"],
            },
            {
              id: "user-2",
              email: "member@example.edu",
              phone: "555-0000",
              created_at: "2026-02-02T12:00:00.000Z",
              last_sign_in_at: "2026-02-04T12:00:00.000Z",
              user_metadata: {
                display_name: "Metadata Name",
              },
            },
            {
              id: "",
              email: "drop-me@example.edu",
              created_at: "2026-02-09T00:00:00.000Z",
            },
          ],
        },
        error: null,
      }),
      listProfiles: async () => [
        {
          id: "user-2",
          display_name: "Profile Name",
          avatar_url: null,
          city_region: "Boston, MA",
          interests: ["markets"],
          kyc_status: "verified",
          bio: null,
        },
      ],
      listWallets: async () => [
        {
          user_id: "user-1",
          available_balance: 25,
          reserved_balance: 10,
          updated_at: "2026-02-08T00:00:00.000Z",
        },
      ],
      listLedgerEntries,
      listTradeFills,
      listDisputes,
      listMarketQuestions,
    });

    const result = await loadAdminUsersPageData({
      searchParams: { uid: "user-1" },
      dependencies,
    });

    expect(result.users.map((user) => user.id)).toEqual(["user-2", "user-1"]);
    expect(result.users[1]?.metadata).toEqual({});

    expect(result.selectedUser?.id).toBe("user-1");
    expect(result.selectedUserIsAdmin).toBe(true);

    expect(result.displayNameByUserId).toMatchObject({
      "user-1": "OWNER",
      "user-2": "Profile Name",
    });

    expect(result.adminStatusByUserId).toMatchObject({
      "user-1": true,
      "user-2": true,
    });

    expect(result.walletsByUserId["user-1"]?.available_balance).toBe(25);
    expect(result.marketQuestionById).toEqual({
      "market-1": "Will alpha win?",
      "market-2": "Will beta launch?",
    });

    expect(listLedgerEntries).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(listTradeFills).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(listDisputes).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(listMarketQuestions).toHaveBeenCalledWith(expect.anything(), ["market-1", "market-2"]);
  });

  it("returns empty selected-user detail state when no users are available", async () => {
    const listLedgerEntries = vi.fn(async () => []);
    const listTradeFills = vi.fn(async () => []);
    const listCreatedMarkets = vi.fn(async () => []);
    const listWithdrawals = vi.fn(async () => []);
    const listDisputes = vi.fn(async () => []);
    const listMarketQuestions = vi.fn(async () => []);

    const result = await loadAdminUsersPageData({
      searchParams: { uid: "missing-user" },
      dependencies: createDependencies({
        listUsers: async () => ({
          data: {
            users: [],
          },
          error: { message: "Directory fetch failed" },
        }),
        listLedgerEntries,
        listTradeFills,
        listCreatedMarkets,
        listWithdrawals,
        listDisputes,
        listMarketQuestions,
      }),
    });

    expect(result.users).toEqual([]);
    expect(result.selectedUser).toBeNull();
    expect(result.selectedUserIsAdmin).toBe(false);
    expect(result.usersError?.message).toBe("Directory fetch failed");
    expect(result.marketQuestionById).toEqual({});

    expect(listLedgerEntries).not.toHaveBeenCalled();
    expect(listTradeFills).not.toHaveBeenCalled();
    expect(listCreatedMarkets).not.toHaveBeenCalled();
    expect(listWithdrawals).not.toHaveBeenCalled();
    expect(listDisputes).not.toHaveBeenCalled();
    expect(listMarketQuestions).not.toHaveBeenCalled();
  });
});
