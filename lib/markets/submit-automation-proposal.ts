import { requiredEnv } from "@/lib/env";
import type { MarketCardShadowTone } from "@/lib/markets/presentation";
import { validateCreateMarketPayload } from "@/lib/markets/create-market";
import { createMarketWithSourcesAndFee } from "@/lib/markets/create-market-service";
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
    feeBps: input.feeBps ?? 50,
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
  const created = await createMarketWithSourcesAndFee({
    db: service,
    listingFeeClient: service,
    creatorId: botUserId,
    payload: validation.data,
    status: "review",
    listingFeeAmount: 0,
    messages: {
      marketInsert: "Unable to insert automation market proposal.",
      sourceInsert: "Unable to insert automation market sources.",
      listingFee: "Unable to apply listing fee for automation market proposal.",
      insufficientFunds: "Unable to apply listing fee for automation market proposal.",
    },
  });

  if (!created.ok) {
    return {
      ok: false,
      status: created.status,
      error: created.error,
      detail: created.detail,
    };
  }

  const { error: actionLogError } = await service.from("admin_action_log").insert({
    admin_user_id: botUserId,
    action: "market_ai_submit_review",
    target_type: "market",
    target_id: created.market.id,
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
    marketId: created.market.id,
    status: "review",
  };
}
