import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { AdminResolutionQueue } from "@/components/admin/admin-resolution-queue";
import { guardAdminPageAccess } from "@/lib/admin/access";
import { getResolutionWindowHours, loadResolutionMarkets } from "@/lib/admin/resolution";

export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  const access = await guardAdminPageAccess();
  if (!access.ok) {
    return <AdminAccessPanel access={access} />;
  }

  const [resolution] = await Promise.all([loadResolutionMarkets()]);
  const resolutionWindowHours = getResolutionWindowHours();

  return (
    <section className="account-panel" aria-label="Admin moderation queue">
      <p className="create-kicker">Admin / Moderation</p>
      <h1 className="create-title">Resolution + dispute controls</h1>
      <p className="create-copy">
        Resolve closed markets, enforce dispute windows, and finalize settlement once the moderation window expires.
      </p>
      <p className="create-note">
        Resolution window configured: <strong>{resolutionWindowHours}h</strong> · Challenge window configured:{" "}
        <strong>24h</strong>
      </p>

      {resolution.errorMessage ? (
        <p className="create-note tnc-error-text">
          Unable to load moderation queues: <code>{resolution.errorMessage}</code>
        </p>
      ) : (
        <AdminResolutionQueue
          autoFinalizable={resolution.autoFinalizable}
          adjudicationRequired={resolution.adjudicationRequired}
          finalizedMarkets={resolution.finalizedMarkets}
        />
      )}
    </section>
  );
}
