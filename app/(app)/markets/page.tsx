import Link from "next/link";
import type { CSSProperties } from "react";

import { MARKET_CARD_SHADOW_COLORS, type MarketCardShadowTone } from "@/lib/markets/presentation";
import { DISCOVERABLE_MARKET_STATUSES } from "@/lib/markets/view-access";
import {
  MarketCardDTO,
  getMarketViewerContext,
  listDiscoveryMarketCards,
  parseMarketDiscoveryQuery,
  toUrlSearchParams,
} from "@/lib/markets/read-markets";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All status" },
  ...DISCOVERABLE_MARKET_STATUSES.map((status) => ({
    value: status,
    label: status.replace(/_/g, " "),
  })),
];

const ACCESS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All access" },
  { value: "public", label: "Public" },
  { value: "institution", label: "Institution" },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "closing_soon", label: "Closing soon" },
  { value: "newest", label: "Newest" },
  { value: "probability_high", label: "Highest yes" },
  { value: "probability_low", label: "Lowest yes" },
];

const QUICK_FILTERS: Array<{ label: string; query?: string }> = [
  { label: "All" },
  { label: "Politics", query: "politics" },
  { label: "Sports", query: "sports" },
  { label: "Crypto", query: "bitcoin" },
  { label: "Economy", query: "economy" },
  { label: "Local", query: "city" },
  { label: "Education", query: "school" },
  { label: "Weather", query: "weather" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatPool(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

function toneToColor(tone: MarketCardShadowTone): string {
  return MARKET_CARD_SHADOW_COLORS[tone];
}

function buildQuickFilterHref(params: URLSearchParams, query: string | undefined): string {
  const next = new URLSearchParams(params);
  if (!query) {
    next.delete("q");
  } else {
    next.set("q", query);
  }
  const qs = next.toString();
  return qs ? `/markets?${qs}` : "/markets";
}

function isQuickFilterActive(activeQuery: string, filterQuery: string | undefined): boolean {
  if (!filterQuery) return activeQuery.length === 0;
  return activeQuery.toLowerCase() === filterQuery.toLowerCase();
}

function shouldWarnAccess(market: MarketCardDTO): boolean {
  return market.accessRequiresLogin;
}

export default async function MarketsPage({
  searchParams,
}: Readonly<{ searchParams?: SearchParamsInput }>) {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <main className="markets-product-page">
        <section className="markets-product-alert" aria-label="Market discovery configuration error">
          <h1>Market discovery unavailable</h1>
          <p>
            Missing environment values: <code>{missingEnv.join(", ")}</code>
          </p>
          <p>
            Return to <Link href="/">landing</Link>
          </p>
        </section>
      </main>
    );
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const search = toUrlSearchParams(resolvedSearchParams);
  const query = parseMarketDiscoveryQuery(search);

  const supabase = await createClient();
  const viewer = await getMarketViewerContext(supabase);
  const result = await listDiscoveryMarketCards({
    supabase,
    viewer,
    query,
  });

  return (
    <main className="markets-product-page">
      <div className="markets-product-wrap">
        <header className="markets-product-header" aria-label="Markets toolbar">
          <div className="markets-brand-row">
            <p className="markets-product-kicker">Prediction markets</p>
            <div className="markets-brand-links">
              <Link href="/">Landing</Link>
              <Link href="/create">Create</Link>
              {viewer.isAuthenticated ? null : <Link href="/login">Log in</Link>}
              {viewer.isAuthenticated ? null : <Link href="/signup">Sign up</Link>}
            </div>
          </div>

          <form className="markets-toolbar" action="/markets" method="get">
            <label className="markets-search-field">
              <span className="sr-only">Search markets</span>
              <input type="search" name="q" defaultValue={query.search} placeholder="Search markets" />
            </label>

            <label className="markets-select-field">
              <span>Status</span>
              <select name="status" defaultValue={query.status}>
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="markets-select-field">
              <span>Access</span>
              <select name="access" defaultValue={query.access}>
                {ACCESS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="markets-select-field">
              <span>Sort</span>
              <select name="sort" defaultValue={query.sort}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="markets-toolbar-apply" type="submit">
              Apply
            </button>
          </form>

          <nav className="markets-quick-filters" aria-label="Quick filters">
            {QUICK_FILTERS.map((filter) => (
              <Link
                key={filter.label}
                href={buildQuickFilterHref(search, filter.query)}
                className={isQuickFilterActive(query.search, filter.query) ? "markets-quick-pill is-active" : "markets-quick-pill"}
              >
                {filter.label}
              </Link>
            ))}
          </nav>
        </header>

        {!viewer.isAuthenticated ? (
          <p className="markets-access-note">
            Guest mode: view public markets now. Institution-specific markets require login. Trading actions require an
            account.
          </p>
        ) : null}

        {result.schemaMissing ? (
          <p className="markets-empty-state">
            Market tables are not provisioned in this environment yet. Discovery UI is ready and will populate once data
            is available.
          </p>
        ) : null}

        {!result.schemaMissing && result.error ? (
          <p className="markets-error-state">
            Unable to load markets: <code>{result.error}</code>
          </p>
        ) : null}

        {!result.schemaMissing && !result.error && result.markets.length === 0 ? (
          <p className="markets-empty-state">No markets found for this filter set.</p>
        ) : null}

        {!result.schemaMissing && !result.error && result.markets.length > 0 ? (
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
                  <p className="market-tile-status">{formatStatus(market.status)}</p>
                </div>

                <h2 className="market-tile-question">
                  <Link href={`/markets/${market.id}`}>{market.question}</Link>
                </h2>

                <div className="market-tile-probability">
                  <p className="market-tile-prob-yes">YES {formatPercent(market.priceYes)}</p>
                  <p className="market-tile-prob-no">NO {formatPercent(market.priceNo)}</p>
                </div>

                <div className="market-tile-meta">
                  <p>Pool {formatPool(market.poolShares)}</p>
                  <p>Closes {formatDate(market.closeTime)}</p>
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
    </main>
  );
}
