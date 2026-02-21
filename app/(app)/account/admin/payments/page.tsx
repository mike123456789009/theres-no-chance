import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminVenmoReconcileQueue } from "@/components/admin/admin-venmo-reconcile-queue";
import { guardAdminPageAccess, loadAdminVenmoReviewQueue } from "@/lib/admin/account-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const access = await guardAdminPageAccess();
  if (!access.ok) {
    return <AdminAccessPanel access={access} />;
  }

  const queue = await loadAdminVenmoReviewQueue();

  return (
    <section className="account-panel" aria-label="Admin payments reconciliation">
      <p className="create-kicker">Admin / Payments</p>
      <h1 className="create-title">Venmo reconciliation + fee audit</h1>
      <p className="create-copy">
        Review unmatched Venmo rows and manually match them to funding intents. Credits are always posted at net amount after fee.
      </p>
      <p className="create-note">
        Admin: <code>{access.adminUser.email ?? "unknown"}</code> · <code>{access.adminUser.id}</code>
      </p>

      {queue.errorMessage ? (
        <p className="create-note tnc-error-text">
          Unable to load Venmo queue: <code>{queue.errorMessage}</code>
        </p>
      ) : (
        <AdminVenmoReconcileQueue
          rows={queue.rows}
          unmatchedFundingIntents={queue.unmatchedFundingIntents}
          fundingIntentErrorMessage={queue.fundingIntentErrorMessage}
        />
      )}
    </section>
  );
}
