import Link from "next/link";

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

function formatDate(value: string): string {
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

function formatNumber(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All discoverable" },
  ...DISCOVERABLE_MARKET_STATUSES.map((status) => ({
    value: status,
    label: formatStatus(status),
  })),
];

const ACCESS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All access types" },
  { value: "public", label: "Public only" },
  { value: "institution", label: "Institution/login-gated" },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "closing_soon", label: "Closing soon" },
  { value: "newest", label: "Newest" },
  { value: "probability_high", label: "Highest Yes probability" },
  { value: "probability_low", label: "Lowest Yes probability" },
];

function isAccessBadgeWarning(market: MarketCardDTO): boolean {
  return market.accessRequiresLogin || market.accessBadge !== "Public";
}

export default async function MarketsPage({
  searchParams,
}: Readonly<{ searchParams?: SearchParamsInput }>) {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <main className="markets-page">
        <section className="markets-shell markets-shell-warning" aria-label="Market discovery configuration error">
          <p className="markets-kicker">Markets</p>
          <h1 className="markets-title">Market Discovery Unavailable</h1>
          <p className="markets-copy">Configure Supabase server environment values before using market discovery.</p>
          <p className="markets-copy">
            Missing env vars: <code>{missingEnv.join(", ")}</code>
          </p>
          <p className="markets-copy">
            Continue to <Link href="/">home</Link>
          </p>
        </section>
      </main>
    );
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const query = parseMarketDiscoveryQuery(toUrlSearchParams(resolvedSearchParams));

  const supabase = await createClient();
  const viewer = await getMarketViewerContext(supabase);
  const result = await listDiscoveryMarketCards({
    supabase,
    viewer,
    query,
  });

  const statusValue = STATUS_FILTER_OPTIONS.some((option) => option.value === query.status) ? query.status : "all";
  const accessValue = ACCESS_FILTER_OPTIONS.some((option) => option.value === query.access) ? query.access : "all";
  const sortValue = SORT_OPTIONS.some((option) => option.value === query.sort) ? query.sort : "closing_soon";

  return (
    <main className="markets-page">
      <section className="markets-shell" aria-label="Market discovery">
        <p className="markets-kicker">Markets</p>
        <h1 className="markets-title">Discover active and upcoming prediction markets</h1>
        <p className="markets-copy">
          Public markets are viewable without login. Institution-gated markets require login. Any trading action requires
          an account.
        </p>

        <div className="markets-top-links">
          <Link href="/">Landing</Link>
          {viewer.isAuthenticated ? <Link href="/create">Create market</Link> : <Link href="/signup">Create account</Link>}
          {!viewer.isAuthenticated ? <Link href="/login">Log in</Link> : null}
        </div>

        {!viewer.isAuthenticated ? (
          <p className="markets-guest-note">
            Guest mode: you can browse public markets now. Log in or sign up to view institution-specific markets and
            place trades when action endpoints are enabled.
          </p>
        ) : null}

        <form className="markets-filter-form" action="/markets" method="get">
          <label className="markets-filter-field">
            <span>Search</span>
            <input type="search" name="q" defaultValue={query.search} placeholder="Search by question" />
          </label>

          <label className="markets-filter-field">
            <span>Status</span>
            <select name="status" defaultValue={statusValue}>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="markets-filter-field">
            <span>Access</span>
            <select name="access" defaultValue={accessValue}>
              {ACCESS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="markets-filter-field">
            <span>Sort</span>
            <select name="sort" defaultValue={sortValue}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button className="markets-filter-submit" type="submit">
            Apply filters
          </button>
        </form>

        {result.error ? (
          <p className="markets-error">
            Unable to load markets: <code>{result.error}</code>
          </p>
        ) : null}

        {!result.error && result.markets.length === 0 ? (
          <p className="markets-empty">No markets matched this filter set. Try broadening status or access filters.</p>
        ) : null}

        {!result.error && result.markets.length > 0 ? (
          <div className="markets-grid" role="list" aria-label="Market results">
            {result.markets.map((market) => (
              <article key={market.id} className="market-card" role="listitem">
                <div className="market-card-head">
                  <p className={isAccessBadgeWarning(market) ? "market-card-badge market-card-badge-warn" : "market-card-badge"}>
                    {market.accessBadge}
                  </p>
                  <p className="market-card-status">{formatStatus(market.status)}</p>
                </div>

                <h2 className="market-card-question">
                  <Link href={`/markets/${market.id}`}>{market.question}</Link>
                </h2>

                <div className="market-card-metrics">
                  <p>
                    YES: <strong>{formatPercent(market.priceYes)}</strong>
                  </p>
                  <p>
                    NO: <strong>{formatPercent(market.priceNo)}</strong>
                  </p>
                  <p>
                    Pool shares: <strong>{formatNumber(market.poolShares)}</strong>
                  </p>
                  <p>
                    Closes: <strong>{formatDate(market.closeTime)}</strong>
                  </p>
                </div>

                {market.tags.length > 0 ? <p className="market-card-tags">Tags: {market.tags.join(", ")}</p> : null}

                <p className="market-card-action-note">
                  {market.actionRequired === "create_account"
                    ? "Create an account to take action on this market."
                    : "Account ready: action endpoints are unlocked in the trading engine step."}
                </p>

                <Link className="market-card-link" href={`/markets/${market.id}`}>
                  View market detail
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
