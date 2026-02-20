import { RUN_TIMEOUT_MS } from "@/lib/automation/market-research/constants";
import { generateProposalBatch } from "@/lib/automation/market-research/openai-research";
import { processGeneratedProposals, type ProcessCandidateSummary } from "@/lib/automation/market-research/process-candidates";
import type { GeneratedMarketProposal } from "@/lib/automation/market-research/types";
import { createRunDeadline, type RunDeadline } from "@/lib/automation/market-research/utils";

type PublicScanInput = {
  runId: string;
  modelName: string;
  scoutModelName: string;
  maxToSubmit: number;
  submit: boolean;
  deadline?: RunDeadline;
};

type PublicScanResult = ProcessCandidateSummary & {
  usedModel: string;
  usedScoutModel: string;
};

function rebalancePublicCandidates(candidates: GeneratedMarketProposal[], maxToSubmit: number): GeneratedMarketProposal[] {
  if (candidates.length === 0) return [];

  const us = candidates.filter((candidate) => candidate.usFocus === true);
  const world = candidates.filter((candidate) => candidate.usFocus !== true);

  const targetWorld = Math.max(1, Math.round(maxToSubmit * 0.2));
  const targetUs = Math.max(0, maxToSubmit - targetWorld);

  const ordered: GeneratedMarketProposal[] = [];
  ordered.push(...world.slice(0, targetWorld));
  ordered.push(...us.slice(0, targetUs));

  const seen = new Set(ordered);
  for (const candidate of candidates) {
    if (!seen.has(candidate)) {
      ordered.push(candidate);
      seen.add(candidate);
    }
  }

  return ordered;
}

export async function runPublicScan(input: PublicScanInput): Promise<PublicScanResult> {
  const deadline = input.deadline ?? createRunDeadline(RUN_TIMEOUT_MS);
  deadline.throwIfExpired("starting public scan");

  const maxCandidates = Math.max(input.maxToSubmit * 2, 4);
  const generated = await generateProposalBatch({
    scope: "public",
    modelName: input.modelName,
    scoutModelName: input.scoutModelName,
    maxCandidates,
  });

  deadline.throwIfExpired("processing generated public proposals");
  const orderedCandidates = rebalancePublicCandidates(generated, input.maxToSubmit);
  const result = await processGeneratedProposals({
    runId: input.runId,
    scope: "public",
    scopeKey: "public",
    generatedCandidates: orderedCandidates,
    maxToSubmit: input.maxToSubmit,
    submit: input.submit,
  });

  return {
    ...result,
    usedModel: input.modelName,
    usedScoutModel: input.scoutModelName,
  };
}
