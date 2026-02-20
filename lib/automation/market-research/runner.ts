import {
  DEFAULT_INSTITUTION_MAX_PER_ORG,
  DEFAULT_PUBLIC_MAX,
  DEFAULT_RESEARCH_MODEL,
  DEFAULT_SCOUT_MODEL,
  RUN_TIMEOUT_MS,
} from "@/lib/automation/market-research/constants";
import { completeResearchRun, requireMarketResearchEnabled, startResearchRun } from "@/lib/automation/market-research/db";
import { runInstitutionScan } from "@/lib/automation/market-research/institution-scan";
import { runPublicScan } from "@/lib/automation/market-research/public-scan";
import type { ResearchRunScope, ResearchRunSummary } from "@/lib/automation/market-research/types";
import { createRunDeadline } from "@/lib/automation/market-research/utils";

type RunPublicResearchInput = {
  submit: boolean;
  maxToSubmit?: number;
  modelName?: string;
  scoutModelName?: string;
};

type RunInstitutionResearchInput = {
  submit: boolean;
  maxPerOrganization?: number;
  modelName?: string;
  scoutModelName?: string;
  organizationId?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function summarizeStatus(input: {
  submitted: number;
  submitFailed: number;
  failuresByInstitution?: number;
}): "completed" | "partial" {
  if ((input.failuresByInstitution ?? 0) > 0) return "partial";
  if (input.submitFailed > 0) return "partial";
  if (input.submitted === 0) return "completed";
  return "completed";
}

export async function runPublicResearch(input: RunPublicResearchInput): Promise<ResearchRunSummary> {
  requireMarketResearchEnabled();
  const modelName = input.modelName?.trim() || DEFAULT_RESEARCH_MODEL;
  const scoutModelName = input.scoutModelName?.trim() || DEFAULT_SCOUT_MODEL;
  const maxToSubmit = Math.max(1, Math.min(250, input.maxToSubmit ?? DEFAULT_PUBLIC_MAX));
  const startedAt = nowIso();

  const runStart = await startResearchRun({
    scope: "public",
    organizationId: null,
    modelName,
    triggerSource: "codex_automation",
  });

  if (runStart.kind === "locked") {
    return {
      scope: "public",
      runId: runStart.runId,
      status: "skipped",
      modelName,
      scoutModelName,
      startedAt: runStart.startedAt,
      completedAt: nowIso(),
      generated: 0,
      submitted: 0,
      skippedDuplicate: 0,
      skippedQuality: 0,
      skippedInvalid: 0,
      submitFailed: 0,
      topSubmittedQuestions: [],
    };
  }

  const deadline = createRunDeadline(RUN_TIMEOUT_MS);

  try {
    const result = await runPublicScan({
      runId: runStart.runId,
      modelName,
      scoutModelName,
      maxToSubmit,
      submit: input.submit,
      deadline,
    });

    const status = summarizeStatus({
      submitted: result.submitted,
      submitFailed: result.submitFailed,
    });

    const summary = {
      scope: "public",
      runId: runStart.runId,
      status,
      modelName,
      scoutModelName,
      startedAt,
      completedAt: nowIso(),
      generated: result.generated,
      submitted: result.submitted,
      skippedDuplicate: result.skippedDuplicate,
      skippedQuality: result.skippedQuality,
      skippedInvalid: result.skippedInvalid,
      submitFailed: result.submitFailed,
      topSubmittedQuestions: result.topSubmittedQuestions.slice(0, 8),
    } satisfies ResearchRunSummary;

    await completeResearchRun({
      runId: runStart.runId,
      status,
      summary,
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown public scan failure.";
    const summary = {
      scope: "public",
      runId: runStart.runId,
      status: "failed",
      modelName,
      scoutModelName,
      startedAt,
      completedAt: nowIso(),
      generated: 0,
      submitted: 0,
      skippedDuplicate: 0,
      skippedQuality: 0,
      skippedInvalid: 0,
      submitFailed: 0,
      topSubmittedQuestions: [],
    } satisfies ResearchRunSummary;

    await completeResearchRun({
      runId: runStart.runId,
      status: "failed",
      summary,
      errorMessage: message,
    });

    return summary;
  }
}

export async function runInstitutionResearch(input: RunInstitutionResearchInput): Promise<ResearchRunSummary> {
  requireMarketResearchEnabled();
  const modelName = input.modelName?.trim() || DEFAULT_RESEARCH_MODEL;
  const scoutModelName = input.scoutModelName?.trim() || DEFAULT_SCOUT_MODEL;
  const maxPerOrganization = Math.max(1, Math.min(150, input.maxPerOrganization ?? DEFAULT_INSTITUTION_MAX_PER_ORG));
  const startedAt = nowIso();

  const runStart = await startResearchRun({
    scope: "institution",
    organizationId: null,
    modelName,
    triggerSource: "codex_automation",
  });

  if (runStart.kind === "locked") {
    return {
      scope: "institution",
      runId: runStart.runId,
      status: "skipped",
      modelName,
      scoutModelName,
      startedAt: runStart.startedAt,
      completedAt: nowIso(),
      generated: 0,
      submitted: 0,
      skippedDuplicate: 0,
      skippedQuality: 0,
      skippedInvalid: 0,
      submitFailed: 0,
      topSubmittedQuestions: [],
      failuresByInstitution: [],
    };
  }

  const deadline = createRunDeadline(RUN_TIMEOUT_MS);

  try {
    const result = await runInstitutionScan({
      runId: runStart.runId,
      modelName,
      scoutModelName,
      maxPerOrganization,
      submit: input.submit,
      organizationId: input.organizationId,
      deadline,
    });

    const status = summarizeStatus({
      submitted: result.submitted,
      submitFailed: result.submitFailed,
      failuresByInstitution: result.failuresByInstitution.length,
    });

    const summary = {
      scope: "institution",
      runId: runStart.runId,
      status,
      modelName,
      scoutModelName,
      startedAt,
      completedAt: nowIso(),
      generated: result.generated,
      submitted: result.submitted,
      skippedDuplicate: result.skippedDuplicate,
      skippedQuality: result.skippedQuality,
      skippedInvalid: result.skippedInvalid,
      submitFailed: result.submitFailed,
      topSubmittedQuestions: result.topSubmittedQuestions.slice(0, 8),
      failuresByInstitution: result.failuresByInstitution,
    } satisfies ResearchRunSummary;

    await completeResearchRun({
      runId: runStart.runId,
      status,
      summary,
      errorMessage:
        result.failuresByInstitution.length > 0
          ? `${result.failuresByInstitution.length} institution scans failed or were skipped.`
          : null,
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown institution scan failure.";
    const summary = {
      scope: "institution",
      runId: runStart.runId,
      status: "failed",
      modelName,
      scoutModelName,
      startedAt,
      completedAt: nowIso(),
      generated: 0,
      submitted: 0,
      skippedDuplicate: 0,
      skippedQuality: 0,
      skippedInvalid: 0,
      submitFailed: 0,
      topSubmittedQuestions: [],
      failuresByInstitution: [],
    } satisfies ResearchRunSummary;

    await completeResearchRun({
      runId: runStart.runId,
      status: "failed",
      summary,
      errorMessage: message,
    });

    return summary;
  }
}

export function isKnownScope(value: string): value is ResearchRunScope {
  return value === "public" || value === "institution";
}
