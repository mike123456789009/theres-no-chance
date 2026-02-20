import Link from "next/link";

import { PIXEL_AVATAR_OPTIONS, isPixelAvatarUrl } from "@/components/account/avatar-options";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function displayNameFallback(email: string | null | undefined): string {
  const normalized = clean(email);
  if (!normalized.includes("@")) return "Trader";
  const [name] = normalized.split("@");
  return clean(name) || "Trader";
}

export default async function AccountOverviewPage() {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <section className="account-panel account-panel-warning" aria-label="Account configuration error">
        <p className="create-kicker">Account</p>
        <h1 className="create-title">Account Unavailable</h1>
        <p className="create-copy">Configure Supabase server environment values before loading account details.</p>
        <p className="create-copy">
          Missing env vars: <code>{missingEnv.join(", ")}</code>
        </p>
      </section>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return (
      <section className="account-panel" aria-label="Account login required">
        <p className="create-kicker">Account</p>
        <h1 className="create-title">Log in to open account center</h1>
        <p className="create-copy">Manage wallet, holdings, and profile settings from a single view after authentication.</p>
        <div className="create-actions account-actions-top">
          <Link className="create-submit create-submit-muted" href="/login">
            Log in
          </Link>
          <Link className="create-submit" href="/signup">
            Create account
          </Link>
          <Link className="create-submit create-submit-muted" href="/markets">
            Back to markets
          </Link>
        </div>
      </section>
    );
  }

  const [walletResult, profileResult] = await Promise.all([
    supabase.from("wallet_accounts").select("available_balance, reserved_balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("display_name, avatar_url, ui_style").eq("id", user.id).maybeSingle(),
  ]);

  const wallet = (walletResult.data ?? null) as WalletRow;
  const profile = (profileResult.data ?? null) as ProfileRow;

  const cashUsd = Math.max(0, toNumber(wallet?.available_balance, 0));
  const reservedUsd = Math.max(0, toNumber(wallet?.reserved_balance, 0));
  const totalUsd = cashUsd + reservedUsd;

  const metadataDisplayName = clean((user.user_metadata as Record<string, unknown> | undefined)?.display_name);
  const metadataFullName = clean((user.user_metadata as Record<string, unknown> | undefined)?.full_name);
  const displayName = clean(profile?.display_name) || metadataDisplayName || metadataFullName || displayNameFallback(user.email);

  const avatarCandidate = clean(profile?.avatar_url) || clean((user.user_metadata as Record<string, unknown> | undefined)?.avatar_url);
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
