import Link from "next/link";

import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminGrantControl } from "@/components/admin/admin-grant-control";
import { getAdminAllowlistEmails, listPlatformAdminUserIds } from "@/lib/auth/admin";
import { guardAdminPageAccess } from "@/lib/admin/account-dashboard";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

type UserListItem = {
  id: string;
  email: string;
  phone: string;
  createdAt: string;
  lastSignInAt: string;
  metadata: Record<string, unknown>;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  city_region: string | null;
  interests: string[] | null;
  kyc_status: string;
  bio: string | null;
} | null;

type WalletRow = {
  user_id: string;
  available_balance: number | string | null;
  reserved_balance: number | string | null;
  updated_at: string;
};

type LedgerRow = {
  id: string;
  entry_type: string;
  amount: number | string | null;
  currency: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type TradeFillRow = {
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

type CreatedMarketRow = {
  id: string;
  question: string;
  status: string;
  close_time: string;
  created_at: string;
  resolved_at: string | null;
};

type WithdrawalRow = {
  id: string;
  amount: number | string | null;
  currency: string;
  status: string;
  failure_reason: string | null;
  requested_at: string;
  processed_at: string | null;
};

type TokenPurchaseRow = {
  id: string;
  pack_key: string;
  amount_paid_cents: number;
  tokens_granted: number;
  stripe_session_id: string | null;
  coinbase_charge_id: string | null;
  created_at: string;
};

type DisputeRow = {
  id: string;
  market_id: string;
  status: string;
  reason: string;
  created_at: string;
};

type MarketQuestionRow = {
  id: string;
  question: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toUrlSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedCurrency(value: number): string {
  if (value === 0) return formatCurrency(0);
  const absolute = formatCurrency(Math.abs(value));
  return value > 0 ? `+${absolute}` : `-${absolute}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeLedgerSource(entry: LedgerRow): string {
  const metadata = entry.metadata ?? {};
  const provider = clean(metadata.provider) || (clean(metadata.stripeSessionId) ? "stripe" : clean(metadata.coinbaseChargeId) ? "coinbase" : "");
  const key = clean(metadata.key) || clean(metadata.intent);

  if (entry.entry_type === "pack_purchase" || entry.entry_type === "subscription_grant" || entry.entry_type === "deposit") {
    if (provider && key) return `${provider}:${key}`;
    if (provider) return provider;
    if (key) return key;
    return "system credit";
  }

  if (entry.entry_type.includes("withdrawal")) return "withdrawal";
  if (entry.entry_type.startsWith("trade")) return "trade engine";
  return "internal";
}

function displayNameFromUser(user: UserListItem, profileById: Map<string, ProfileRow>): string {
  const profile = profileById.get(user.id);
  const profileName = clean(profile?.display_name);
  if (profileName) return profileName;

  const metadataName = clean(user.metadata.display_name) || clean(user.metadata.full_name) || clean(user.metadata.name);
  if (metadataName) return metadataName;

  const email = clean(user.email);
  if (email.includes("@")) return email.split("@")[0];
  return "Unknown";
}

export default async function AdminUsersPage({ searchParams }: Readonly<{ searchParams?: SearchParamsInput }>) {
  const access = await guardAdminPageAccess();
  if (!access.ok) {
    return <AdminAccessPanel access={access} />;
  }

  const service = createServiceClient();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const params = toUrlSearchParams(resolvedSearchParams);
  const requestedUserId = clean(params.get("uid"));

  const {
    data: usersData,
    error: usersError,
  } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  const users = ((usersData?.users ?? []) as Array<Record<string, unknown>>)
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

  const userIds = users.map((user) => user.id);
  const bootstrapAdminEmails = new Set(getAdminAllowlistEmails().map((value) => value.toLowerCase()));
  const roleBasedAdminUserIds = new Set(await listPlatformAdminUserIds(1500));

  const [profilesResult, walletsResult] = await Promise.all([
    userIds.length
      ? service.from("profiles").select("id, display_name, avatar_url, city_region, interests, kyc_status, bio").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? service
          .from("wallet_accounts")
          .select("user_id, available_balance, reserved_balance, updated_at")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profileById = new Map<string, ProfileRow>(
    ((profilesResult.data ?? []) as Array<ProfileRow & { id: string }>).map((profile) => [profile.id, profile])
  );

  const walletByUserId = new Map<string, WalletRow>(
    ((walletsResult.data ?? []) as WalletRow[]).map((wallet) => [wallet.user_id, wallet])
  );

  const selectedUser = users.find((user) => user.id === requestedUserId) ?? users[0] ?? null;

  const userIsAdmin = (user: UserListItem): boolean =>
    roleBasedAdminUserIds.has(user.id) || bootstrapAdminEmails.has(normalizeEmail(user.email));

  const selectedUserIsAdmin = selectedUser ? userIsAdmin(selectedUser) : false;

  let ledgerEntries: LedgerRow[] = [];
  let tradeFills: TradeFillRow[] = [];
  let createdMarkets: CreatedMarketRow[] = [];
  let withdrawals: WithdrawalRow[] = [];
  let tokenPurchases: TokenPurchaseRow[] = [];
  let disputes: DisputeRow[] = [];
  let marketQuestionById = new Map<string, string>();

  if (selectedUser) {
    const [ledgerResult, fillsResult, marketsResult, withdrawalsResult, tokenPurchasesResult, disputesResult] = await Promise.all([
      service
        .from("ledger_entries")
        .select("id, entry_type, amount, currency, created_at, metadata")
        .eq("user_id", selectedUser.id)
        .order("created_at", { ascending: false })
        .limit(220),
      service
        .from("trade_fills")
        .select("id, market_id, side, action, shares, price, notional, fee_amount, created_at")
        .eq("user_id", selectedUser.id)
        .order("created_at", { ascending: false })
        .limit(220),
      service
        .from("markets")
        .select("id, question, status, close_time, created_at, resolved_at")
        .eq("creator_id", selectedUser.id)
        .order("created_at", { ascending: false })
        .limit(220),
      service
        .from("withdrawal_requests")
        .select("id, amount, currency, status, failure_reason, requested_at, processed_at")
        .eq("user_id", selectedUser.id)
        .order("requested_at", { ascending: false })
        .limit(220),
      service
        .from("token_pack_purchases")
        .select("id, pack_key, amount_paid_cents, tokens_granted, stripe_session_id, coinbase_charge_id, created_at")
        .eq("user_id", selectedUser.id)
        .order("created_at", { ascending: false })
        .limit(220),
      service
        .from("market_disputes")
        .select("id, market_id, status, reason, created_at")
        .eq("created_by", selectedUser.id)
        .order("created_at", { ascending: false })
        .limit(220),
    ]);

    ledgerEntries = (ledgerResult.data ?? []) as LedgerRow[];
    tradeFills = (fillsResult.data ?? []) as TradeFillRow[];
    createdMarkets = (marketsResult.data ?? []) as CreatedMarketRow[];
    withdrawals = (withdrawalsResult.data ?? []) as WithdrawalRow[];
    tokenPurchases = (tokenPurchasesResult.data ?? []) as TokenPurchaseRow[];
    disputes = (disputesResult.data ?? []) as DisputeRow[];

    const marketIds = Array.from(new Set([...tradeFills.map((fill) => fill.market_id), ...disputes.map((dispute) => dispute.market_id)])).filter(
      (value) => value.length > 0
    );

    if (marketIds.length) {
      const { data: marketRows } = await service.from("markets").select("id, question").in("id", marketIds);
      marketQuestionById = new Map(((marketRows ?? []) as MarketQuestionRow[]).map((market) => [market.id, market.question]));
    }
  }

  return (
    <section className="account-panel" aria-label="Admin users history">
      <p className="create-kicker">Admin / Users</p>
      <h1 className="create-title">User accounts + comprehensive history</h1>
      <p className="create-copy">
        Review contact info, deposits and funding sources, market creation, trading activity, withdrawals, and moderation records.
      </p>

      {usersError ? (
        <p className="create-note tnc-error-text">
          Unable to load users: <code>{usersError.message}</code>
        </p>
      ) : null}

      <div className="admin-users-layout">
        <aside className="create-section" aria-label="User directory">
          <h2>Users ({users.length})</h2>
          {users.length === 0 ? (
            <p className="create-note">No users found.</p>
          ) : (
            <div className="admin-user-directory-list">
              {users.map((user) => {
                const wallet = walletByUserId.get(user.id);
                const selected = selectedUser?.id === user.id;
                const displayName = displayNameFromUser(user, profileById);

                return (
                  <Link key={user.id} className={selected ? "admin-user-link is-active" : "admin-user-link"} href={`/account/admin/users?uid=${user.id}`}>
                    <strong>{displayName}</strong>
                    <span>{user.email || "No email"}</span>
                    <span>{userIsAdmin(user) ? "Role: Platform admin" : "Role: Standard user"}</span>
                    <span>
                      Wallet: {wallet ? formatCurrency(toNumber(wallet.available_balance, 0) + toNumber(wallet.reserved_balance, 0)) : "$0.00"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </aside>

        <section className="admin-user-history-stack">
          {!selectedUser ? (
            <section className="create-section" aria-label="No user selected">
              <h2>Select a user</h2>
              <p className="create-note">Pick a user from the directory to inspect complete account history.</p>
            </section>
          ) : (
            <>
              <section className="create-section" aria-label="User profile and contact info">
                <h2>Profile + contact</h2>
                <p className="create-note">
                  <strong>User id:</strong> <code>{selectedUser.id}</code>
                </p>
                <p className="create-note">
                  <strong>Email:</strong> {selectedUser.email || "N/A"}
                </p>
                <p className="create-note">
                  <strong>Phone:</strong> {selectedUser.phone || "N/A"}
                </p>
                <p className="create-note">
                  <strong>Created:</strong> {formatDate(selectedUser.createdAt)}
                </p>
                <p className="create-note">
                  <strong>Last sign in:</strong> {formatDate(selectedUser.lastSignInAt)}
                </p>
                <p className="create-note">
                  <strong>Display name:</strong> {displayNameFromUser(selectedUser, profileById)}
                </p>
                <p className="create-note">
                  <strong>Admin status:</strong> {selectedUserIsAdmin ? "Platform admin" : "Standard user"}
                </p>
                <p className="create-note">
                  <strong>KYC:</strong> {formatStatus(clean(profileById.get(selectedUser.id)?.kyc_status) || "not_started")}
                </p>
                <p className="create-note">
                  <strong>City/region:</strong> {clean(profileById.get(selectedUser.id)?.city_region) || "N/A"}
                </p>
                <p className="create-note">
                  <strong>Interests:</strong> {(profileById.get(selectedUser.id)?.interests ?? []).join(", ") || "N/A"}
                </p>
              </section>

              <section className="create-section" aria-label="Admin role controls">
                <h2>Admin role controls</h2>
                <p className="create-note">
                  Promote users to platform admin with a two-step confirmation check.
                </p>
                <AdminGrantControl
                  targetUserId={selectedUser.id}
                  targetUserEmail={selectedUser.email || ""}
                  targetDisplayName={displayNameFromUser(selectedUser, profileById)}
                  alreadyAdmin={selectedUserIsAdmin}
                />
              </section>

              <section className="create-section" aria-label="Funding and deposit history">
                <h2>Deposits + funding sources</h2>
                {tokenPurchases.length === 0 ? (
                  <p className="create-note">No token purchases recorded.</p>
                ) : (
                  <div className="tnc-table-wrap">
                    <table className="admin-history-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Provider</th>
                          <th>Pack</th>
                          <th>Amount</th>
                          <th>Tokens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenPurchases.map((purchase) => (
                          <tr key={purchase.id}>
                            <td>{formatDate(purchase.created_at)}</td>
                            <td>{purchase.stripe_session_id ? "Stripe" : purchase.coinbase_charge_id ? "Coinbase" : "Unknown"}</td>
                            <td>{purchase.pack_key}</td>
                            <td>{formatCurrency(purchase.amount_paid_cents / 100)}</td>
                            <td>{purchase.tokens_granted.toLocaleString("en-US")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h2>Ledger overview</h2>
                {ledgerEntries.length === 0 ? (
                  <p className="create-note">No ledger entries found.</p>
                ) : (
                  <div className="tnc-table-wrap">
                    <table className="admin-history-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Entry type</th>
                          <th>Source</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerEntries.slice(0, 120).map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDate(entry.created_at)}</td>
                            <td>{formatStatus(entry.entry_type)}</td>
                            <td>{summarizeLedgerSource(entry)}</td>
                            <td>{formatSignedCurrency(toNumber(entry.amount, 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="create-section" aria-label="Market and trading history">
                <h2>Markets made ({createdMarkets.length})</h2>
                {createdMarkets.length === 0 ? (
                  <p className="create-note">No created markets found.</p>
                ) : (
                  <div className="tnc-table-wrap">
                    <table className="admin-history-table">
                      <thead>
                        <tr>
                          <th>Created</th>
                          <th>Question</th>
                          <th>Status</th>
                          <th>Close</th>
                          <th>Resolved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {createdMarkets.map((market) => (
                          <tr key={market.id}>
                            <td>{formatDate(market.created_at)}</td>
                            <td>{market.question}</td>
                            <td>{formatStatus(market.status)}</td>
                            <td>{formatDate(market.close_time)}</td>
                            <td>{formatDate(market.resolved_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h2>Buys / sells ({tradeFills.length})</h2>
                {tradeFills.length === 0 ? (
                  <p className="create-note">No trade fills found.</p>
                ) : (
                  <div className="tnc-table-wrap">
                    <table className="admin-history-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Market</th>
                          <th>Action</th>
                          <th>Shares</th>
                          <th>Price</th>
                          <th>Notional</th>
                          <th>Fee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradeFills.slice(0, 160).map((fill) => (
                          <tr key={fill.id}>
                            <td>{formatDate(fill.created_at)}</td>
                            <td>{marketQuestionById.get(fill.market_id) ?? fill.market_id}</td>
                            <td>
                              {fill.action.toUpperCase()} {fill.side.toUpperCase()}
                            </td>
                            <td>{toNumber(fill.shares, 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                            <td>{formatPercent(toNumber(fill.price, 0))}</td>
                            <td>{formatCurrency(toNumber(fill.notional, 0))}</td>
                            <td>{formatCurrency(toNumber(fill.fee_amount, 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="create-section" aria-label="Cashout and moderation history">
                <h2>Cashouts ({withdrawals.length})</h2>
                {withdrawals.length === 0 ? (
                  <p className="create-note">No withdrawal requests found.</p>
                ) : (
                  <div className="tnc-table-wrap">
                    <table className="admin-history-table">
                      <thead>
                        <tr>
                          <th>Requested</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Processed</th>
                          <th>Failure reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withdrawals.map((withdrawal) => (
                          <tr key={withdrawal.id}>
                            <td>{formatDate(withdrawal.requested_at)}</td>
                            <td>{formatCurrency(toNumber(withdrawal.amount, 0))}</td>
                            <td>{formatStatus(withdrawal.status)}</td>
                            <td>{formatDate(withdrawal.processed_at)}</td>
                            <td>{withdrawal.failure_reason || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h2>Resolution votes / disputes ({disputes.length})</h2>
                <p className="create-note">
                  Community market resolution voting is planned. Current records below show dispute actions submitted by this user.
                </p>
                {disputes.length === 0 ? (
                  <p className="create-note">No dispute or vote-like records found.</p>
                ) : (
                  <div className="tnc-table-wrap">
                    <table className="admin-history-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Market</th>
                          <th>Status</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {disputes.map((dispute) => (
                          <tr key={dispute.id}>
                            <td>{formatDate(dispute.created_at)}</td>
                            <td>{marketQuestionById.get(dispute.market_id) ?? dispute.market_id}</td>
                            <td>{formatStatus(dispute.status)}</td>
                            <td>{dispute.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
