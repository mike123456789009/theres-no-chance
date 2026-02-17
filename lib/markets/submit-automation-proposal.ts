import { requiredEnv } from "@/lib/env";
import type { MarketCardShadowTone } from "@/lib/markets/presentation";
import { validateCreateMarketPayload } from "@/lib/markets/create-market";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export type ResearchRunScope = "public" | "institution";

export type AutomationMarketProposalInput = {
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  closeTime: string;
  expectedResolutionTime?: string | null;
  evidenceRules?: string | null;
  disputeRules?: string | null;
  feeBps?: number;
  visibility: "public" | "unlisted" | "private";
  accessRules?: Record<string, unknown>;
  tags?: string[];
  riskFlags?: string[];
  sources: Array<{
    label: string;
    url: string;
    type: "official" | "supporting" | "rules";
  }>;
  eventFingerprint: string;
  scanScope: ResearchRunScope;
  cardShadowTone: MarketCardShadowTone;
  organizationId?: string | null;
  runId: string;
  confidence: number;
  rationale: string;
};

export type SubmitAutomationProposalResult =
  | {
      ok: true;
      marketId: string;
      status: "review";
    }
  | {
      ok: false;
      status: number;
      error: string;
      detail?: string;
      validationErrors?: string[];
      missingEnv?: string[];
    };

function cleanFingerprint(value: string): string {
  return value.trim().toLowerCase().slice(0, 220);
}

function cleanRationale(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 1000);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toAutomationMetadata(input: AutomationMarketProposalInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    proposalOrigin: "ai_automation",
    eventFingerprint: cleanFingerprint(input.eventFingerprint),
    scanScope: input.scanScope,
    cardShadowTone: input.cardShadowTone,
    researchRunId: input.runId,
    aiConfidence: clampConfidence(input.confidence),
    aiRationale: cleanRationale(input.rationale),
  };

  if (input.organizationId) {
    metadata.organizationId = input.organizationId;
  }

  return metadata;
}

function mergedAccessRules(input: AutomationMarketProposalInput): Record<string, unknown> {
  const existing = input.accessRules ?? {};
  return {
    ...existing,
    ...toAutomationMetadata(input),
  };
}

export async function submitAutomationMarketProposal(
  input: AutomationMarketProposalInput
): Promise<SubmitAutomationProposalResult> {
  if (!isSupabaseServiceEnvConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Automation submission unavailable: missing service role configuration.",
      missingEnv: getMissingSupabaseServiceEnv(),
    };
  }

  let botUserId = "";
  try {
    botUserId = requiredEnv("MARKET_RESEARCH_BOT_USER_ID").trim();
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "Automation submission unavailable: missing MARKET_RESEARCH_BOT_USER_ID.",
      detail: error instanceof Error ? error.message : "Missing bot user id.",
    };
  }

  if (!botUserId) {
    return {
      ok: false,
      status: 503,
      error: "Automation submission unavailable: MARKET_RESEARCH_BOT_USER_ID is empty.",
    };
  }

  const validation = validateCreateMarketPayload({
    submissionMode: "review",
    question: input.question,
    description: input.description,
    resolvesYesIf: input.resolvesYesIf,
    resolvesNoIf: input.resolvesNoIf,
    closeTime: input.closeTime,
    expectedResolutionTime: input.expectedResolutionTime ?? null,
    evidenceRules: input.evidenceRules ?? null,
    disputeRules: input.disputeRules ?? null,
    feeBps: input.feeBps ?? 200,
    visibility: input.visibility,
    accessRules: mergedAccessRules(input),
    tags: input.tags ?? [],
    riskFlags: input.riskFlags ?? [],
    sources: input.sources,
  });

  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      error: "Automation market proposal validation failed.",
      validationErrors: validation.errors,
    };
  }

  const service = createServiceClient();

  const { data: market, error: marketInsertError } = await service
    .from("markets")
    .insert({
      question: validation.data.question,
      description: validation.data.description,
      resolves_yes_if: validation.data.resolvesYesIf,
      resolves_no_if: validation.data.resolvesNoIf,
      close_time: validation.data.closeTime,
      expected_resolution_time: validation.data.expectedResolutionTime,
      evidence_rules: validation.data.evidenceRules,
      dispute_rules: validation.data.disputeRules,
      fee_bps: validation.data.feeBps,
      status: "review",
      visibility: validation.data.visibility,
      access_rules: validation.data.accessRules,
      tags: validation.data.tags,
      risk_flags: validation.data.riskFlags,
      creator_id: botUserId,
    })
    .select("id, status")
    .single();

  if (marketInsertError || !market) {
    return {
      ok: false,
      status: 500,
      error: "Unable to insert automation market proposal.",
      detail: marketInsertError?.message ?? "Unknown market insert failure.",
    };
  }

  const sourceRows = validation.data.sources.map((source) => ({
    market_id: market.id,
    source_label: source.label,
    source_url: source.url,
    source_type: source.type,
  }));

  const { error: sourceInsertError } = await service.from("market_sources").insert(sourceRows);
  if (sourceInsertError) {
    await service.from("markets").delete().eq("id", market.id).eq("creator_id", botUserId);
    return {
      ok: false,
      status: 500,
      error: "Unable to insert automation market sources.",
      detail: sourceInsertError.message,
    };
  }

  const { error: actionLogError } = await service.from("admin_action_log").insert({
    admin_user_id: botUserId,
    action: "market_ai_submit_review",
    target_type: "market",
    target_id: market.id,
    details: {
      runId: input.runId,
      eventFingerprint: cleanFingerprint(input.eventFingerprint),
      scope: input.scanScope,
      organizationId: input.organizationId ?? null,
      cardShadowTone: input.cardShadowTone,
      confidence: clampConfidence(input.confidence),
      rationale: cleanRationale(input.rationale),
      sourceCount: validation.data.sources.length,
    },
  });

  if (actionLogError) {
    return {
      ok: false,
      status: 500,
      error: "Market was submitted but admin action logging failed.",
      detail: actionLogError.message,
    };
  }

  return {
    ok: true,
    marketId: market.id,
    status: "review",
  };
}
