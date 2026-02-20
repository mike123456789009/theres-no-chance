import Link from "next/link";

import { PIXEL_AVATAR_OPTIONS, isPixelAvatarUrl } from "@/components/account/avatar-options";
import { InstitutionAccessPanel } from "@/components/account/institution-access-panel";
import { ProfileEditor } from "@/components/account/profile-editor";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfileRow = {
  display_name: string | null;
  avatar_url: string | null;
  ui_style: string | null;
} | null;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fallbackDisplayName(email: string | null | undefined): string {
  const normalized = clean(email);
  if (!normalized.includes("@")) return "Trader";
  const [name] = normalized.split("@");
  return clean(name) || "Trader";
}

export default async function AccountSettingsPage() {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <section className="account-panel account-panel-warning" aria-label="Account settings configuration error">
        <p className="create-kicker">Settings</p>
        <h1 className="create-title">Settings Unavailable</h1>
        <p className="create-copy">Configure Supabase server environment values before loading account settings.</p>
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
      <section className="account-panel" aria-label="Settings login required">
        <p className="create-kicker">Settings</p>
        <h1 className="create-title">Log in to edit settings</h1>
        <p className="create-copy">Profile edits are saved to your authenticated account.</p>
        <div className="create-actions account-actions-top">
          <Link className="create-submit create-submit-muted" href="/login">
            Log in
          </Link>
          <Link className="create-submit" href="/signup">
            Create account
          </Link>
        </div>
      </section>
    );
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, ui_style")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData ?? null) as ProfileRow;

  const metadataDisplayName = clean((user.user_metadata as Record<string, unknown> | undefined)?.display_name);
  const metadataFullName = clean((user.user_metadata as Record<string, unknown> | undefined)?.full_name);
  const initialDisplayName = clean(profile?.display_name) || metadataDisplayName || metadataFullName || fallbackDisplayName(user.email);

  const metadataAvatarUrl = clean((user.user_metadata as Record<string, unknown> | undefined)?.avatar_url);
  const avatarCandidate = clean(profile?.avatar_url) || metadataAvatarUrl;
  const initialAvatarUrl = isPixelAvatarUrl(avatarCandidate) ? avatarCandidate : PIXEL_AVATAR_OPTIONS[0].url;

  return (
    <section className="account-panel" aria-label="Account settings">
      <p className="create-kicker">Settings</p>
      <h1 className="create-title">Profile settings</h1>
      <p className="create-copy">Update your public display name and choose a square pixel avatar from the default set.</p>

      {profileError ? (
        <p className="create-note tnc-error-text">
          Existing profile row could not be loaded: <code>{profileError.message}</code>
        </p>
      ) : null}

      <ProfileEditor initialDisplayName={initialDisplayName} initialAvatarUrl={initialAvatarUrl} />

      <InstitutionAccessPanel />

      <section className="create-section" aria-label="Additional settings">
        <h2>More account settings</h2>
        <p className="create-note">Notification preferences, security controls, and withdrawal profile settings will live here next.</p>
      </section>
    </section>
  );
}
