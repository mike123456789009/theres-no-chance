import Link from "next/link";
import type { CSSProperties } from "react";

import type { DiscoveryMarketCardsResult } from "@/lib/markets/pages/discovery";
import type { MarketDiscoveryQuery, MarketViewerContext } from "@/lib/markets/read-markets";
import {
  formatDiscoveryDate,
  formatDiscoveryLifecycleLabel,
  formatPoolShares,
  formatProbabilityPercent,
  shouldWarnAccess,
  toneToColor,
} from "@/lib/markets/view-models/discovery";

type MarketsDiscoveryResultsSectionProps = {
  viewer: MarketViewerContext;
  result: DiscoveryMarketCardsResult;
  loadError: string | null;
  query: MarketDiscoveryQuery;
  viewerIsAdmin: boolean;
};

export function MarketsDiscoveryResultsSection(props: Readonly<MarketsDiscoveryResultsSectionProps>) {
  const { viewer, result, loadError, query, viewerIsAdmin } = props;
  const showOpenEmptyState = query.status === "open";

  return (
    <div className="markets-product-wrap">
      {!viewer.isAuthenticated ? (
        <p className="markets-access-note">
          Guest mode: view public markets now. Institution-specific markets are hidden until you log in.
        </p>
      ) : null}

      {viewer.isAuthenticated && !viewer.hasActiveInstitution ? (
        <p className="markets-access-note">
          Logged in without institution access: institution cards are visible, but full detail and trading require a
          verified .edu institution email in account settings.
        </p>
      ) : null}

      {loadError ? (
        <p className="markets-error-state">
          Unable to load markets right now. Retry in a moment. <code>{loadError}</code>
        </p>
      ) : null}

      {!loadError && result.schemaMissing ? (
        <p className="markets-empty-state">
          Market tables are not provisioned in this environment yet. Discovery UI is ready and will populate once data
          is available.
        </p>
      ) : null}

      {!loadError && !result.schemaMissing && result.error ? (
        <p className="markets-error-state">
          Unable to load markets: <code>{result.error}</code>
        </p>
      ) : null}

      {!loadError && !result.schemaMissing && !result.error && result.markets.length === 0 ? (
        <section className="markets-empty-state markets-empty-state-panel" aria-label="No matching markets">
          <h2>{showOpenEmptyState ? "No open markets right now" : "No markets found for this filter set"}</h2>
          <p>
            Markets are generated through the market maker pipeline and may be retired automatically if nobody trades
            or resolves them before close.
          </p>
          <div className="markets-empty-actions">
            <Link href="/markets?status=finalized&access=all&sort=volume">Browse finalized markets</Link>
            {viewer.isAuthenticated ? <Link href="/create">Create a market</Link> : <Link href="/login">Log in to submit a proposal</Link>}
            <Link href="/markets">Check back after the next market scan</Link>
            {viewerIsAdmin ? <Link href="/account/admin/market-maker">Open market maker</Link> : null}
          </div>
        </section>
      ) : null}

      {!loadError && !result.schemaMissing && !result.error && result.markets.length > 0 ? (
        <section className="markets-card-grid" role="list" aria-label="Markets grid">
          {result.markets.map((market) => (
            <article
              key={market.id}
              role="listitem"
              className={shouldWarnAccess(market) ? "market-tile market-tile-restricted" : "market-tile"}
              style={
                {
                  "--market-tile-shadow": toneToColor(market.cardShadowTone),
                } as CSSProperties
              }
            >
              <div className="market-tile-head">
                <p className="market-tile-access">{market.accessBadge}</p>
                <p className="market-tile-status">{formatDiscoveryLifecycleLabel(market)}</p>
              </div>

              <h2 className="market-tile-question">
                <Link href={`/markets/${market.id}`} title={market.question}>
                  {market.question}
                </Link>
              </h2>

              <div className="market-tile-probability">
                <Link className="market-tile-prob-yes" href={`/markets/${market.id}`} aria-label={`Open ${market.question}`}>
                  YES {formatProbabilityPercent(market.priceYes)}
                </Link>
                <Link className="market-tile-prob-no" href={`/markets/${market.id}`} aria-label={`Open ${market.question}`}>
                  NO {formatProbabilityPercent(market.priceNo)}
                </Link>
              </div>

              <div className="market-tile-meta">
                <p>Pool {formatPoolShares(market.poolShares)}</p>
                <p>Closes {formatDiscoveryDate(market.closeTime)}</p>
              </div>

              {market.tags.length > 0 ? <p className="market-tile-tags">{market.tags.slice(0, 4).join(" · ")}</p> : null}

              <div className="market-tile-foot">
                <p>
                  {market.actionRequired === "create_account"
                    ? "Create account to take action"
                    : "Account ready for trading actions"}
                </p>
                <Link className="market-tile-open" href={`/markets/${market.id}`}>
                  Open
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
