import { RUN_TIMEOUT_MS } from "@/lib/automation/market-research/constants";
import { listOrganizationsForResearch } from "@/lib/automation/market-research/db";
import { generateProposalBatch } from "@/lib/automation/market-research/openai-research";
import { processGeneratedProposals, type ProcessCandidateSummary } from "@/lib/automation/market-research/process-candidates";
import type { ResearchOrganization } from "@/lib/automation/market-research/types";
import { createRunDeadline, type RunDeadline } from "@/lib/automation/market-research/utils";

type InstitutionScanInput = {
  runId: string;
  modelName: string;
  maxPerOrganization: number;
  submit: boolean;
  organizationId?: string;
  deadline?: RunDeadline;
};

type InstitutionScanResult = ProcessCandidateSummary & {
  organizationsScanned: number;
  organizationsSkippedNoDomain: number;
  usedModel: string;
  failuresByInstitution: Array<{
    organizationId: string;
    organizationName: string;
    error: string;
  }>;
};

function mergeSummary(target: ProcessCandidateSummary, incoming: ProcessCandidateSummary) {
  target.generated += incoming.generated;
  target.submitted += incoming.submitted;
  target.skippedDuplicate += incoming.skippedDuplicate;
  target.skippedQuality += incoming.skippedQuality;
  target.skippedInvalid += incoming.skippedInvalid;
  target.submitFailed += incoming.submitFailed;
  target.topSubmittedQuestions.push(...incoming.topSubmittedQuestions);
}

function emptySummary(): ProcessCandidateSummary {
  return {
    generated: 0,
    submitted: 0,
    skippedDuplicate: 0,
    skippedQuality: 0,
    skippedInvalid: 0,
    submitFailed: 0,
    topSubmittedQuestions: [],
  };
}

function filterOrganizations(allOrganizations: ResearchOrganization[], organizationId?: string): ResearchOrganization[] {
  if (!organizationId) return allOrganizations;
  return allOrganizations.filter((organization) => organization.id === organizationId);
}

export async function runInstitutionScan(input: InstitutionScanInput): Promise<InstitutionScanResult> {
  const deadline = input.deadline ?? createRunDeadline(RUN_TIMEOUT_MS);
  deadline.throwIfExpired("loading institution organizations");

  const allOrganizations = await listOrganizationsForResearch();
  const organizations = filterOrganizations(allOrganizations, input.organizationId);

  const aggregate = emptySummary();
  const failuresByInstitution: InstitutionScanResult["failuresByInstitution"] = [];
  let organizationsScanned = 0;
  let organizationsSkippedNoDomain = 0;

  for (const organization of organizations) {
    deadline.throwIfExpired(`scanning institution ${organization.slug}`);

    if (organization.domains.length === 0) {
      organizationsSkippedNoDomain += 1;
      failuresByInstitution.push({
        organizationId: organization.id,
        organizationName: organization.name,
        error: "No organization domains configured; institution scan skipped.",
      });
      continue;
    }

    try {
      const maxCandidates = Math.max(input.maxPerOrganization * 2, 8);
      const generated = await generateProposalBatch({
        scope: "institution",
        modelName: input.modelName,
        maxCandidates,
        organization,
      });

      const processed = await processGeneratedProposals({
        runId: input.runId,
        scope: "institution",
        scopeKey: organization.id,
        organization,
        generatedCandidates: generated,
        maxToSubmit: input.maxPerOrganization,
        submit: input.submit,
      });

      mergeSummary(aggregate, processed);
      organizationsScanned += 1;
    } catch (error) {
      failuresByInstitution.push({
        organizationId: organization.id,
        organizationName: organization.name,
        error: error instanceof Error ? error.message : "Unknown institution scan error.",
      });
    }
  }

  return {
    ...aggregate,
    organizationsScanned,
    organizationsSkippedNoDomain,
    usedModel: input.modelName,
    failuresByInstitution,
  };
}
