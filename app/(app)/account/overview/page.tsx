import Link from "next/link";

import { AccountLoginRequiredPanel, AccountUnavailablePanel } from "@/components/account/account-state-panels";
import { PIXEL_AVATAR_OPTIONS, isPixelAvatarUrl } from "@/components/account/avatar-options";
import { displayNameFallback, formatCurrency, toNumber } from "@/lib/account/formatters";
import { loadAccountPageContext } from "@/lib/account/page-context";
import { cleanText } from "@/lib/shared/primitives";

export const dynamic = "force-dynamic";

type ProfileRow = {
  display_name: string | null;
  avatar_url: string | null;
  ui_style: string | null;
} | null;

type WalletRow = {
  available_balance: number | string | null;
  reserved_balance: number | string | null;
} | null;

export default async function AccountOverviewPage() {
  const context = await loadAccountPageContext();
  if (!context.ok && context.reason === "env") {
    return (
      <AccountUnavailablePanel
        kicker="Account"
        title="Account Unavailable"
        copy="Configure Supabase server environment values before loading account details."
        missingEnv={context.missingEnv}
        ariaLabel="Account configuration error"
      />
    );
  }

  if (!context.ok) {
    return (
      <AccountLoginRequiredPanel
        kicker="Account"
        title="Log in to open account center"
        copy="Manage wallet, holdings, and profile settings from a single view after authentication."
        ariaLabel="Account login required"
      />
    );
  }

  const { supabase, user } = context;
  const [walletResult, profileResult] = await Promise.all([
    supabase.from("wallet_accounts").select("available_balance, reserved_balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("display_name, avatar_url, ui_style").eq("id", user.id).maybeSingle(),
  ]);

  const wallet = (walletResult.data ?? null) as WalletRow;
  const profile = (profileResult.data ?? null) as ProfileRow;

  const cashUsd = Math.max(0, toNumber(wallet?.available_balance, 0));
  const reservedUsd = Math.max(0, toNumber(wallet?.reserved_balance, 0));
  const totalUsd = cashUsd + reservedUsd;

  const metadataDisplayName = cleanText((user.user_metadata as Record<string, unknown> | undefined)?.display_name);
  const metadataFullName = cleanText((user.user_metadata as Record<string, unknown> | undefined)?.full_name);
  const displayName = cleanText(profile?.display_name) || metadataDisplayName || metadataFullName || displayNameFallback(user.email);

  const avatarCandidate = cleanText(profile?.avatar_url) || cleanText((user.user_metadata as Record<string, unknown> | undefined)?.avatar_url);
  const avatarUrl = isPixelAvatarUrl(avatarCandidate) ? avatarCandidate : PIXEL_AVATAR_OPTIONS[0].url;

  return (
    <section className="account-panel" aria-label="Account overview">
      <p className="create-kicker">Account overview</p>
      <h1 className="create-title">Welcome back, {displayName}</h1>
      <p className="create-copy">Use the left pane to jump between account tools. Your balances and profile are synced in real time.</p>

      <section className="create-section account-overview-grid" aria-label="Account quick stats">
        <article className="account-overview-profile-card">
          <img src={avatarUrl} alt="Selected profile avatar" width={72} height={72} />
          <div>
            <p className="create-note">Display name</p>
            <h2>{displayName}</h2>
            <p className="create-note">Email: {user.email ?? "Unknown"}</p>
          </div>
        </article>

        <article>
          <p className="create-note">Available cash</p>
          <h2>{formatCurrency(cashUsd)}</h2>
          <p className="create-note">Ready to trade</p>
        </article>

        <article>
          <p className="create-note">Reserved cash</p>
          <h2>{formatCurrency(reservedUsd)}</h2>
          <p className="create-note">Locked in open positions</p>
        </article>

        <article>
          <p className="create-note">Total wallet</p>
          <h2>{formatCurrency(totalUsd)}</h2>
          <p className="create-note">Available + reserved</p>
        </article>
      </section>

      <section className="create-section" aria-label="Account quick actions">
        <h2>Quick actions</h2>
        <div className="create-actions">
          <Link className="create-submit" href="/account/portfolio">
            Open portfolio
          </Link>
          <Link className="create-submit create-submit-muted" href="/account/wallet">
            Open wallet
          </Link>
          <Link className="create-submit create-submit-muted" href="/account/settings">
            Edit profile
          </Link>
          <Link className="create-submit create-submit-muted" href="/account/activity">
            View activity
          </Link>
        </div>
      </section>
    </section>
  );
}
