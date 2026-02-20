import Link from "next/link";

import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LedgerEntryRow = {
  id: string;
  entry_type: string;
  amount: number | string | null;
  currency: string | null;
  created_at: string;
};

type TradeFillRow = {
  id: string;
  market_id: string;
  side: string;
  action: string;
  shares: number | string | null;
  price: number | string | null;
  notional: number | string | null;
  created_at: string;
};

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function AccountActivityPage() {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <section className="account-panel account-panel-warning" aria-label="Account activity configuration error">
        <p className="create-kicker">Activity</p>
        <h1 className="create-title">Activity Unavailable</h1>
        <p className="create-copy">Configure Supabase server environment values before loading account activity.</p>
        <p className="create-copy">
          Missing env vars: <code>{missingEnv.join(", ")}</code>
        </p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return (
      <section className="account-panel" aria-label="Activity login required">
        <p className="create-kicker">Activity</p>
        <h1 className="create-title">Log in to view activity</h1>
        <p className="create-copy">Recent wallet ledger and trade fills are available after authentication.</p>
        <div className="create-actions account-actions-top">
          <Link className="create-submit create-submit-muted" href="/login">
            Log in
          </Link>
          <Link className="create-submit" href="/signup">
            Create account
          </Link>
          <Link className="create-submit create-submit-muted" href="/markets">
            Back to markets
          </Link>
        </div>
      </section>
    );
  }

  const [ledgerResult, fillsResult] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("id, entry_type, amount, currency, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("trade_fills")
      .select("id, market_id, side, action, shares, price, notional, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const ledgerEntries = ((ledgerResult.data ?? []) as LedgerEntryRow[]).map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    amount: toNumber(row.amount, 0),
    currency: row.currency ?? "USD",
    createdAt: row.created_at,
  }));

  const tradeFills = ((fillsResult.data ?? []) as TradeFillRow[]).map((row) => ({
    id: row.id,
    marketId: row.market_id,
    side: row.side,
    action: row.action,
    shares: toNumber(row.shares, 0),
    price: toNumber(row.price, 0),
    notional: toNumber(row.notional, 0),
    createdAt: row.created_at,
  }));

  return (
    <section className="account-panel" aria-label="Account activity">
      <p className="create-kicker">Activity</p>
      <h1 className="create-title">Recent account activity</h1>
      <p className="create-copy">Track recent wallet ledger entries and trade fills in one timeline-friendly view.</p>

      <section className="create-section" aria-label="Recent trade fills">
        <h2>Recent trade fills</h2>
        {fillsResult.error ? (
          <p className="create-note tnc-error-text">
            Unable to load trade fills: <code>{fillsResult.error.message}</code>
          </p>
        ) : tradeFills.length === 0 ? (
          <p className="create-note">No trade fills yet.</p>
        ) : (
          <div className="tnc-table-wrap">
            <table className="tnc-data-table tnc-data-table--wide">
              <thead>
                <tr>
                  <th>Executed</th>
                  <th>Market</th>
                  <th>Leg</th>
                  <th className="is-right">Shares</th>
                  <th className="is-right">Avg Price</th>
                  <th className="is-right">Notional</th>
                </tr>
              </thead>
              <tbody>
                {tradeFills.map((fill) => (
                  <tr key={fill.id}>
                    <td>{formatDate(fill.createdAt)}</td>
                    <td>
                      <Link href={`/markets/${fill.marketId}`}>{fill.marketId.slice(0, 8)}...</Link>
                    </td>
                    <td>
                      {fill.action.toUpperCase()} {fill.side.toUpperCase()}
                    </td>
                    <td className="is-right">{fill.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                    <td className="is-right">{formatPercent(fill.price)}</td>
                    <td className="is-right">{formatCurrency(fill.notional)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="create-section" aria-label="Recent ledger entries">
        <h2>Recent ledger entries</h2>
        {ledgerResult.error ? (
          <p className="create-note tnc-error-text">
            Unable to load ledger entries: <code>{ledgerResult.error.message}</code>
          </p>
        ) : ledgerEntries.length === 0 ? (
          <p className="create-note">No ledger entries yet.</p>
        ) : (
          <div className="tnc-table-wrap">
            <table className="tnc-data-table tnc-data-table--narrow">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th className="is-right">Amount</th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td>{formatLabel(entry.entryType)}</td>
                    <td className="is-right">{formatSignedCurrency(entry.amount)}</td>
                    <td>{entry.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
