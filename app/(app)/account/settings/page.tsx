import { AccountLoginRequiredPanel, AccountUnavailablePanel } from "@/components/account/account-state-panels";
import { PIXEL_AVATAR_OPTIONS, isPixelAvatarUrl } from "@/components/account/avatar-options";
import { InstitutionAccessPanel } from "@/components/account/institution-access-panel";
import { ProfileEditor } from "@/components/account/profile-editor";
import { displayNameFallback } from "@/lib/account/formatters";
import { loadAccountPageContext } from "@/lib/account/page-context";
import { cleanText } from "@/lib/shared/primitives";

export const dynamic = "force-dynamic";

type ProfileRow = {
  display_name: string | null;
  avatar_url: string | null;
  ui_style: string | null;
} | null;

export default async function AccountSettingsPage() {
  const context = await loadAccountPageContext();
  if (!context.ok && context.reason === "env") {
    return (
      <AccountUnavailablePanel
        kicker="Settings"
        title="Settings Unavailable"
        copy="Configure Supabase server environment values before loading account settings."
        missingEnv={context.missingEnv}
        ariaLabel="Account settings configuration error"
      />
    );
  }

  if (!context.ok) {
    return (
      <AccountLoginRequiredPanel
        kicker="Settings"
        title="Log in to edit settings"
        copy="Profile edits are saved to your authenticated account."
        ariaLabel="Settings login required"
        showBackToMarkets={false}
      />
    );
  }

  const { supabase, user } = context;
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, ui_style")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (profileData ?? null) as ProfileRow;

  const metadataDisplayName = cleanText((user.user_metadata as Record<string, unknown> | undefined)?.display_name);
  const metadataFullName = cleanText((user.user_metadata as Record<string, unknown> | undefined)?.full_name);
  const initialDisplayName = cleanText(profile?.display_name) || metadataDisplayName || metadataFullName || displayNameFallback(user.email);

  const metadataAvatarUrl = cleanText((user.user_metadata as Record<string, unknown> | undefined)?.avatar_url);
  const avatarCandidate = cleanText(profile?.avatar_url) || metadataAvatarUrl;
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
