import Link from "next/link";

import { TncLogo } from "@/components/branding/tnc-logo";
import { MarketsCategoryNav } from "@/components/markets/markets-category-nav";
import { MarketsFilterEnhancer } from "@/components/markets/markets-filter-enhancer";
import { StyleToggle } from "@/components/theme/style-toggle";
import type { MarketDiscoveryQuery, MarketViewerContext } from "@/lib/markets/read-markets";
import { MARKET_PRIMARY_NAV_ITEMS } from "@/lib/markets/taxonomy";
import {
  ACCESS_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
  formatCurrency,
  type ViewerAccountSummary,
} from "@/lib/markets/view-models/discovery";

type MarketsDiscoveryHeaderSectionProps = {
  query: MarketDiscoveryQuery;
  viewer: MarketViewerContext;
  accountSummary: ViewerAccountSummary;
};

type MarketsSearchFormProps = {
  className: string;
  query: MarketDiscoveryQuery;
};

function MarketsSearchForm(props: Readonly<MarketsSearchFormProps>) {
  const { className, query } = props;

  return (
    <form className={className} action="/markets" method="get">
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
  );
}

export function MarketsDiscoveryHeaderSection(props: Readonly<MarketsDiscoveryHeaderSectionProps>) {
  const { query, viewer, accountSummary } = props;

  return (
    <header className="markets-product-header" aria-label="Markets navigation">
      <div className="markets-header-inner">
        <div className="markets-brand-row">
          <a className="markets-brand-logo" href="/" aria-label="There&apos;s No Chance landing">
            <TncLogo size="compact" decorative />
          </a>

          <MarketsSearchForm className="markets-search-row markets-search-row-desktop" query={query} />

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

        <div className="markets-mobile-collapsible">
          <input
            className="markets-mobile-collapsible-input"
            id="markets-mobile-collapsible-toggle"
            type="checkbox"
            aria-label="Toggle market browse and filter controls"
          />
          <label className="markets-mobile-collapsible-summary" htmlFor="markets-mobile-collapsible-toggle">
            Search + browse + filter controls
          </label>

          <div className="markets-mobile-collapsible-body">
            <MarketsSearchForm className="markets-search-row markets-search-row-mobile" query={query} />

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
        </div>
      </div>
    </header>
  );
}
