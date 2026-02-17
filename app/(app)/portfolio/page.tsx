import Link from "next/link";

import { getPortfolioSnapshot } from "@/lib/markets/portfolio";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function PortfolioPage() {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <main className="create-page">
        <section className="create-card create-card-warning" aria-label="Portfolio configuration error">
          <p className="create-kicker">Portfolio</p>
          <h1 className="create-title">Portfolio Unavailable</h1>
          <p className="create-copy">Configure Supabase server environment values before loading portfolio data.</p>
          <p className="create-copy">
            Missing env vars: <code>{missingEnv.join(", ")}</code>
          </p>
          <p className="create-copy">
            Continue to <Link href="/markets">markets</Link>
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return (
      <main className="create-page">
        <section className="create-card" aria-label="Portfolio login required">
          <p className="create-kicker">Portfolio</p>
          <h1 className="create-title">Log in to view portfolio</h1>
          <p className="create-copy">Portfolio holdings, P&amp;L, and trade history require an authenticated account.</p>
          <div className="create-actions" style={{ marginTop: "0.8rem" }}>
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
      </main>
    );
  }

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
      <main className="create-page">
        <section className="create-card create-card-warning" aria-label="Portfolio load error">
          <p className="create-kicker">Portfolio</p>
          <h1 className="create-title">Unable to load portfolio</h1>
          <p className="create-copy">
            Error detail: <code>{loadError ?? "Unknown error."}</code>
          </p>
          <div className="create-actions" style={{ marginTop: "0.8rem" }}>
            <Link className="create-submit create-submit-muted" href="/portfolio">
              Retry
            </Link>
            <Link className="create-submit create-submit-muted" href="/markets">
              Back to markets
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="create-page">
      <section className="create-card" aria-label="Portfolio overview">
        <p className="create-kicker">Portfolio</p>
        <h1 className="create-title">Holdings + P&amp;L</h1>
        <p className="create-copy">
          Track open exposure, realized/unrealized P&amp;L, and recent fills. Download trade history as CSV from the export
          endpoint.
        </p>

        <div className="create-actions" style={{ marginTop: "0.8rem" }}>
          <a className="create-submit create-submit-muted" href="/api/portfolio?format=csv">
            Export CSV
          </a>
          <Link className="create-submit create-submit-muted" href="/markets">
            Back to markets
          </Link>
        </div>

        <section
          className="create-section"
          aria-label="Portfolio summary"
          style={{ marginTop: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", display: "grid" }}
        >
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
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "760px",
                  fontFamily: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: "0.78rem",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Market</th>
                    <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Status</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>YES</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>NO</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Mark Value</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Unrealized</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Realized</th>
                    <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Closes</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.positions.map((position) => (
                    <tr key={position.marketId}>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>
                        <Link href={`/markets/${position.marketId}`}>{position.question}</Link>
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>
                        {formatStatus(position.status)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {position.yesShares.toLocaleString("en-US", { maximumFractionDigits: 2 })} @{" "}
                        {position.averageEntryPriceYes === null ? "N/A" : formatPercent(position.averageEntryPriceYes)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {position.noShares.toLocaleString("en-US", { maximumFractionDigits: 2 })} @{" "}
                        {position.averageEntryPriceNo === null ? "N/A" : formatPercent(position.averageEntryPriceNo)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {formatCurrency(position.markValue)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {formatSignedCurrency(position.unrealizedPnl)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {formatSignedCurrency(position.realizedPnl)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>
                        {position.closeTime ? formatDate(position.closeTime) : "Unknown"}
                      </td>
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
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "820px",
                  fontFamily: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: "0.76rem",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Executed</th>
                    <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Market</th>
                    <th style={{ textAlign: "left", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Leg</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Shares</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Avg Price</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Notional</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Fee</th>
                    <th style={{ textAlign: "right", borderBottom: "2px solid #101010", padding: "0.4rem" }}>Cash Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.fills.map((fill) => (
                    <tr key={fill.id}>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>{formatDate(fill.executedAt)}</td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>
                        <Link href={`/markets/${fill.marketId}`}>{fill.question}</Link>
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem" }}>
                        {fill.action.toUpperCase()} {fill.side.toUpperCase()}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {fill.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {formatPercent(fill.averagePrice)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {formatCurrency(fill.notional)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {formatCurrency(fill.feeAmount)}
                      </td>
                      <td style={{ borderBottom: "1px solid #cccccc", padding: "0.45rem 0.4rem", textAlign: "right" }}>
                        {formatSignedCurrency(fill.cashDelta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
