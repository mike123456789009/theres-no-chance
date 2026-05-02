import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminMarketOperationsHealth } from "@/components/admin/admin-market-operations-health";
import { guardAdminPageAccess } from "@/lib/admin/access";
import { loadMarketOperationsHealth } from "@/lib/admin/market-operations-health";

export const dynamic = "force-dynamic";

export default async function AdminSystemCheckPage() {
  const access = await guardAdminPageAccess();
  if (!access.ok) {
    return <AdminAccessPanel access={access} />;
  }

  const health = await loadMarketOperationsHealth();

  return (
    <section className="account-panel" aria-label="Admin system check">
      <p className="create-kicker">Admin / System Check</p>
      <h1 className="create-title">Production smoke dashboard</h1>
      <p className="create-copy">
        A compact admin-only check for Supabase reachability, auth config, deployment identity, market lifecycle counts,
        and automation freshness.
      </p>

      <AdminMarketOperationsHealth health={health} />
    </section>
  );
}
