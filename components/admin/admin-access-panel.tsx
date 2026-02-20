import Link from "next/link";

import type { AdminPageAccessResult } from "@/lib/admin/account-dashboard";

type AdminAccessPanelProps = {
  access: Extract<AdminPageAccessResult, { ok: false }>;
};

export function AdminAccessPanel({ access }: AdminAccessPanelProps) {
  if (access.reason === "missing_server_env") {
    return (
      <section className="account-panel account-panel-warning" aria-label="Admin configuration error">
        <p className="create-kicker">Admin</p>
        <h1 className="create-title">Admin auth configuration required</h1>
        <p className="create-copy">Server-side Supabase auth config is required before using admin routes.</p>
        <p className="create-copy">
          Missing env vars: <code>{(access.missingEnv ?? []).join(", ")}</code>
        </p>
      </section>
    );
  }

  if (access.reason === "unauthenticated") {
    return (
      <section className="account-panel" aria-label="Admin login required">
        <p className="create-kicker">Admin</p>
        <h1 className="create-title">Log in for admin controls</h1>
        <p className="create-copy">Admin pages require an authenticated allowlisted account.</p>
        <div className="create-actions">
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

  if (access.reason === "forbidden") {
    return (
      <section className="account-panel account-panel-warning" aria-label="Admin access denied">
        <p className="create-kicker">Admin</p>
        <h1 className="create-title">Admin allowlist required</h1>
        <p className="create-copy">This account is authenticated but not allowlisted for platform administration.</p>
        <p className="create-copy">
          Current user: <code>{access.email ?? "unknown"}</code>
        </p>
        <p className="create-copy">Allowlist entries configured: {access.allowlist?.length ?? 0}</p>
      </section>
    );
  }

  return (
    <section className="account-panel account-panel-warning" aria-label="Admin service role configuration error">
      <p className="create-kicker">Admin</p>
      <h1 className="create-title">Service role configuration required</h1>
      <p className="create-copy">Admin actions require Supabase service-role configuration on the server.</p>
      <p className="create-copy">
        Missing env vars: <code>{(access.missingEnv ?? []).join(", ")}</code>
      </p>
    </section>
  );
}
