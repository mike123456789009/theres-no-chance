import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketDetailMainSection } from "@/components/markets/page-sections";
import { loadDetailPageData } from "@/lib/markets/pages/detail";

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({
  params,
}: Readonly<{ params: Promise<{ marketId: string }> }>) {
  const { marketId } = await params;
  const pageData = await loadDetailPageData({ marketId });

  if (pageData.kind === "env_missing") {
    return (
      <main className="market-detail-page">
        <section className="market-detail-shell market-detail-shell-warning" aria-label="Market detail configuration error">
          <p className="market-detail-kicker">Market</p>
          <h1 className="market-detail-title">Market Detail Unavailable</h1>
          <p className="market-detail-copy">Configure Supabase server environment values before loading market detail.</p>
          <p className="market-detail-copy">
            Missing env vars: <code>{pageData.missingEnv.join(", ")}</code>
          </p>
          <p className="market-detail-copy">
            Continue to <Link href="/markets">markets</Link>
          </p>
        </section>
      </main>
    );
  }

  if (pageData.kind === "not_found") {
    notFound();
  }

  if (pageData.kind === "schema_missing") {
    return (
      <main className="market-detail-page">
        <section className="market-detail-shell market-detail-shell-warning" aria-label="Market schema unavailable">
          <p className="market-detail-kicker">Market</p>
          <h1 className="market-detail-title">Market data provisioning required</h1>
          <p className="market-detail-copy">This environment does not have the market tables provisioned yet.</p>
          <p className="market-detail-copy">
            Detail: <code>{pageData.message}</code>
          </p>
          <p className="market-detail-copy">
            Return to <Link href="/markets">market discovery</Link>
          </p>
        </section>
      </main>
    );
  }

  if (pageData.kind === "error") {
    return (
      <main className="market-detail-page">
        <section className="market-detail-shell market-detail-shell-warning" aria-label="Market detail error">
          <p className="market-detail-kicker">Market</p>
          <h1 className="market-detail-title">Unable to load market</h1>
          <p className="market-detail-copy">
            Error detail: <code>{pageData.message}</code>
          </p>
          <p className="market-detail-copy">
            Return to <Link href="/markets">market discovery</Link>
          </p>
        </section>
      </main>
    );
  }

  if (pageData.kind === "login_required") {
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

  if (pageData.kind === "institution_verification_required") {
    return (
      <main className="market-detail-page">
        <section className="market-detail-shell" aria-label="Institution verification required">
          <p className="market-detail-kicker">Institution market</p>
          <h1 className="market-detail-title">Institution verification required</h1>
          <p className="market-detail-copy">
            Verify a .edu institution email in account settings to access institution market details and trading.
          </p>
          <div className="market-detail-login-links">
            <Link href="/account/settings">Open settings</Link>
            <Link href="/markets">Back to markets</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="market-detail-page">
      <MarketDetailMainSection marketId={pageData.marketId} market={pageData.market} viewer={pageData.viewer} />
    </main>
  );
}
