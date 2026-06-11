import Link from "next/link";

import { AccountLoginRequiredPanel, AccountUnavailablePanel } from "@/components/account/account-state-panels";
import { formatCurrency, formatDate, formatLabel, formatPercent, formatSignedCurrency } from "@/lib/account/formatters";
import { loadAccountPageContext } from "@/lib/account/page-context";
import { getPortfolioSnapshot } from "@/lib/markets/portfolio";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const context = await loadAccountPageContext();
  if (!context.ok && context.reason === "env") {
    return (
      <AccountUnavailablePanel
        kicker="Portfolio"
        title="Portfolio Unavailable"
        copy="Configure Supabase server environment values before loading portfolio data."
        missingEnv={context.missingEnv}
        continueHref="/markets"
        continueLabel="markets"
        ariaLabel="Portfolio configuration error"
      />
    );
  }

  if (!context.ok) {
    return (
      <AccountLoginRequiredPanel
        kicker="Portfolio"
        title="Log in to view portfolio"
        copy="Portfolio holdings, P&amp;L, and trade history require an authenticated account."
        ariaLabel="Portfolio login required"
      />
    );
  }

  const { supabase, user } = context;
  let snapshot: Awaited<ReturnType<typeof getPortfolioSnapshot>> | null = null;
  let loadError: string | null = null;

  try {
    snapshot = await getPortfolioSnapshot({
      supabase,
      userId: user.id,
    });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unknown portfolio load error.";
  }

  if (!snapshot) {
    return (
      <section className="account-panel account-panel-warning" aria-label="Portfolio load error">
        <p className="create-kicker">Portfolio</p>
        <h1 className="create-title">Unable to load portfolio</h1>
        <p className="create-copy">
          Error detail: <code>{loadError ?? "Unknown error."}</code>
        </p>
        <div className="create-actions account-actions-top">
          <Link className="create-submit create-submit-muted" href="/account/portfolio">
            Retry
          </Link>
          <Link className="create-submit create-submit-muted" href="/markets">
            Back to markets
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="account-panel" aria-label="Portfolio overview">
      <p className="create-kicker">Portfolio</p>
      <h1 className="create-title">Holdings + P&amp;L</h1>
      <p className="create-copy">
        Track open exposure, realized/unrealized P&amp;L, and recent fills. Download trade history as CSV from the export
        endpoint.
      </p>

      <div className="create-actions account-actions-top">
        <a className="create-submit create-submit-muted" href="/api/portfolio?format=csv">
          Export CSV
        </a>
        <Link className="create-submit create-submit-muted" href="/account/wallet">
          Wallet
        </Link>
        <Link className="create-submit create-submit-muted" href="/markets">
          Back to markets
        </Link>
      </div>

      <section className="create-section account-summary-grid" aria-label="Portfolio summary">
        <div>
          <p className="create-note">Wallet cash</p>
          <h2>{formatCurrency(snapshot.wallet.cashUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Reserved cash</p>
          <h2>{formatCurrency(snapshot.wallet.reservedUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Mark value</p>
          <h2>{formatCurrency(snapshot.summary.markValueUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Unrealized P&amp;L</p>
          <h2>{formatSignedCurrency(snapshot.summary.unrealizedPnlUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Realized P&amp;L</p>
          <h2>{formatSignedCurrency(snapshot.summary.realizedPnlUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Fees paid</p>
          <h2>{formatCurrency(snapshot.summary.feesPaidUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Open positions</p>
          <h2>{snapshot.summary.openPositions.toLocaleString("en-US")}</h2>
        </div>
        <div>
          <p className="create-note">Trade fills</p>
          <h2>{snapshot.summary.tradeCount.toLocaleString("en-US")}</h2>
        </div>
      </section>

      <section className="create-section" aria-label="Open and historical positions">
        <h2>Positions</h2>
        {snapshot.positions.length === 0 ? (
          <p className="create-note">No positions yet. Execute your first trade from a market detail page.</p>
        ) : (
          <div className="tnc-table-wrap">
            <table className="tnc-data-table tnc-data-table--narrow">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Status</th>
                  <th className="is-right">YES</th>
                  <th className="is-right">NO</th>
                  <th className="is-right">Mark Value</th>
                  <th className="is-right">Unrealized</th>
                  <th className="is-right">Realized</th>
                  <th>Closes</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.positions.map((position) => (
                  <tr key={position.marketId}>
                    <td>
                      <Link href={`/markets/${position.marketId}`}>{position.question}</Link>
                    </td>
                    <td>{formatLabel(position.status)}</td>
                    <td className="is-right">
                      {position.yesShares.toLocaleString("en-US", { maximumFractionDigits: 2 })} @{" "}
                      {position.averageEntryPriceYes === null ? "N/A" : formatPercent(position.averageEntryPriceYes)}
                    </td>
                    <td className="is-right">
                      {position.noShares.toLocaleString("en-US", { maximumFractionDigits: 2 })} @{" "}
                      {position.averageEntryPriceNo === null ? "N/A" : formatPercent(position.averageEntryPriceNo)}
                    </td>
                    <td className="is-right">{formatCurrency(position.markValue)}</td>
                    <td className="is-right">{formatSignedCurrency(position.unrealizedPnl)}</td>
                    <td className="is-right">{formatSignedCurrency(position.realizedPnl)}</td>
                    <td>{position.closeTime ? formatDate(position.closeTime) : "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="create-section" aria-label="Trade history">
        <h2>Recent trade fills</h2>
        {snapshot.fills.length === 0 ? (
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
                  <th className="is-right">Fee</th>
                  <th className="is-right">Cash Delta</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.fills.map((fill) => (
                  <tr key={fill.id}>
                    <td>{formatDate(fill.executedAt)}</td>
                    <td>
                      <Link href={`/markets/${fill.marketId}`}>{fill.question}</Link>
                    </td>
                    <td>
                      {fill.action.toUpperCase()} {fill.side.toUpperCase()}
                    </td>
                    <td className="is-right">{fill.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                    <td className="is-right">{formatPercent(fill.averagePrice)}</td>
                    <td className="is-right">{formatCurrency(fill.notional)}</td>
                    <td className="is-right">{formatCurrency(fill.feeAmount)}</td>
                    <td className="is-right">{formatSignedCurrency(fill.cashDelta)}</td>
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
