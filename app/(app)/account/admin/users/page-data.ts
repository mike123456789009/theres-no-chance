import { getAdminAllowlistEmails, listPlatformAdminUserIds } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type SearchParamsInput = SearchParamsRecord | Promise<SearchParamsRecord> | undefined;

export type UserListItem = {
  id: string;
  email: string;
  phone: string;
  createdAt: string;
  lastSignInAt: string;
  metadata: Record<string, unknown>;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  city_region: string | null;
  interests: string[] | null;
  kyc_status: string;
  bio: string | null;
};

export type WalletRow = {
  user_id: string;
  available_balance: number | string | null;
  reserved_balance: number | string | null;
  updated_at: string;
};

export type LedgerRow = {
  id: string;
  entry_type: string;
  amount: number | string | null;
  currency: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type TradeFillRow = {
  id: string;
  market_id: string;
  side: string;
  action: string;
  shares: number | string | null;
  price: number | string | null;
  notional: number | string | null;
  fee_amount: number | string | null;
  created_at: string;
};

export type CreatedMarketRow = {
  id: string;
  question: string;
  status: string;
  close_time: string;
  created_at: string;
  resolved_at: string | null;
};

export type WithdrawalRow = {
  id: string;
  amount: number | string | null;
  currency: string;
  status: string;
  failure_reason: string | null;
  requested_at: string;
  processed_at: string | null;
};

export type DisputeRow = {
  id: string;
  market_id: string;
  status: string;
  reason: string;
  created_at: string;
};

export type MarketQuestionRow = {
  id: string;
  question: string;
};

export type UsersErrorLike = {
  message: string;
} | null;

export type AdminUsersPageData = {
  usersError: UsersErrorLike;
  users: UserListItem[];
  profilesById: Record<string, ProfileRow>;
  walletsByUserId: Record<string, WalletRow>;
  displayNameByUserId: Record<string, string>;
  adminStatusByUserId: Record<string, boolean>;
  selectedUser: UserListItem | null;
  selectedUserIsAdmin: boolean;
  ledgerEntries: LedgerRow[];
  tradeFills: TradeFillRow[];
  createdMarkets: CreatedMarketRow[];
  withdrawals: WithdrawalRow[];
  disputes: DisputeRow[];
  marketQuestionById: Record<string, string>;
};

type ServiceClient = ReturnType<typeof createServiceClient>;

type UserListResponse = {
  data: {
    users?: Array<Record<string, unknown>>;
  } | null;
  error: UsersErrorLike;
};

export type AdminUsersPageDataDependencies = {
  createServiceClient: () => ServiceClient;
  getAdminAllowlistEmails: () => string[];
  listPlatformAdminUserIds: (limit: number) => Promise<string[]>;
  listUsers: (service: ServiceClient) => Promise<UserListResponse>;
  listProfiles: (service: ServiceClient, userIds: string[]) => Promise<ProfileRow[]>;
  listWallets: (service: ServiceClient, userIds: string[]) => Promise<WalletRow[]>;
  listLedgerEntries: (service: ServiceClient, userId: string) => Promise<LedgerRow[]>;
  listTradeFills: (service: ServiceClient, userId: string) => Promise<TradeFillRow[]>;
  listCreatedMarkets: (service: ServiceClient, userId: string) => Promise<CreatedMarketRow[]>;
  listWithdrawals: (service: ServiceClient, userId: string) => Promise<WithdrawalRow[]>;
  listDisputes: (service: ServiceClient, userId: string) => Promise<DisputeRow[]>;
  listMarketQuestions: (service: ServiceClient, marketIds: string[]) => Promise<MarketQuestionRow[]>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function toUrlSearchParams(raw: SearchParamsRecord): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string" && entry.trim().length > 0);
      if (first) params.set(key, first);
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      params.set(key, value);
    }
  }
  return params;
}

function normalizeUserList(rawUsers: Array<Record<string, unknown>>): UserListItem[] {
  return rawUsers
    .map((raw) => ({
      id: clean(raw.id),
      email: clean(raw.email),
      phone: clean(raw.phone),
      createdAt: clean(raw.created_at),
      lastSignInAt: clean(raw.last_sign_in_at),
      metadata: (raw.user_metadata && typeof raw.user_metadata === "object" && !Array.isArray(raw.user_metadata)
        ? (raw.user_metadata as Record<string, unknown>)
        : {}) as Record<string, unknown>,
    }))
    .filter((user) => user.id.length > 0)
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
}

function displayNameFromUser(user: UserListItem, profilesById: Record<string, ProfileRow>): string {
  const profile = profilesById[user.id];
  const profileName = clean(profile?.display_name);
  if (profileName) return profileName;

  const metadataName = clean(user.metadata.display_name) || clean(user.metadata.full_name) || clean(user.metadata.name);
  if (metadataName) return metadataName;

  const email = clean(user.email);
  if (email.includes("@")) return email.split("@")[0];
  return "Unknown";
}

const defaultDependencies: AdminUsersPageDataDependencies = {
  createServiceClient,
  getAdminAllowlistEmails,
  listPlatformAdminUserIds,
  listUsers: (service) =>
    service.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    }) as Promise<UserListResponse>,
  listProfiles: async (service, userIds) => {
    if (userIds.length === 0) return [];
    const { data } = await service
      .from("profiles")
      .select("id, display_name, avatar_url, city_region, interests, kyc_status, bio")
      .in("id", userIds);
    return (data ?? []) as ProfileRow[];
  },
  listWallets: async (service, userIds) => {
    if (userIds.length === 0) return [];
    const { data } = await service
      .from("wallet_accounts")
      .select("user_id, available_balance, reserved_balance, updated_at")
      .in("user_id", userIds);
    return (data ?? []) as WalletRow[];
  },
  listLedgerEntries: async (service, userId) => {
    const { data } = await service
      .from("ledger_entries")
      .select("id, entry_type, amount, currency, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(220);
    return (data ?? []) as LedgerRow[];
  },
  listTradeFills: async (service, userId) => {
    const { data } = await service
      .from("trade_fills")
      .select("id, market_id, side, action, shares, price, notional, fee_amount, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(220);
    return (data ?? []) as TradeFillRow[];
  },
  listCreatedMarkets: async (service, userId) => {
    const { data } = await service
      .from("markets")
      .select("id, question, status, close_time, created_at, resolved_at")
      .eq("creator_id", userId)
      .order("created_at", { ascending: false })
      .limit(220);
    return (data ?? []) as CreatedMarketRow[];
  },
  listWithdrawals: async (service, userId) => {
    const { data } = await service
      .from("withdrawal_requests")
      .select("id, amount, currency, status, failure_reason, requested_at, processed_at")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(220);
    return (data ?? []) as WithdrawalRow[];
  },
  listDisputes: async (service, userId) => {
    const { data } = await service
      .from("market_disputes")
      .select("id, market_id, status, reason, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(220);
    return (data ?? []) as DisputeRow[];
  },
  listMarketQuestions: async (service, marketIds) => {
    if (marketIds.length === 0) return [];
    const { data } = await service.from("markets").select("id, question").in("id", marketIds);
    return (data ?? []) as MarketQuestionRow[];
  },
};

function resolveDependencies(partial?: Partial<AdminUsersPageDataDependencies>): AdminUsersPageDataDependencies {
  return {
    ...defaultDependencies,
    ...(partial ?? {}),
  };
}

export async function loadAdminUsersPageData(options?: {
  searchParams?: SearchParamsInput;
  dependencies?: Partial<AdminUsersPageDataDependencies>;
}): Promise<AdminUsersPageData> {
  const dependencies = resolveDependencies(options?.dependencies);
  const service = dependencies.createServiceClient();

  const resolvedSearchParams = await Promise.resolve(options?.searchParams ?? {});
  const params = toUrlSearchParams(resolvedSearchParams);
  const requestedUserId = clean(params.get("uid"));

  const usersResult = await dependencies.listUsers(service);
  const users = normalizeUserList((usersResult.data?.users ?? []) as Array<Record<string, unknown>>);

  const userIds = users.map((user) => user.id);
  const [roleBasedAdminUserIds, profiles, wallets] = await Promise.all([
    dependencies.listPlatformAdminUserIds(1500),
    dependencies.listProfiles(service, userIds),
    dependencies.listWallets(service, userIds),
  ]);

  const bootstrapAdminEmails = new Set(dependencies.getAdminAllowlistEmails().map((value) => value.toLowerCase()));
  const roleBasedAdminUserIdSet = new Set(roleBasedAdminUserIds);

  const profilesById: Record<string, ProfileRow> = {};
  for (const profile of profiles) {
    profilesById[profile.id] = profile;
  }

  const walletsByUserId: Record<string, WalletRow> = {};
  for (const wallet of wallets) {
    walletsByUserId[wallet.user_id] = wallet;
  }

  const displayNameByUserId: Record<string, string> = {};
  const adminStatusByUserId: Record<string, boolean> = {};
  for (const user of users) {
    displayNameByUserId[user.id] = displayNameFromUser(user, profilesById);
    adminStatusByUserId[user.id] = roleBasedAdminUserIdSet.has(user.id) || bootstrapAdminEmails.has(normalizeEmail(user.email));
  }

  const selectedUser = users.find((user) => user.id === requestedUserId) ?? users[0] ?? null;

  let ledgerEntries: LedgerRow[] = [];
  let tradeFills: TradeFillRow[] = [];
  let createdMarkets: CreatedMarketRow[] = [];
  let withdrawals: WithdrawalRow[] = [];
  let disputes: DisputeRow[] = [];
  let marketQuestionById: Record<string, string> = {};

  if (selectedUser) {
    [ledgerEntries, tradeFills, createdMarkets, withdrawals, disputes] = await Promise.all([
      dependencies.listLedgerEntries(service, selectedUser.id),
      dependencies.listTradeFills(service, selectedUser.id),
      dependencies.listCreatedMarkets(service, selectedUser.id),
      dependencies.listWithdrawals(service, selectedUser.id),
      dependencies.listDisputes(service, selectedUser.id),
    ]);

    const marketIds = Array.from(new Set([...tradeFills.map((fill) => fill.market_id), ...disputes.map((dispute) => dispute.market_id)])).filter(
      (value) => value.length > 0
    );

    if (marketIds.length) {
      const marketRows = await dependencies.listMarketQuestions(service, marketIds);
      marketQuestionById = Object.fromEntries(marketRows.map((market) => [market.id, market.question]));
    }
  }

  return {
    usersError: usersResult.error && typeof usersResult.error.message === "string" ? { message: usersResult.error.message } : null,
    users,
    profilesById,
    walletsByUserId,
    displayNameByUserId,
    adminStatusByUserId,
    selectedUser,
    selectedUserIsAdmin: selectedUser ? Boolean(adminStatusByUserId[selectedUser.id]) : false,
    ledgerEntries,
    tradeFills,
    createdMarkets,
    withdrawals,
    disputes,
    marketQuestionById,
  };
}

export { clean, displayNameFromUser, normalizeEmail, toUrlSearchParams };
