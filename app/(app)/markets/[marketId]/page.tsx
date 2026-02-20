import Link from "next/link";
import { notFound } from "next/navigation";

import { getMarketDetail, getMarketViewerContext } from "@/lib/markets/read-markets";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import { MarketLiveOverview } from "@/components/markets/market-live-overview";
import { TradeInterface } from "@/components/markets/trade-interface";

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

function looksLikeLowInformationScheduleMarket(input: {
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  riskFlags: string[];
}): boolean {
  const question = input.question.toLowerCase();
  const description = input.description.toLowerCase();
  const resolvesYesIf = input.resolvesYesIf.toLowerCase();
  const resolvesNoIf = input.resolvesNoIf.toLowerCase();
  const riskFlags = input.riskFlags.join(" ").toLowerCase();

  const scheduleSignal = /(officially\s+)?(begin|start|commence|open(?:ing)?|take place|be held)/.test(question);
  const deadlineSignal =
    /(on or before|by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|\d{1,2}[,\s]+\d{4}|\d{4}))/i.test(
      question
    ) || /\b(on or before|by)\b/.test(resolvesYesIf);
  const noSideDelayCancelSignal =
    /(after|postpon|delay|cancel|does not|do not|fails to|did not)/.test(resolvesNoIf) &&
    /(start|begin|occur|happen|take place|commence|open)/.test(resolvesNoIf);
  const tailRiskSignal = /(tail[\s-]?risk|postpon|delay|cancel|weather|disrupt|force[\s-]?majeure)/.test(
    `${description} ${resolvesNoIf} ${riskFlags}`
  );

  return scheduleSignal && deadlineSignal && noSideDelayCancelSignal && tailRiskSignal;
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
  const isLowInformationMarket = looksLikeLowInformationScheduleMarket({
    question: market.question,
    description: market.description,
    resolvesYesIf: market.resolvesYesIf,
    resolvesNoIf: market.resolvesNoIf,
    riskFlags: market.riskFlags,
  });

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
        {isLowInformationMarket ? (
          <p className="market-detail-quality-warning">
            Low-information market warning: this market mainly prices postponement/cancellation tail-risk rather than
            broad two-sided uncertainty.
          </p>
        ) : null}

        <section className="market-detail-top-layout" aria-label="Market stats and action panel">
          <MarketLiveOverview
            marketId={marketId}
            initialMarket={{
              chartPoints: market.chartPoints,
              priceYes: market.priceYes,
              priceNo: market.priceNo,
              poolShares: market.poolShares,
              yesShares: market.yesShares,
              noShares: market.noShares,
              liquidityParameter: market.liquidityParameter,
            }}
          />

          <aside className="market-detail-right-rail" aria-label="Action and position rail">
            <TradeInterface
              marketId={marketId}
              marketStatus={market.status}
              currentPriceYes={market.priceYes}
              currentPriceNo={market.priceNo}
              viewerUserId={viewer.userId ?? undefined}
              isAuthenticated={viewer.isAuthenticated}
            />

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

        <div className="market-detail-bottom-grid">
          <section className="market-detail-section market-detail-section-context" aria-label="Market context">
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
        </div>
      </section>
    </main>
  );
}
