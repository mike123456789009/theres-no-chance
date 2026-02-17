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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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

  return (
    <main className="market-detail-page">
      <section className="market-detail-shell" aria-label="Market detail">
        <div className="market-detail-top-links">
          <Link href="/markets">← Back to markets</Link>
          <Link href="/">Landing</Link>
          {viewer.isAuthenticated ? <Link href="/create">Create market</Link> : <Link href="/signup">Create account</Link>}
        </div>

        <p className="market-detail-kicker">{market.accessBadge} market</p>
        <h1 className="market-detail-title">{market.question}</h1>
        <p className="market-detail-copy">Status: {formatStatus(market.status)}</p>

        <section className="market-detail-hero" aria-label="Market stats and action panel">
          <article className="market-detail-stat-panel">
            <h2>Probability strip</h2>
            <p className="market-detail-stat market-detail-stat-yes">YES {formatPercent(market.priceYes)}</p>
            <p className="market-detail-stat market-detail-stat-no">NO {formatPercent(market.priceNo)}</p>
            <p>Pool shares: {(market.yesShares + market.noShares).toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
          </article>

          <article className="market-detail-chart-panel">
            <h2>Chart panel</h2>
            <div className="market-detail-chart-placeholder" aria-hidden="true" />
            <p>
              Price/volume chart shell is active. This view currently renders the latest AMM snapshot and will plot time
              history with trade execution rollout.
            </p>
          </article>

          <article className="market-detail-action-panel">
            <h2>Take action</h2>
            {market.actionRequired === "create_account" ? (
              <>
                <p>Create an account to buy/sell YES or NO positions.</p>
                <div className="market-detail-action-links">
                  <Link href="/signup">Create account</Link>
                  <Link href="/login">Log in</Link>
                </div>
              </>
            ) : (
              <>
                <p>Your account is ready for action flows. Trading execution goes live with AMM execute endpoints.</p>
                <button className="market-detail-action-button" type="button" disabled>
                  Trading unlocks in Step 11
                </button>
              </>
            )}
          </article>
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
