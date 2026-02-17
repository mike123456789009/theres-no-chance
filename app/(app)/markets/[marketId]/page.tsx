import Link from "next/link";
import { notFound } from "next/navigation";

import { getMarketDetail, getMarketViewerContext } from "@/lib/markets/read-markets";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "Not specified";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatShortDate(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${(value * 100).toFixed(maximumFractionDigits)}%`;
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatShares(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildChartGeometry(points: Array<{ priceYes: number }>): {
  linePath: string;
  areaPath: string;
  markerX: number;
  markerY: number;
  yTicks: Array<{ y: number; label: string }>;
} {
  const width = 640;
  const height = 272;
  const paddingX = 24;
  const paddingTop = 18;
  const paddingBottom = 30;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  const safePoints =
    points.length >= 2
      ? points.map((point) => ({
          priceYes: clamp(point.priceYes, 0, 1),
        }))
      : [{ priceYes: 0.5 }, { priceYes: 0.5 }];

  const coordinates = safePoints.map((point, index) => {
    const x = paddingX + (chartWidth * index) / (safePoints.length - 1);
    const y = paddingTop + (1 - point.priceYes) * chartHeight;
    return { x, y };
  });

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const baselineY = paddingTop + chartHeight;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(
    2
  )} ${baselineY.toFixed(2)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((tick) => ({
    y: paddingTop + (1 - tick) * chartHeight,
    label: `${Math.round(tick * 100)}%`,
  }));

  return {
    linePath,
    areaPath,
    markerX: last.x,
    markerY: last.y,
    yTicks,
  };
}

export default async function MarketDetailPage({
  params,
}: Readonly<{ params: Promise<{ marketId: string }> }>) {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <main className="market-detail-page">
        <section className="market-detail-shell market-detail-shell-warning" aria-label="Market detail configuration error">
          <p className="market-detail-kicker">Market</p>
          <h1 className="market-detail-title">Market Detail Unavailable</h1>
          <p className="market-detail-copy">Configure Supabase server environment values before loading market detail.</p>
          <p className="market-detail-copy">
            Missing env vars: <code>{missingEnv.join(", ")}</code>
          </p>
          <p className="market-detail-copy">
            Continue to <Link href="/markets">markets</Link>
          </p>
        </section>
      </main>
    );
  }

  const { marketId } = await params;

  const supabase = await createClient();
  const viewer = await getMarketViewerContext(supabase);
  const detail = await getMarketDetail({
    supabase,
    viewer,
    marketId,
  });

  if (detail.kind === "not_found") {
    notFound();
  }

  if (detail.kind === "schema_missing") {
    return (
      <main className="market-detail-page">
        <section className="market-detail-shell market-detail-shell-warning" aria-label="Market schema unavailable">
          <p className="market-detail-kicker">Market</p>
          <h1 className="market-detail-title">Market data provisioning required</h1>
          <p className="market-detail-copy">
            This environment does not have the market tables provisioned yet.
          </p>
          <p className="market-detail-copy">
            Detail: <code>{detail.message}</code>
          </p>
          <p className="market-detail-copy">
            Return to <Link href="/markets">market discovery</Link>
          </p>
        </section>
      </main>
    );
  }

  if (detail.kind === "error") {
    return (
      <main className="market-detail-page">
        <section className="market-detail-shell market-detail-shell-warning" aria-label="Market detail error">
          <p className="market-detail-kicker">Market</p>
          <h1 className="market-detail-title">Unable to load market</h1>
          <p className="market-detail-copy">
            Error detail: <code>{detail.message}</code>
          </p>
          <p className="market-detail-copy">
            Return to <Link href="/markets">market discovery</Link>
          </p>
        </section>
      </main>
    );
  }

  if (detail.kind === "login_required") {
    return (
      <main className="market-detail-page">
        <section className="market-detail-shell" aria-label="Login required for market">
          <p className="market-detail-kicker">Institution market</p>
          <h1 className="market-detail-title">Login required to view this market</h1>
          <p className="market-detail-copy">
            Institution-specific and restricted markets require an authenticated account before full detail is shown.
          </p>
          <div className="market-detail-login-links">
            <Link href="/login">Log in</Link>
            <Link href="/signup">Create account</Link>
            <Link href="/markets">Back to public markets</Link>
          </div>
        </section>
      </main>
    );
  }

  const market = detail.market;
  const chartGeometry = buildChartGeometry(market.chartPoints);
  const chartStartLabel = formatShortDate(market.chartPoints[0]?.timestamp ?? market.createdAt);
  const chartMidLabel = formatShortDate(
    market.chartPoints[Math.floor((market.chartPoints.length - 1) / 2)]?.timestamp ?? null
  );
  const chartEndLabel = formatShortDate(market.chartPoints[market.chartPoints.length - 1]?.timestamp ?? market.closeTime);
  const impliedNoPrice = formatPercent(market.priceNo, 1);
  const yesPrice = formatPercent(market.priceYes, 1);
  const sampleOrderUsd = 25;
  const sampleYesShares = market.priceYes > 0 ? sampleOrderUsd / market.priceYes : 0;
  const sampleNoShares = market.priceNo > 0 ? sampleOrderUsd / market.priceNo : 0;

  return (
    <main className="market-detail-page">
      <section className="market-detail-shell" aria-label="Market detail">
        <div className="market-detail-top-links">
          <Link href="/markets">← Back to markets</Link>
          <a href="/">Landing</a>
          {viewer.isAuthenticated ? <Link href="/create">Create market</Link> : <Link href="/signup">Create account</Link>}
        </div>

        <p className="market-detail-kicker">{market.accessBadge} market</p>
        <h1 className="market-detail-title">{market.question}</h1>
        <div className="market-detail-header-row">
          <p className="market-detail-copy">
            Status: <strong>{formatStatus(market.status)}</strong>
          </p>
          <p className="market-detail-copy market-detail-copy-muted">
            Closes {formatDate(market.closeTime)} • Fee {(market.feeBps / 100).toFixed(2)}%
          </p>
        </div>

        <section className="market-detail-top-layout" aria-label="Market stats and action panel">
          <article className="market-detail-strip-panel">
            <h2>Market strip</h2>
            <p className="market-detail-strip-label">Live implied odds</p>
            <p className="market-detail-stat market-detail-stat-yes">YES {yesPrice}</p>
            <p className="market-detail-stat market-detail-stat-no">NO {impliedNoPrice}</p>

            <div className="market-detail-strip-grid">
              <p>
                <span>Pool shares</span>
                <strong>{formatShares(market.poolShares)}</strong>
              </p>
              <p>
                <span>YES shares</span>
                <strong>{formatShares(market.yesShares)}</strong>
              </p>
              <p>
                <span>NO shares</span>
                <strong>{formatShares(market.noShares)}</strong>
              </p>
              <p>
                <span>Liquidity parameter</span>
                <strong>{formatShares(market.liquidityParameter)}</strong>
              </p>
            </div>
          </article>

          <article className="market-detail-chart-panel">
            <div className="market-detail-chart-header">
              <h2>Price + timeline</h2>
              <p>YES probability</p>
            </div>
            <div className="market-detail-chart-stage" aria-hidden="true">
              <svg
                className="market-detail-chart-svg"
                viewBox="0 0 640 272"
                role="img"
                aria-label={`YES probability currently ${yesPrice}`}
              >
                {chartGeometry.yTicks.map((tick) => (
                  <g key={tick.label}>
                    <line x1="24" y1={tick.y} x2="616" y2={tick.y} className="market-detail-chart-grid-line" />
                    <text x="10" y={tick.y + 4} className="market-detail-chart-grid-label">
                      {tick.label}
                    </text>
                  </g>
                ))}
                <path d={chartGeometry.areaPath} className="market-detail-chart-area" />
                <path d={chartGeometry.linePath} className="market-detail-chart-line" />
                <circle cx={chartGeometry.markerX} cy={chartGeometry.markerY} r="5" className="market-detail-chart-marker" />
              </svg>
            </div>
            <div className="market-detail-chart-axis">
              <span>{chartStartLabel}</span>
              <span>{chartMidLabel}</span>
              <span>{chartEndLabel}</span>
            </div>
            <p className="market-detail-chart-note">
              Trade execution APIs are now live. This panel currently tracks the latest AMM probability across market time
              bounds until full historical candle rendering is wired in.
            </p>
          </article>

          <aside className="market-detail-right-rail" aria-label="Action and position rail">
            <article className="market-detail-action-panel">
              <h2>Buy / sell module</h2>
              <div className="market-detail-order-tabs">
                <button type="button" disabled>
                  Buy YES
                </button>
                <button type="button" disabled>
                  Buy NO
                </button>
                <button type="button" disabled>
                  Sell YES
                </button>
                <button type="button" disabled>
                  Sell NO
                </button>
              </div>

              <div className="market-detail-order-grid">
                <p>
                  <span>Order size</span>
                  <strong>{formatCurrency(sampleOrderUsd)}</strong>
                </p>
                <p>
                  <span>Est. YES shares</span>
                  <strong>{formatShares(sampleYesShares)}</strong>
                </p>
                <p>
                  <span>Est. NO shares</span>
                  <strong>{formatShares(sampleNoShares)}</strong>
                </p>
                <p>
                  <span>Slippage + fees</span>
                  <strong>Live via quote API</strong>
                </p>
              </div>

              {market.actionRequired === "create_account" ? (
                <>
                  <p>Create an account to execute YES/NO orders.</p>
                  <div className="market-detail-action-links">
                    <Link href="/signup">Create account</Link>
                    <Link href="/login">Log in</Link>
                  </div>
                </>
              ) : (
                <>
                  <p>Your account is market-ready. Quote and execute APIs are now active for live trading calls.</p>
                  <button className="market-detail-action-button" type="button" disabled>
                    UI order entry rolls out next
                  </button>
                </>
              )}
            </article>

            <article className="market-detail-position-panel">
              <h2>Your position</h2>
              {market.actionRequired === "create_account" ? (
                <>
                  <p>Log in to view personal exposure, P&amp;L, and mark value.</p>
                  <div className="market-detail-action-links">
                    <Link href="/login">Log in</Link>
                    <Link href="/signup">Create account</Link>
                  </div>
                </>
              ) : market.viewerPosition ? (
                <div className="market-detail-position-grid">
                  <p>
                    <span>YES shares</span>
                    <strong>{formatShares(market.viewerPosition.yesShares)}</strong>
                  </p>
                  <p>
                    <span>NO shares</span>
                    <strong>{formatShares(market.viewerPosition.noShares)}</strong>
                  </p>
                  <p>
                    <span>Total shares</span>
                    <strong>{formatShares(market.viewerPosition.totalShares)}</strong>
                  </p>
                  <p>
                    <span>Mark value</span>
                    <strong>{formatCurrency(market.viewerPosition.markValue)}</strong>
                  </p>
                  <p>
                    <span>Avg YES entry</span>
                    <strong>
                      {market.viewerPosition.averageEntryPriceYes === null
                        ? "N/A"
                        : formatPercent(market.viewerPosition.averageEntryPriceYes, 2)}
                    </strong>
                  </p>
                  <p>
                    <span>Avg NO entry</span>
                    <strong>
                      {market.viewerPosition.averageEntryPriceNo === null
                        ? "N/A"
                        : formatPercent(market.viewerPosition.averageEntryPriceNo, 2)}
                    </strong>
                  </p>
                  <p className="market-detail-position-full">
                    <span>Realized P&amp;L</span>
                    <strong
                      className={
                        market.viewerPosition.realizedPnl > 0
                          ? "market-detail-positive"
                          : market.viewerPosition.realizedPnl < 0
                            ? "market-detail-negative"
                            : undefined
                      }
                    >
                      {formatSignedCurrency(market.viewerPosition.realizedPnl)}
                    </strong>
                  </p>
                </div>
              ) : (
                <p>No position in this market yet. Your first fill will appear here.</p>
              )}
            </article>
          </aside>
        </section>

        <section className="market-detail-section" aria-label="Market context">
          <h2>Market context</h2>
          <p>{market.description}</p>
          <div className="market-detail-meta-grid">
            <p>
              Created: <strong>{formatDate(market.createdAt)}</strong>
            </p>
            <p>
              Closes: <strong>{formatDate(market.closeTime)}</strong>
            </p>
            <p>
              Expected resolution: <strong>{formatDate(market.expectedResolutionTime)}</strong>
            </p>
            <p>
              Fee: <strong>{(market.feeBps / 100).toFixed(2)}%</strong>
            </p>
          </div>
          {market.tags.length > 0 ? <p>Tags: {market.tags.join(", ")}</p> : null}
          {market.riskFlags.length > 0 ? <p>Risk flags: {market.riskFlags.join(", ")}</p> : null}
        </section>

        <section className="market-detail-section" aria-label="Resolution details">
          <h2>Resolution details</h2>
          <p>
            <strong>Resolves YES if:</strong> {market.resolvesYesIf}
          </p>
          <p>
            <strong>Resolves NO if:</strong> {market.resolvesNoIf}
          </p>
          <p>
            <strong>Resolver authority:</strong> Platform admin final (v1)
          </p>
          {market.evidenceRules ? (
            <p>
              <strong>Evidence rules:</strong> {market.evidenceRules}
            </p>
          ) : null}
          {market.disputeRules ? (
            <p>
              <strong>Dispute rules:</strong> {market.disputeRules}
            </p>
          ) : null}
        </section>

        <section className="market-detail-section" aria-label="Market sources">
          <h2>Official and supporting sources</h2>
          {market.sources.length === 0 ? (
            <p>No sources were attached to this market.</p>
          ) : (
            <ul className="market-detail-source-list">
              {market.sources.map((source, index) => (
                <li key={`${source.url}-${index}`}>
                  <span>{source.type.toUpperCase()}</span>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
