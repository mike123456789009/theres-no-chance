import Link from "next/link";
import type { CSSProperties } from "react";

import { MARKET_CARD_SHADOW_COLORS, type MarketCardShadowTone } from "@/lib/markets/presentation";
import { DISCOVERABLE_MARKET_STATUSES } from "@/lib/markets/view-access";
import {
  MarketCardDTO,
  type MarketViewerContext,
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
  { label: "Breaking", query: "breaking" },
  { label: "New", query: "new" },
  { label: "Politics", query: "politics" },
  { label: "Sports", query: "sports" },
  { label: "Crypto", query: "bitcoin" },
  { label: "Finance", query: "finance" },
  { label: "Economy", query: "economy" },
  { label: "World", query: "world" },
  { label: "Local", query: "city" },
  { label: "Education", query: "school" },
  { label: "Weather", query: "weather" },
];

const PRIMARY_NAV_ITEMS: Array<{ label: string; query?: string }> = [
  { label: "Trending" },
  { label: "Breaking", query: "breaking" },
  { label: "New", query: "new" },
  { label: "Politics", query: "politics" },
  { label: "Sports", query: "sports" },
  { label: "Crypto", query: "bitcoin" },
  { label: "Finance", query: "finance" },
  { label: "Geopolitics", query: "geopolitics" },
  { label: "Tech", query: "tech" },
  { label: "Culture", query: "culture" },
  { label: "World", query: "world" },
  { label: "Economy", query: "economy" },
  { label: "Climate & Science", query: "climate" },
];

type WalletAccountSummaryRow = {
  available_balance: number | string | null;
  reserved_balance: number | string | null;
} | null;

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
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

function parseNumberish(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function getViewerWalletSummary(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  viewer: MarketViewerContext;
}): Promise<{ portfolioUsd: number | null; cashUsd: number | null }> {
  const { supabase, viewer } = options;

  if (!viewer.isAuthenticated || !viewer.userId) {
    return {
      portfolioUsd: null,
      cashUsd: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from("wallet_accounts")
      .select("available_balance, reserved_balance")
      .eq("user_id", viewer.userId)
      .maybeSingle();

    if (error) {
      return {
        portfolioUsd: null,
        cashUsd: null,
      };
    }

    const wallet = data as WalletAccountSummaryRow;
    const cashUsd = Math.max(0, parseNumberish(wallet?.available_balance, 0));
    const reservedUsd = Math.max(0, parseNumberish(wallet?.reserved_balance, 0));

    return {
      portfolioUsd: cashUsd + reservedUsd,
      cashUsd,
    };
  } catch {
    return {
      portfolioUsd: null,
      cashUsd: null,
    };
  }
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
  let viewer: MarketViewerContext = {
    userId: null,
    isAuthenticated: false,
  };
  let result: Awaited<ReturnType<typeof listDiscoveryMarketCards>> = {
    markets: [],
    error: null,
    schemaMissing: false,
  };
  let walletSummary: { portfolioUsd: number | null; cashUsd: number | null } = {
    portfolioUsd: null,
    cashUsd: null,
  };
  let loadError: string | null = null;

  try {
    viewer = await getMarketViewerContext(supabase);
    walletSummary = await getViewerWalletSummary({ supabase, viewer });
    result = await listDiscoveryMarketCards({
      supabase,
      viewer,
      query,
    });
  } catch (caught) {
    loadError = caught instanceof Error ? caught.message : "Unknown discovery load error.";
  }

  return (
    <main className="markets-product-page">
      <header className="markets-product-header" aria-label="Markets navigation">
        <div className="markets-header-inner">
          <div className="markets-brand-row">
            <Link className="markets-brand-logo" href="/" aria-label="There&apos;s No Chance landing">
              <span className="logo-letter red">T</span>
              <span className="logo-letter gold">N</span>
              <span className="logo-letter red">C</span>
            </Link>

            <form className="markets-search-row" action="/markets" method="get">
              <label className="markets-search-field">
                <span className="sr-only">Search markets</span>
                <input type="search" name="q" defaultValue={query.search} placeholder="Search markets..." />
              </label>
              <input type="hidden" name="status" value={query.status} />
              <input type="hidden" name="access" value={query.access} />
              <input type="hidden" name="sort" value={query.sort} />
              <button className="markets-search-submit" type="submit">
                Search
              </button>
            </form>

            <div className="markets-account-strip">
              <p className="markets-account-metric">
                <span>Portfolio</span>
                <strong>
                  {walletSummary.portfolioUsd === null
                    ? viewer.isAuthenticated
                      ? "$0.00"
                      : "Guest"
                    : formatCurrency(walletSummary.portfolioUsd)}
                </strong>
              </p>
              <p className="markets-account-metric">
                <span>Cash</span>
                <strong>
                  {walletSummary.cashUsd === null
                    ? viewer.isAuthenticated
                      ? "$0.00"
                      : "--"
                    : formatCurrency(walletSummary.cashUsd)}
                </strong>
              </p>
              <Link className="markets-deposit-button" href={viewer.isAuthenticated ? "/wallet" : "/signup"}>
                Deposit
              </Link>
              <Link className="markets-account-link" href={viewer.isAuthenticated ? "/portfolio" : "/login"}>
                {viewer.isAuthenticated ? "Portfolio" : "Log in"}
              </Link>
              <Link className="markets-account-link" href={viewer.isAuthenticated ? "/wallet" : "/signup"}>
                {viewer.isAuthenticated ? "Wallet" : "Sign up"}
              </Link>
            </div>
          </div>

          <nav className="markets-primary-nav" aria-label="Market categories">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={buildQuickFilterHref(search, item.query)}
                className={isQuickFilterActive(query.search, item.query) ? "markets-primary-link is-active" : "markets-primary-link"}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="markets-toolbar-row">
            <form className="markets-toolbar" action="/markets" method="get">
              <input type="hidden" name="q" value={query.search} />

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

            <div className="markets-inline-links">
              <Link href="/">Landing</Link>
              <Link href="/create">Create</Link>
              {!viewer.isAuthenticated ? <Link href="/login">Log in</Link> : null}
              {!viewer.isAuthenticated ? <Link href="/signup">Sign up</Link> : null}
            </div>
          </div>

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
        </div>
      </header>

      <div className="markets-product-wrap">
        {!viewer.isAuthenticated ? (
          <p className="markets-access-note">
            Guest mode: view public markets now. Institution-specific markets require login. Trading actions require an
            account.
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
          <p className="markets-empty-state">No markets found for this filter set.</p>
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
