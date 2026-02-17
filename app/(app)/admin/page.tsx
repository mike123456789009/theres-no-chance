import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminAllowlistEmails, isEmailAllowlisted } from "@/lib/auth/admin";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export default async function AdminPage() {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <main className="admin-page">
        <section className="admin-card admin-card-warning" aria-label="Admin configuration error">
          <h1 className="admin-title">Admin Guardrails Not Configured</h1>
          <p className="admin-copy">
            Unable to initialize the admin auth client. Check required Supabase environment variables before using
            admin routes.
          </p>
          <p className="admin-copy">Missing env vars: <code>{missingEnv.join(", ")}</code></p>
          <p className="admin-copy">
            Continue to <Link href="/">home</Link>
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const email = user.email?.toLowerCase() ?? null;
  const userId = user.id;
  const allowlisted = isEmailAllowlisted(email);
  const allowlist = getAdminAllowlistEmails();

  if (!allowlisted) {
    return (
      <main className="admin-page">
        <section className="admin-card admin-card-warning" aria-label="Admin access denied">
          <h1 className="admin-title">Admin Access Required</h1>
          <p className="admin-copy">
            This account is authenticated but not allowlisted for platform administration.
          </p>
          <p className="admin-copy">
            Current user: <code>{email ?? "unknown"}</code>
          </p>
          <p className="admin-copy">
            Configure <code>ADMIN_ALLOWLIST_EMAILS</code> with a comma-separated email list to grant admin access.
          </p>
          <p className="admin-copy">
            Continue to <Link href="/">home</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-card" aria-label="Admin dashboard shell">
        <p className="admin-kicker">Platform admin</p>
        <h1 className="admin-title">Admin Console Guardrails Enabled</h1>
        <p className="admin-copy">
          This route is restricted by the <code>ADMIN_ALLOWLIST_EMAILS</code> environment configuration.
        </p>
        <p className="admin-copy">
          Authenticated admin: <code>{email}</code>
        </p>
        <p className="admin-copy">
          Admin user id: <code>{userId}</code>
        </p>

        <div className="admin-panel-list" role="list" aria-label="Guardrail checks">
          <p role="listitem">Allowlist entries configured: {allowlist.length}</p>
          <p role="listitem">Server-side auth check on every request</p>
          <p role="listitem">Unauthorized users redirected or denied before admin actions load</p>
          <p role="listitem">Admin session API available for route-handler gatekeeping</p>
        </div>

        <p className="admin-copy">
          Next step: wire admin moderation and resolution actions on this protected surface.
        </p>
      </section>
    </main>
  );
}
