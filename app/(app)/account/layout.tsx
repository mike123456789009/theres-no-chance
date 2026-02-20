import Link from "next/link";

import { AccountNav } from "@/components/account/account-nav";
import { TncLogo } from "@/components/branding/tnc-logo";
import { checkUserAdminAccess } from "@/lib/auth/admin";
import { createClient, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let canAccessAdmin = false;

  if (isSupabaseServerEnvConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const access = await checkUserAdminAccess({
          userId: user.id,
          email: user.email,
        });
        canAccessAdmin = access.isAdmin;
      }
    } catch {
      canAccessAdmin = false;
    }
  }

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
          <p>
            {canAccessAdmin
              ? "Switch between account and admin panes to manage profile, wallet, market operations, and moderation."
              : "Manage profile, wallet, portfolio, and activity from one place."}
          </p>
        </div>

        <AccountNav canAccessAdmin={canAccessAdmin} />

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
