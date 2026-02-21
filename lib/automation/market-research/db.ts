import { createServiceClient } from "@/lib/supabase/service";
import type {
  ResearchOrganization,
  ResearchRunScope,
  ResearchRunStatus,
  ResearchSubmissionStatus,
} from "@/lib/automation/market-research/types";

type StartRunInput = {
  scope: ResearchRunScope;
  organizationId?: string | null;
  modelName: string;
  triggerSource?: string;
};

type StartRunResult =
  | {
      kind: "started";
      runId: string;
      startedAt: string;
    }
  | {
      kind: "locked";
      runId: string;
      startedAt: string;
    };

type ProposalLogInput = {
  runId: string;
  scope: ResearchRunScope;
  scopeKey: string;
  organizationId?: string | null;
  eventFingerprint: string;
  question: string;
  category: string;
  usFocus: boolean;
  confidence: number;
  proposalPayload: Record<string, unknown>;
  sourcesSnapshot: Array<{ label: string; url: string; type: string }>;
  submissionStatus: ResearchSubmissionStatus;
  submittedMarketId?: string | null;
  submissionError?: string | null;
};

type ProposalLogUpdateInput = {
  proposalLogId: string;
  submissionStatus: ResearchSubmissionStatus;
  submittedMarketId?: string | null;
  submissionError?: string | null;
};

export type RunProposalStatusCount = Record<ResearchSubmissionStatus, number>;

export type AdminResearchRunCard = {
  id: string;
  scope: string;
  organizationId: string | null;
  organizationName: string | null;
  status: string;
  modelName: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  summary: Record<string, unknown>;
  errorMessage: string | null;
  proposalCounts: RunProposalStatusCount;
  proposals: Array<{
    id: string;
    question: string;
    submissionStatus: string;
    submittedMarketId: string | null;
    category: string;
    confidence: number;
    createdAt: string;
  }>;
};

function isUniqueViolation(errorCode: string | undefined): boolean {
  return errorCode === "23505";
}

function cleanBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function confidenceToNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function emptyProposalCounts(): RunProposalStatusCount {
  return {
    submitted_review: 0,
    skipped_duplicate: 0,
    skipped_quality: 0,
    skipped_invalid: 0,
    submit_failed: 0,
  };
}

const DEFAULT_RUN_LOCK_STALE_MS = 2 * 60 * 60 * 1000;
const MIN_RUN_LOCK_STALE_MS = 5 * 60 * 1000;

type RunningRunRow = {
  id: string;
  started_at: string;
};

function parsePositiveEnvInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function runLockStaleAfterMs(): number {
  const configured = parsePositiveEnvInt(process.env.MARKET_RESEARCH_RUN_LOCK_STALE_MS);
  if (configured === null) return DEFAULT_RUN_LOCK_STALE_MS;
  return Math.max(MIN_RUN_LOCK_STALE_MS, configured);
}

function parseTimeMs(value: string): number | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function isRunLockStale(startedAt: string, staleAfterMs: number): boolean {
  const startedAtMs = parseTimeMs(startedAt);
  if (startedAtMs === null) {
    return true;
  }
  return Date.now() - startedAtMs >= staleAfterMs;
}

async function findRunningRunByScope(
  service: ReturnType<typeof createServiceClient>,
  input: Pick<StartRunInput, "scope" | "organizationId">
): Promise<RunningRunRow | null> {
  let query = service
    .from("market_research_runs")
    .select("id, started_at")
    .eq("scope", input.scope)
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(1);

  if (input.organizationId) {
    query = query.eq("organization_id", input.organizationId);
  } else {
    query = query.is("organization_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Unable to load lock state for research run start: ${error.message}`);
  }
  if (!data) return null;
  return data as RunningRunRow;
}

async function failStaleRunningRun(input: {
  service: ReturnType<typeof createServiceClient>;
  runId: string;
  staleAfterMs: number;
}) {
  const completedAt = new Date().toISOString();
  const staleMinutes = Math.round(input.staleAfterMs / 60_000);
  const message = `Run lock stale for ${staleMinutes}m+; marked failed so a new run can start.`;

  const { error } = await input.service
    .from("market_research_runs")
    .update({
      status: "failed",
      completed_at: completedAt,
      error_message: message,
      summary: {
        reason: "stale_run_lock_recovered",
        staleAfterMs: input.staleAfterMs,
        recoveredAt: completedAt,
      },
    })
    .eq("id", input.runId)
    .eq("status", "running");

  if (error) {
    throw new Error(`Unable to clear stale run lock ${input.runId}: ${error.message}`);
  }
}

export function isMarketResearchEnabled(): boolean {
  return cleanBoolean(process.env.MARKET_RESEARCH_ENABLED);
}

export function requireMarketResearchEnabled() {
  if (!isMarketResearchEnabled()) {
    throw new Error("MARKET_RESEARCH_ENABLED is not enabled. Set MARKET_RESEARCH_ENABLED=true.");
  }
}

export async function startResearchRun(input: StartRunInput): Promise<StartRunResult> {
  const service = createServiceClient();
  const triggerSource = input.triggerSource?.trim() || "codex_automation";

  const startPayload = {
    scope: input.scope,
    organization_id: input.organizationId ?? null,
    status: "running",
    model_name: input.modelName,
    trigger_source: triggerSource,
  };

  const { data, error } = await service
    .from("market_research_runs")
    .insert(startPayload)
    .select("id, started_at")
    .single();

  if (!error && data) {
    return {
      kind: "started",
      runId: data.id,
      startedAt: data.started_at,
    };
  }

  if (error && isUniqueViolation((error as { code?: string }).code)) {
    const staleAfterMs = runLockStaleAfterMs();
    const lockingRun = await findRunningRunByScope(service, {
      scope: input.scope,
      organizationId: input.organizationId,
    });

    if (lockingRun && isRunLockStale(lockingRun.started_at, staleAfterMs)) {
      await failStaleRunningRun({
        service,
        runId: lockingRun.id,
        staleAfterMs,
      });

      const retry = await service
        .from("market_research_runs")
        .insert(startPayload)
        .select("id, started_at")
        .single();

      if (!retry.error && retry.data) {
        return {
          kind: "started",
          runId: retry.data.id,
          startedAt: retry.data.started_at,
        };
      }

      if (retry.error && !isUniqueViolation((retry.error as { code?: string }).code)) {
        throw new Error(`Unable to start research run after stale-lock recovery: ${retry.error.message}`);
      }
    }

    const activeLock = await findRunningRunByScope(service, {
      scope: input.scope,
      organizationId: input.organizationId,
    });

    const skipped = await service
      .from("market_research_runs")
      .insert({
        scope: input.scope,
        organization_id: input.organizationId ?? null,
        status: "skipped",
        model_name: input.modelName,
        trigger_source: triggerSource,
        completed_at: new Date().toISOString(),
        summary: {
          reason: "run_lock_exists",
          lockedByRunId: activeLock?.id ?? null,
          lockedByStartedAt: activeLock?.started_at ?? null,
        },
      })
      .select("id, started_at")
      .single();

    if (skipped.error || !skipped.data) {
      throw new Error(`Research run lock encountered, and skip log failed: ${skipped.error?.message ?? "unknown error"}`);
    }

    return {
      kind: "locked",
      runId: skipped.data.id,
      startedAt: skipped.data.started_at,
    };
  }

  throw new Error(`Unable to start research run: ${error?.message ?? "unknown error"}`);
}

export async function completeResearchRun(input: {
  runId: string;
  status: Exclude<ResearchRunStatus, "running">;
  summary: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const service = createServiceClient();
  const { error } = await service
    .from("market_research_runs")
    .update({
      status: input.status,
      completed_at: new Date().toISOString(),
      summary: input.summary,
      error_message: input.errorMessage ?? null,
    })
    .eq("id", input.runId);

  if (error) {
    throw new Error(`Unable to complete research run ${input.runId}: ${error.message}`);
  }
}

export async function logResearchProposal(input: ProposalLogInput): Promise<{ id: string } | { duplicate: true }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("market_research_proposals")
    .insert({
      run_id: input.runId,
      scope: input.scope,
      scope_key: input.scopeKey,
      organization_id: input.organizationId ?? null,
      event_fingerprint: input.eventFingerprint,
      question: input.question,
      category: input.category,
      us_focus: input.usFocus,
      confidence: confidenceToNumber(input.confidence),
      proposal_payload: input.proposalPayload,
      sources_snapshot: input.sourcesSnapshot,
      submission_status: input.submissionStatus,
      submitted_market_id: input.submittedMarketId ?? null,
      submission_error: input.submissionError ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation((error as { code?: string }).code)) {
      return { duplicate: true };
    }
    throw new Error(`Unable to log research proposal: ${error.message}`);
  }

  return { id: data.id };
}

export async function updateResearchProposalLog(input: ProposalLogUpdateInput) {
  const service = createServiceClient();
  const { error } = await service
    .from("market_research_proposals")
    .update({
      submission_status: input.submissionStatus,
      submitted_market_id: input.submittedMarketId ?? null,
      submission_error: input.submissionError ?? null,
    })
    .eq("id", input.proposalLogId);

  if (error) {
    throw new Error(`Unable to update research proposal log ${input.proposalLogId}: ${error.message}`);
  }
}

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  organization_domains:
    | Array<{
        domain: string;
        allow_subdomains: boolean;
      }>
    | null;
};

export async function listOrganizationsForResearch(): Promise<ResearchOrganization[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .select("id, name, slug, organization_domains(domain, allow_subdomains)")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load organizations for research scan: ${error.message}`);
  }

  const rows = (data ?? []) as OrganizationRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    domains: (row.organization_domains ?? []).map((domain) => ({
      domain: domain.domain,
      allowSubdomains: domain.allow_subdomains,
    })),
  }));
}

type ExistingMarketRow = {
  id: string;
  question: string;
  close_time: string;
  status: string;
  visibility: string;
  access_rules: Record<string, unknown> | null;
  tags: string[] | null;
  created_at: string;
};

export type ExistingMarketContext = {
  id: string;
  question: string;
  closeTime: string;
  status: string;
  visibility: string;
  eventFingerprint: string | null;
  tags: string[];
};

type ExistingMarketContextInput = {
  scope: ResearchRunScope;
  organizationId?: string;
  limit?: number;
};

export async function listExistingMarketsForResearch(input: ExistingMarketContextInput): Promise<ExistingMarketContext[]> {
  const service = createServiceClient();
  const limit = Math.max(20, Math.min(400, input.limit ?? 180));
  const activeStatuses = ["review", "open", "trading_halted", "closed", "pending_resolution", "resolved", "finalized"];

  let query = service
    .from("markets")
    .select("id, question, close_time, status, visibility, access_rules, tags, created_at")
    .in("status", activeStatuses)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.scope === "public") {
    query = query.in("visibility", ["public", "unlisted"]);
  } else {
    query = query.eq("visibility", "private");
    if (input.organizationId) {
      query = query.contains("access_rules", { organizationId: input.organizationId });
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to load existing markets for research context: ${error.message}`);
  }

  const rows = (data ?? []) as ExistingMarketRow[];
  return rows.map((row) => {
    const accessRules = row.access_rules ?? {};
    const fingerprintRaw = accessRules["eventFingerprint"];
    const eventFingerprint =
      typeof fingerprintRaw === "string" && fingerprintRaw.trim().length > 0 ? fingerprintRaw.trim().toLowerCase() : null;

    return {
      id: row.id,
      question: row.question,
      closeTime: row.close_time,
      status: row.status,
      visibility: row.visibility,
      eventFingerprint,
      tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8) : [],
    };
  });
}

type AdminRunRow = {
  id: string;
  scope: string;
  organization_id: string | null;
  status: string;
  model_name: string;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, unknown> | null;
  error_message: string | null;
};

type AdminProposalRow = {
  id: string;
  run_id: string;
  question: string;
  submission_status: string;
  submitted_market_id: string | null;
  category: string;
  confidence: number;
  created_at: string;
};

export async function listRecentResearchRunsForAdmin(limit = 20): Promise<AdminResearchRunCard[]> {
  const service = createServiceClient();
  const { data: runData, error: runError } = await service
    .from("market_research_runs")
    .select("id, scope, organization_id, status, model_name, started_at, completed_at, summary, error_message")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (runError) {
    throw new Error(`Unable to load research runs for admin: ${runError.message}`);
  }

  const runs = (runData ?? []) as AdminRunRow[];
  if (runs.length === 0) return [];

  const orgIds = Array.from(
    new Set(
      runs
        .map((run) => run.organization_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const organizationNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: organizationData, error: organizationError } = await service
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (organizationError) {
      throw new Error(`Unable to load organization labels for admin runs: ${organizationError.message}`);
    }
    for (const organization of (organizationData ?? []) as Array<{ id: string; name: string }>) {
      organizationNameById.set(organization.id, organization.name);
    }
  }

  const runIds = runs.map((run) => run.id);
  const { data: proposalData, error: proposalError } = await service
    .from("market_research_proposals")
    .select("id, run_id, question, submission_status, submitted_market_id, category, confidence, created_at")
    .in("run_id", runIds)
    .order("created_at", { ascending: false });

  if (proposalError) {
    throw new Error(`Unable to load research proposals for admin: ${proposalError.message}`);
  }

  const proposals = (proposalData ?? []) as AdminProposalRow[];
  const proposalsByRun = new Map<string, AdminProposalRow[]>();
  for (const proposal of proposals) {
    const bucket = proposalsByRun.get(proposal.run_id);
    if (bucket) {
      bucket.push(proposal);
    } else {
      proposalsByRun.set(proposal.run_id, [proposal]);
    }
  }

  return runs.map((run) => {
    const runProposals = proposalsByRun.get(run.id) ?? [];
    const proposalCounts = emptyProposalCounts();
    for (const proposal of runProposals) {
      if (proposal.submission_status in proposalCounts) {
        proposalCounts[proposal.submission_status as keyof RunProposalStatusCount] += 1;
      }
    }

    const startedAtMs = Number.isNaN(Date.parse(run.started_at)) ? null : Date.parse(run.started_at);
    const completedAtMs = run.completed_at && !Number.isNaN(Date.parse(run.completed_at)) ? Date.parse(run.completed_at) : null;

    return {
      id: run.id,
      scope: run.scope,
      organizationId: run.organization_id,
      organizationName: run.organization_id ? organizationNameById.get(run.organization_id) ?? null : null,
      status: run.status,
      modelName: run.model_name,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      durationMs: startedAtMs !== null && completedAtMs !== null ? Math.max(0, completedAtMs - startedAtMs) : null,
      summary: run.summary ?? {},
      errorMessage: run.error_message,
      proposalCounts,
      proposals: runProposals.slice(0, 12).map((proposal) => ({
        id: proposal.id,
        question: proposal.question,
        submissionStatus: proposal.submission_status,
        submittedMarketId: proposal.submitted_market_id,
        category: proposal.category,
        confidence: proposal.confidence,
        createdAt: proposal.created_at,
      })),
    };
  });
}
