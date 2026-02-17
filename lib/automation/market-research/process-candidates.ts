import { logResearchProposal, updateResearchProposalLog } from "@/lib/automation/market-research/db";
import type { GeneratedMarketProposal, ResearchOrganization, ResearchRunScope } from "@/lib/automation/market-research/types";
import { validateGeneratedProposal } from "@/lib/automation/market-research/quality-gates";
import { submitAutomationMarketProposal } from "@/lib/markets/submit-automation-proposal";

export type ProcessCandidateSummary = {
  generated: number;
  submitted: number;
  skippedDuplicate: number;
  skippedQuality: number;
  skippedInvalid: number;
  submitFailed: number;
  topSubmittedQuestions: string[];
};

type ProcessInput = {
  runId: string;
  scope: ResearchRunScope;
  scopeKey: string;
  organization?: ResearchOrganization;
  generatedCandidates: GeneratedMarketProposal[];
  maxToSubmit: number;
  submit: boolean;
};

export async function processGeneratedProposals(input: ProcessInput): Promise<ProcessCandidateSummary> {
  const summary: ProcessCandidateSummary = {
    generated: input.generatedCandidates.length,
    submitted: 0,
    skippedDuplicate: 0,
    skippedQuality: 0,
    skippedInvalid: 0,
    submitFailed: 0,
    topSubmittedQuestions: [],
  };

  for (const generated of input.generatedCandidates) {
    const validation = validateGeneratedProposal({
      generated,
      scope: input.scope,
      scopeKey: input.scopeKey,
      runId: input.runId,
      organization: input.organization,
    });

    if (!validation.ok) {
      const status = validation.kind === "quality" ? "skipped_quality" : "skipped_invalid";
      if (validation.kind === "quality") {
        summary.skippedQuality += 1;
      } else {
        summary.skippedInvalid += 1;
      }

      const logResult = await logResearchProposal({
        runId: input.runId,
        scope: input.scope,
        scopeKey: input.scopeKey,
        organizationId: input.organization?.id ?? null,
        eventFingerprint: validation.eventFingerprint,
        question: validation.question || "Invalid proposal payload",
        category: validation.category || "unknown",
        usFocus: false,
        confidence: validation.confidence,
        proposalPayload: generated as unknown as Record<string, unknown>,
        sourcesSnapshot: validation.sourcesSnapshot,
        submissionStatus: status,
        submissionError: validation.reason,
      });

      if ("duplicate" in logResult) {
        summary.skippedDuplicate += 1;
      }
      continue;
    }

    const reservation = await logResearchProposal({
      runId: input.runId,
      scope: input.scope,
      scopeKey: input.scopeKey,
      organizationId: input.organization?.id ?? null,
      eventFingerprint: validation.eventFingerprint,
      question: validation.proposal.question,
      category: validation.category,
      usFocus: validation.usFocus,
      confidence: validation.confidence,
      proposalPayload: validation.proposal as unknown as Record<string, unknown>,
      sourcesSnapshot: validation.sourcesSnapshot,
      submissionStatus: "submit_failed",
      submissionError: "pending_submission",
    });

    if ("duplicate" in reservation) {
      summary.skippedDuplicate += 1;
      continue;
    }

    if (summary.submitted >= input.maxToSubmit) {
      summary.skippedQuality += 1;
      await updateResearchProposalLog({
        proposalLogId: reservation.id,
        submissionStatus: "skipped_quality",
        submissionError: `submission cap reached (${input.maxToSubmit})`,
      });
      continue;
    }

    if (!input.submit) {
      summary.skippedInvalid += 1;
      await updateResearchProposalLog({
        proposalLogId: reservation.id,
        submissionStatus: "skipped_invalid",
        submissionError: "submission disabled (dry run or submit=false)",
      });
      continue;
    }

    const submitResult = await submitAutomationMarketProposal(validation.proposal);
    if (!submitResult.ok) {
      summary.submitFailed += 1;
      await updateResearchProposalLog({
        proposalLogId: reservation.id,
        submissionStatus: "submit_failed",
        submissionError:
          submitResult.validationErrors?.join(" | ") ||
          submitResult.detail ||
          submitResult.error ||
          "Unknown submit error.",
      });
      continue;
    }

    summary.submitted += 1;
    summary.topSubmittedQuestions.push(validation.proposal.question);
    await updateResearchProposalLog({
      proposalLogId: reservation.id,
      submissionStatus: "submitted_review",
      submittedMarketId: submitResult.marketId,
      submissionError: null,
    });
  }

  return summary;
}
