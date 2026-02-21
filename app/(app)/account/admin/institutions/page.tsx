import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminInstitutionManager } from "@/components/admin/admin-institution-manager";
import { guardAdminPageAccess } from "@/lib/admin/account-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminInstitutionsPage() {
  const access = await guardAdminPageAccess();
  if (!access.ok) {
    return <AdminAccessPanel access={access} />;
  }

  return (
    <section className="account-panel" aria-label="Admin institution manager">
      <p className="create-kicker">Admin / Institutions</p>
      <h1 className="create-title">Institution directory merge + email identity editor</h1>
      <p className="create-copy">
        Manually unify institution names, move domain mappings, and edit institution email identities tied to each organization.
      </p>
      <p className="create-note">
        Admin: <code>{access.adminUser.email ?? "unknown"}</code> · <code>{access.adminUser.id}</code>
      </p>

      <AdminInstitutionManager />
    </section>
  );
}
