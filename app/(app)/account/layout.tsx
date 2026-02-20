import Link from "next/link";

import { AccountNav } from "@/components/account/account-nav";
import { TncLogo } from "@/components/branding/tnc-logo";

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="account-shell">
      <aside className="account-pane" aria-label="Account navigation">
        {/* Hard navigation ensures the landing module script always re-initializes correctly. */}
        <a className="account-logo" href="/" aria-label="There&apos;s No Chance landing">
          <TncLogo decorative />
        </a>

        <div className="account-pane-copy">
          <p className="create-kicker">Account</p>
          <h1>Control Center</h1>
          <p>Manage your profile, portfolio, wallet, and account activity from one place.</p>
        </div>

        <AccountNav />

        <div className="account-pane-footer">
          <Link className="create-submit create-submit-muted" href="/markets">
            Browse markets
          </Link>
        </div>
      </aside>

      <section className="account-content">{children}</section>
    </div>
  );
}
