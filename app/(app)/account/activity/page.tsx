import Link from "next/link";

import { AccountLoginRequiredPanel, AccountUnavailablePanel } from "@/components/account/account-state-panels";
import { formatCurrency, formatDate, formatLabel, formatPercent, formatSignedCurrency, toNumber } from "@/lib/account/formatters";
import { loadAccountPageContext } from "@/lib/account/page-context";

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

export default async function AccountActivityPage() {
  const context = await loadAccountPageContext();
  if (!context.ok && context.reason === "env") {
    return (
      <AccountUnavailablePanel
        kicker="Activity"
        title="Activity Unavailable"
        copy="Configure Supabase server environment values before loading account activity."
        missingEnv={context.missingEnv}
        ariaLabel="Account activity configuration error"
      />
    );
  }

  if (!context.ok) {
    return (
      <AccountLoginRequiredPanel
        kicker="Activity"
        title="Log in to view activity"
        copy="Recent wallet ledger and trade fills are available after authentication."
        ariaLabel="Activity login required"
      />
    );
  }

  const { supabase, user } = context;
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
