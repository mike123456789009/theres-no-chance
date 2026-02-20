import Link from "next/link";
import type { CSSProperties } from "react";

import { PIXEL_AVATAR_OPTIONS, isPixelAvatarUrl } from "@/components/account/avatar-options";
import { TncLogo } from "@/components/branding/tnc-logo";
import { MarketsCategoryNav } from "@/components/markets/markets-category-nav";
import { MarketsFilterEnhancer } from "@/components/markets/markets-filter-enhancer";
import { StyleToggle } from "@/components/theme/style-toggle";
import { checkUserAdminAccess } from "@/lib/auth/admin";
import { MARKET_CARD_SHADOW_COLORS, type MarketCardShadowTone } from "@/lib/markets/presentation";
import { MARKET_PRIMARY_NAV_ITEMS } from "@/lib/markets/taxonomy";
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

type WalletAccountSummaryRow = {
  available_balance: number | string | null;
  reserved_balance: number | string | null;
} | null;

type ProfileSummaryRow = {
  display_name: string | null;
  avatar_url: string | null;
  ui_style: string | null;
} | null;

type ViewerAccountSummary = {
  portfolioUsd: number | null;
  cashUsd: number | null;
  avatarUrl: string;
  displayName: string;
  isAdmin: boolean;
};

const DEFAULT_AVATAR_URL = PIXEL_AVATAR_OPTIONS[0]?.url ?? "/assets/avatars/pixel-scout.svg";

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function getViewerAccountSummary(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  viewer: MarketViewerContext;
}): Promise<ViewerAccountSummary> {
  const { supabase, viewer } = options;

  if (!viewer.isAuthenticated || !viewer.userId) {
    return {
      portfolioUsd: null,
      cashUsd: null,
      avatarUrl: DEFAULT_AVATAR_URL,
      displayName: "Guest",
      isAdmin: false,
    };
  }

  try {
    const [walletResult, profileResult] = await Promise.all([
      supabase.from("wallet_accounts").select("available_balance, reserved_balance").eq("user_id", viewer.userId).maybeSingle(),
      supabase.from("profiles").select("display_name, avatar_url, ui_style").eq("id", viewer.userId).maybeSingle(),
    ]);

    let portfolioUsd: number | null = null;
    let cashUsd: number | null = null;
    let avatarUrl = DEFAULT_AVATAR_URL;
    let displayName = "Account";
    let isAdmin = false;

    if (!walletResult.error) {
      const wallet = walletResult.data as WalletAccountSummaryRow;
      cashUsd = Math.max(0, parseNumberish(wallet?.available_balance, 0));
      const reservedUsd = Math.max(0, parseNumberish(wallet?.reserved_balance, 0));
      portfolioUsd = cashUsd + reservedUsd;
    }

    if (!profileResult.error) {
      const profile = profileResult.data as ProfileSummaryRow;
      const avatarCandidate = clean(profile?.avatar_url);
      avatarUrl = isPixelAvatarUrl(avatarCandidate) ? avatarCandidate : DEFAULT_AVATAR_URL;
      displayName = clean(profile?.display_name) || "Account";
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      const adminAccess = await checkUserAdminAccess({
        userId: user.id,
        email: user.email,
      });
      isAdmin = adminAccess.isAdmin;
    }

    return {
      portfolioUsd,
      cashUsd,
      avatarUrl,
      displayName,
      isAdmin,
    };
  } catch {
    return {
      portfolioUsd: null,
      cashUsd: null,
      avatarUrl: DEFAULT_AVATAR_URL,
      displayName: "Account",
      isAdmin: false,
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
            Return to <a href="/">landing</a>
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
    activeOrganizationId: null,
    hasActiveInstitution: false,
  };
  let result: Awaited<ReturnType<typeof listDiscoveryMarketCards>> = {
    markets: [],
    error: null,
    schemaMissing: false,
  };
  let accountSummary: ViewerAccountSummary = {
    portfolioUsd: null,
    cashUsd: null,
    avatarUrl: DEFAULT_AVATAR_URL,
    displayName: "Guest",
    isAdmin: false,
  };
  let loadError: string | null = null;

  try {
    viewer = await getMarketViewerContext(supabase);
    accountSummary = await getViewerAccountSummary({ supabase, viewer });
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
            <a className="markets-brand-logo" href="/" aria-label="There&apos;s No Chance landing">
              <TncLogo size="compact" decorative />
            </a>

            <form className="markets-search-row" action="/markets" method="get">
              <label className="markets-search-field">
                <span className="sr-only">Search markets</span>
                <input type="search" name="q" defaultValue={query.search} placeholder="Search markets..." />
              </label>
              <input type="hidden" name="category" value={query.category} />
              <input type="hidden" name="status" value={query.status} />
              <input type="hidden" name="access" value={query.access} />
              <input type="hidden" name="sort" value={query.sort} />
              <button className="markets-search-submit" type="submit">
                Search
              </button>
            </form>

            <div className="markets-account-strip">
              <StyleToggle className="markets-style-toggle" />
              <p className="markets-account-metric">
                <span>Portfolio</span>
                <strong>
                  {accountSummary.portfolioUsd === null
                    ? viewer.isAuthenticated
                      ? "$0.00"
                      : "Guest"
                    : formatCurrency(accountSummary.portfolioUsd)}
                </strong>
              </p>
              <p className="markets-account-metric">
                <span>Cash</span>
                <strong>
                  {accountSummary.cashUsd === null
                    ? viewer.isAuthenticated
                      ? "$0.00"
                      : "--"
                    : formatCurrency(accountSummary.cashUsd)}
                </strong>
              </p>
              <Link className="markets-deposit-button" href={viewer.isAuthenticated ? "/account/wallet" : "/signup"}>
                Deposit
              </Link>
              {viewer.isAuthenticated ? (
                <details className="markets-account-avatar-menu">
                  <summary className="markets-account-avatar-trigger" aria-label="Open account menu">
                    <img src={accountSummary.avatarUrl} alt={`${accountSummary.displayName} profile avatar`} width={34} height={34} />
                  </summary>
                  <div className="markets-account-dropdown">
                    <Link href="/account/overview">Overview</Link>
                    <Link href="/account/portfolio">Portfolio</Link>
                    <Link href="/account/wallet">Wallet</Link>
                    <Link href="/account/settings">Settings</Link>
                    <Link href="/account/activity">Activity</Link>
                    {accountSummary.isAdmin ? <Link href="/account/admin/market-maker">Admin</Link> : null}
                  </div>
                </details>
              ) : (
                <>
                  <Link className="markets-account-link" href="/login">
                    Log in
                  </Link>
                  <Link className="markets-account-link" href="/signup">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>

          <MarketsCategoryNav items={MARKET_PRIMARY_NAV_ITEMS} />

          <div className="markets-toolbar-row">
            <MarketsFilterEnhancer />
            <form className="markets-toolbar" action="/markets" method="get">
              <input type="hidden" name="q" value={query.search} />
              <input type="hidden" name="category" value={query.category} />

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
              <Link href="/create">Create</Link>
              {!viewer.isAuthenticated ? <Link href="/login">Log in</Link> : null}
              {!viewer.isAuthenticated ? <Link href="/signup">Sign up</Link> : null}
            </div>
          </div>
        </div>
      </header>

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
                  <Link href={`/markets/${market.id}`} title={market.question}>
                    {market.question}
                  </Link>
                </h2>

                <div className="market-tile-probability">
                  <Link className="market-tile-prob-yes" href={`/markets/${market.id}`} aria-label={`Open ${market.question}`}>
                    YES {formatPercent(market.priceYes)}
                  </Link>
                  <Link className="market-tile-prob-no" href={`/markets/${market.id}`} aria-label={`Open ${market.question}`}>
                    NO {formatPercent(market.priceNo)}
                  </Link>
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
