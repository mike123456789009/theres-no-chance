import Link from "next/link";

import { AdminGrantControl } from "@/components/admin/admin-grant-control";

import type { AdminUsersPageData, LedgerRow, UserListItem } from "./page-data";
import { clean } from "./page-data";

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
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
  const provider = clean(metadata.provider).toLowerCase();
  const key = clean(metadata.key) || clean(metadata.intent);

  if (entry.entry_type === "pack_purchase" || entry.entry_type === "subscription_grant") {
    return "legacy funding";
  }

  if (entry.entry_type === "deposit") {
    if (provider === "venmo") return "venmo deposit";
    if (provider) return "legacy funding";
    if (key === "usd_topup") return "deposit";
    if (key) return key;
    return "deposit";
  }

  if (entry.entry_type.includes("withdrawal")) return "withdrawal";
  if (entry.entry_type.startsWith("trade")) return "trade engine";
  return "internal";
}

type UserDirectorySectionProps = {
  users: UserListItem[];
  selectedUserId: string | null;
  displayNameByUserId: Record<string, string>;
  adminStatusByUserId: Record<string, boolean>;
  walletsByUserId: AdminUsersPageData["walletsByUserId"];
};

function UserDirectorySection({
  users,
  selectedUserId,
  displayNameByUserId,
  adminStatusByUserId,
  walletsByUserId,
}: UserDirectorySectionProps) {
  return (
    <aside className="create-section" aria-label="User directory">
      <h2>Users ({users.length})</h2>
      {users.length === 0 ? (
        <p className="create-note">No users found.</p>
      ) : (
        <div className="admin-user-directory-list">
          {users.map((user) => {
            const wallet = walletsByUserId[user.id];
            const selected = selectedUserId === user.id;

            return (
              <Link key={user.id} className={selected ? "admin-user-link is-active" : "admin-user-link"} href={`/account/admin/users?uid=${user.id}`}>
                <strong>{displayNameByUserId[user.id] || "Unknown"}</strong>
                <span>{user.email || "No email"}</span>
                <span>{adminStatusByUserId[user.id] ? "Role: Platform admin" : "Role: Standard user"}</span>
                <span>
                  Wallet: {wallet ? formatCurrency(toNumber(wallet.available_balance, 0) + toNumber(wallet.reserved_balance, 0)) : "$0.00"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}

type UserProfileSectionProps = {
  data: AdminUsersPageData;
};

function UserProfileSection({ data }: UserProfileSectionProps) {
  if (!data.selectedUser) {
    return (
      <section className="create-section" aria-label="No user selected">
        <h2>Select a user</h2>
        <p className="create-note">Pick a user from the directory to inspect complete account history.</p>
      </section>
    );
  }

  const selectedProfile = data.profilesById[data.selectedUser.id];

  return (
    <>
      <section className="create-section" aria-label="User profile and contact info">
        <h2>Profile + contact</h2>
        <p className="create-note">
          <strong>User id:</strong> <code>{data.selectedUser.id}</code>
        </p>
        <p className="create-note">
          <strong>Email:</strong> {data.selectedUser.email || "N/A"}
        </p>
        <p className="create-note">
          <strong>Phone:</strong> {data.selectedUser.phone || "N/A"}
        </p>
        <p className="create-note">
          <strong>Created:</strong> {formatDate(data.selectedUser.createdAt)}
        </p>
        <p className="create-note">
          <strong>Last sign in:</strong> {formatDate(data.selectedUser.lastSignInAt)}
        </p>
        <p className="create-note">
          <strong>Display name:</strong> {data.displayNameByUserId[data.selectedUser.id] || "Unknown"}
        </p>
        <p className="create-note">
          <strong>Admin status:</strong> {data.selectedUserIsAdmin ? "Platform admin" : "Standard user"}
        </p>
        <p className="create-note">
          <strong>KYC:</strong> {formatStatus(clean(selectedProfile?.kyc_status) || "not_started")}
        </p>
        <p className="create-note">
          <strong>City/region:</strong> {clean(selectedProfile?.city_region) || "N/A"}
        </p>
        <p className="create-note">
          <strong>Interests:</strong> {(selectedProfile?.interests ?? []).join(", ") || "N/A"}
        </p>
      </section>

      <section className="create-section" aria-label="Admin role controls">
        <h2>Admin role controls</h2>
        <p className="create-note">Promote users to platform admin with a two-step confirmation check.</p>
        <AdminGrantControl
          targetUserId={data.selectedUser.id}
          targetUserEmail={data.selectedUser.email || ""}
          targetDisplayName={data.displayNameByUserId[data.selectedUser.id] || "Unknown"}
          alreadyAdmin={data.selectedUserIsAdmin}
        />
      </section>
    </>
  );
}

type FundingHistorySectionProps = {
  data: AdminUsersPageData;
};

function FundingHistorySection({ data }: FundingHistorySectionProps) {
  return (
    <section className="create-section" aria-label="Funding and deposit history">
      <h2>Deposits + ledger history</h2>
      {data.ledgerEntries.length === 0 ? (
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
              {data.ledgerEntries.slice(0, 120).map((entry) => (
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
  );
}

type MarketHistorySectionProps = {
  data: AdminUsersPageData;
};

function MarketHistorySection({ data }: MarketHistorySectionProps) {
  return (
    <section className="create-section" aria-label="Market and trading history">
      <h2>Markets made ({data.createdMarkets.length})</h2>
      {data.createdMarkets.length === 0 ? (
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
              {data.createdMarkets.map((market) => (
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

      <h2>Buys / sells ({data.tradeFills.length})</h2>
      {data.tradeFills.length === 0 ? (
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
              {data.tradeFills.slice(0, 160).map((fill) => (
                <tr key={fill.id}>
                  <td>{formatDate(fill.created_at)}</td>
                  <td>{data.marketQuestionById[fill.market_id] ?? fill.market_id}</td>
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
  );
}

type CashoutHistorySectionProps = {
  data: AdminUsersPageData;
};

function CashoutHistorySection({ data }: CashoutHistorySectionProps) {
  return (
    <section className="create-section" aria-label="Cashout and moderation history">
      <h2>Cashouts ({data.withdrawals.length})</h2>
      {data.withdrawals.length === 0 ? (
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
              {data.withdrawals.map((withdrawal) => (
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

      <h2>Resolution votes / disputes ({data.disputes.length})</h2>
      <p className="create-note">Community market resolution voting is planned. Current records below show dispute actions submitted by this user.</p>
      {data.disputes.length === 0 ? (
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
              {data.disputes.map((dispute) => (
                <tr key={dispute.id}>
                  <td>{formatDate(dispute.created_at)}</td>
                  <td>{data.marketQuestionById[dispute.market_id] ?? dispute.market_id}</td>
                  <td>{formatStatus(dispute.status)}</td>
                  <td>{dispute.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type AdminUsersPageContentProps = {
  data: AdminUsersPageData;
};

export function AdminUsersPageContent({ data }: AdminUsersPageContentProps) {
  return (
    <section className="account-panel" aria-label="Admin users history">
      <p className="create-kicker">Admin / Users</p>
      <h1 className="create-title">User accounts + comprehensive history</h1>
      <p className="create-copy">
        Review contact info, deposits and funding sources, market creation, trading activity, withdrawals, and moderation records.
      </p>

      {data.usersError ? (
        <p className="create-note tnc-error-text">
          Unable to load users: <code>{data.usersError.message}</code>
        </p>
      ) : null}

      <div className="admin-users-layout">
        <UserDirectorySection
          users={data.users}
          selectedUserId={data.selectedUser?.id ?? null}
          displayNameByUserId={data.displayNameByUserId}
          adminStatusByUserId={data.adminStatusByUserId}
          walletsByUserId={data.walletsByUserId}
        />

        <section className="admin-user-history-stack">
          {!data.selectedUser ? (
            <UserProfileSection data={data} />
          ) : (
            <>
              <UserProfileSection data={data} />
              <FundingHistorySection data={data} />
              <MarketHistorySection data={data} />
              <CashoutHistorySection data={data} />
            </>
          )}
        </section>
      </div>
    </section>
  );
}
