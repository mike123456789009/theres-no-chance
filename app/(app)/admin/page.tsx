import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminReviewQueue } from "@/components/admin/admin-review-queue";
import { AdminResolutionQueue } from "@/components/admin/admin-resolution-queue";
import { listRecentResearchRunsForAdmin } from "@/lib/automation/market-research/db";
import { getAdminAllowlistEmails, isEmailAllowlisted } from "@/lib/auth/admin";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type AdminQueueMarket = {
  id: string;
  question: string;
  status: "review" | "open";
  closeTime: string;
  createdAt: string;
  creatorId: string;
  tags: string[];
};

type MarketRow = {
  id: string;
  question: string;
  status: "review" | "open";
  close_time: string;
  created_at: string;
  creator_id: string;
  tags: string[] | null;
};

type AdminResearchRunCard = Awaited<ReturnType<typeof listRecentResearchRunsForAdmin>>[number];

type ResolutionMarket = {
  id: string;
  question: string;
  status: string;
  closeTime: string;
  resolvedAt: string | null;
  resolutionOutcome: string | null;
  creatorId: string;
  tags: string[];
};

type ResolutionMarketRow = {
  id: string;
  question: string;
  status: string;
  close_time: string;
  resolved_at: string | null;
  resolution_outcome: string | null;
  creator_id: string;
  tags: string[] | null;
};

const DEFAULT_DISPUTE_WINDOW_HOURS = 48;

async function loadAdminQueueMarkets() {
  const service = createServiceClient();
  const { data, error } = await service
    .from("markets")
    .select("id, question, status, close_time, created_at, creator_id, tags")
    .in("status", ["review", "open"])
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) {
    return {
      reviewMarkets: [] as AdminQueueMarket[],
      openMarkets: [] as AdminQueueMarket[],
      errorMessage: error.message,
    };
  }

  const rows = (data ?? []) as MarketRow[];

  const mappedMarkets = rows.map((market) => ({
    id: market.id,
    question: market.question,
    status: market.status,
    closeTime: market.close_time,
    createdAt: market.created_at,
    creatorId: market.creator_id,
    tags: market.tags ?? [],
  }));

  return {
    reviewMarkets: mappedMarkets.filter((market) => market.status === "review"),
    openMarkets: mappedMarkets.filter((market) => market.status === "open"),
    errorMessage: "",
  };
}

function getDisputeWindowHours(): number {
  const parsed = Number(process.env.MARKET_DISPUTE_WINDOW_HOURS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.floor(parsed));
  }
  return DEFAULT_DISPUTE_WINDOW_HOURS;
}

async function loadResolutionMarkets() {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: readyData, error: readyError } = await service
    .from("markets")
    .select("id, question, status, close_time, resolved_at, resolution_outcome, creator_id, tags")
    .in("status", ["open", "trading_halted", "pending_resolution"])
    .lte("close_time", nowIso)
    .order("close_time", { ascending: true })
    .limit(120);

  if (readyError) {
    return {
      readyToResolve: [] as ResolutionMarket[],
      resolvedMarkets: [] as ResolutionMarket[],
      errorMessage: readyError.message,
    };
  }

  const { data: resolvedData, error: resolvedError } = await service
    .from("markets")
    .select("id, question, status, close_time, resolved_at, resolution_outcome, creator_id, tags")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(120);

  if (resolvedError) {
    return {
      readyToResolve: [] as ResolutionMarket[],
      resolvedMarkets: [] as ResolutionMarket[],
      errorMessage: resolvedError.message,
    };
  }

  const mapRow = (row: ResolutionMarketRow): ResolutionMarket => ({
    id: row.id,
    question: row.question,
    status: row.status,
    closeTime: row.close_time,
    resolvedAt: row.resolved_at,
    resolutionOutcome: row.resolution_outcome,
    creatorId: row.creator_id,
    tags: row.tags ?? [],
  });

  const readyRows = (readyData ?? []) as ResolutionMarketRow[];
  const resolvedRows = (resolvedData ?? []) as ResolutionMarketRow[];

  return {
    readyToResolve: readyRows.map(mapRow),
    resolvedMarkets: resolvedRows.map(mapRow),
    errorMessage: "",
  };
}

async function loadResearchRuns() {
  try {
    const runs = await listRecentResearchRunsForAdmin(20);
    return {
      runs,
      errorMessage: "",
    };
  } catch (error) {
    return {
      runs: [] as AdminResearchRunCard[],
      errorMessage: error instanceof Error ? error.message : "Unable to load research runs.",
    };
  }
}

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return "N/A";
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

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
          <p className="admin-copy">
            Missing env vars: <code>{missingEnv.join(", ")}</code>
          </p>
          <p className="admin-copy">
            Continue to <a href="/">home</a>
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
            Continue to <a href="/">home</a>
          </p>
        </section>
      </main>
    );
  }

  if (!isSupabaseServiceEnvConfigured()) {
    const missingEnv = getMissingSupabaseServiceEnv();

    return (
      <main className="admin-page">
        <section className="admin-card admin-card-warning" aria-label="Admin service role configuration error">
          <p className="admin-kicker">Platform admin</p>
          <h1 className="admin-title">Service Role Configuration Required</h1>
          <p className="admin-copy">
            Review queue actions require <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server.
          </p>
          <p className="admin-copy">
            Missing env vars: <code>{missingEnv.join(", ")}</code>
          </p>
          <p className="admin-copy">
            Continue to <a href="/">home</a>
          </p>
        </section>
      </main>
    );
  }

  const queue = await loadAdminQueueMarkets();
  const resolution = await loadResolutionMarkets();
  const researchRuns = await loadResearchRuns();
  const disputeWindowHours = getDisputeWindowHours();

  return (
    <main className="admin-page">
      <section className="admin-card" aria-label="Admin review queue">
        <p className="admin-kicker">Platform admin</p>
        <h1 className="admin-title">Review Queue & Trading Controls</h1>
        <p className="admin-copy">
          Approve markets from review into open trading, reject back to draft, or halt active markets when needed.
        </p>
        <p className="admin-copy">
          Authenticated admin: <code>{email}</code>
        </p>
        <p className="admin-copy">
          Admin user id: <code>{user.id}</code>
        </p>

        <div className="admin-panel-list" role="list" aria-label="Guardrail checks">
          <p role="listitem">Allowlist entries configured: {allowlist.length}</p>
          <p role="listitem">Queue actions require authenticated allowlisted admin sessions</p>
          <p role="listitem">All approve/reject/halt events are written to admin action audit log</p>
        </div>

        {queue.errorMessage ? (
          <p className="admin-copy">
            Unable to load queue data: <code>{queue.errorMessage}</code>
          </p>
        ) : (
          <AdminReviewQueue reviewMarkets={queue.reviewMarkets} openMarkets={queue.openMarkets} />
        )}

        <section className="admin-ai-runs" aria-label="Resolution pipeline">
          <div className="admin-ai-runs-head">
            <h2>Resolution & dispute pipeline</h2>
            <p>
              Dispute window: {disputeWindowHours}h • Resolve markets after close, then finalize after dispute window ends.
            </p>
          </div>

          {resolution.errorMessage ? (
            <p className="admin-copy">
              Unable to load resolution queue: <code>{resolution.errorMessage}</code>
            </p>
          ) : (
            <AdminResolutionQueue
              readyToResolve={resolution.readyToResolve}
              resolvedMarkets={resolution.resolvedMarkets}
              disputeWindowHours={disputeWindowHours}
            />
          )}
        </section>

        <section className="admin-ai-runs" aria-label="AI scout research runs">
          <div className="admin-ai-runs-head">
            <h2>AI scout runs (latest 20)</h2>
            <p>Research + proposal submission observability</p>
          </div>

          {researchRuns.errorMessage ? (
            <p className="admin-copy">
              Unable to load AI run history: <code>{researchRuns.errorMessage}</code>
            </p>
          ) : researchRuns.runs.length === 0 ? (
            <p className="admin-copy">No AI research runs recorded yet.</p>
          ) : (
            <div className="admin-ai-run-list">
              {researchRuns.runs.map((run) => (
                <article key={run.id} className="admin-ai-run-card">
                  <p className="admin-ai-run-kicker">
                    {run.scope} • {run.status}
                  </p>
                  <p>
                    Run id: <code>{run.id}</code>
                  </p>
                  <p>
                    Model: <code>{run.modelName}</code>
                  </p>
                  <p>Started: {formatDate(run.startedAt)}</p>
                  <p>Completed: {formatDate(run.completedAt)}</p>
                  <p>Duration: {formatDuration(run.durationMs)}</p>
                  {run.organizationId ? (
                    <p>
                      Organization: {run.organizationName ?? "Unknown"} (<code>{run.organizationId}</code>)
                    </p>
                  ) : null}
                  {run.errorMessage ? (
                    <p>
                      Error: <code>{run.errorMessage}</code>
                    </p>
                  ) : null}

                  <div className="admin-ai-run-metrics" role="list" aria-label="AI run metrics">
                    <p role="listitem">submitted: {run.proposalCounts.submitted_review}</p>
                    <p role="listitem">duplicates: {run.proposalCounts.skipped_duplicate}</p>
                    <p role="listitem">quality skips: {run.proposalCounts.skipped_quality}</p>
                    <p role="listitem">invalid skips: {run.proposalCounts.skipped_invalid}</p>
                    <p role="listitem">submit failed: {run.proposalCounts.submit_failed}</p>
                  </div>

                  {run.proposals.length > 0 ? (
                    <ul className="admin-ai-run-proposals">
                      {run.proposals.map((proposal) => (
                        <li key={proposal.id}>
                          <span>{proposal.submissionStatus}</span> {proposal.question}
                          {proposal.submittedMarketId ? (
                            <>
                              {" "}
                              (<Link href={`/markets/${proposal.submittedMarketId}`}>open market</Link>)
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No proposal records for this run.</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
