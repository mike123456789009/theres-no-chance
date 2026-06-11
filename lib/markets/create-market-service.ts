import type { SupabaseClient } from "@supabase/supabase-js";

import { serializeMarketAccessRules } from "@/lib/markets/access-rules";
import type { ValidatedCreateMarketPayload } from "@/lib/markets/create-market";

type CreateMarketMessages = {
  marketInsert: string;
  sourceInsert: string;
  listingFee: string;
  insufficientFunds: string;
};

type CreateMarketWithSourcesInput = {
  db: SupabaseClient;
  listingFeeClient?: SupabaseClient | null;
  creatorId: string;
  payload: ValidatedCreateMarketPayload;
  status: "draft" | "review";
  listingFeeAmount: number | null;
  messages: CreateMarketMessages;
};

export type CreatedMarketSummary = {
  id: string;
  status: "draft" | "review";
};

export type CreateMarketWithSourcesResult =
  | {
      ok: true;
      market: CreatedMarketSummary;
    }
  | {
      ok: false;
      status: number;
      error: string;
      detail?: string;
    };

async function rollbackMarket(db: SupabaseClient, marketId: string, creatorId: string) {
  await db.from("market_sources").delete().eq("market_id", marketId);
  await db.from("markets").delete().eq("id", marketId).eq("creator_id", creatorId);
}

export async function createMarketWithSourcesAndFee(
  input: CreateMarketWithSourcesInput
): Promise<CreateMarketWithSourcesResult> {
  const { db, payload, creatorId, messages } = input;

  const { data: market, error: marketError } = await db
    .from("markets")
    .insert({
      question: payload.question,
      description: payload.description,
      resolves_yes_if: payload.resolvesYesIf,
      resolves_no_if: payload.resolvesNoIf,
      close_time: payload.closeTime,
      expected_resolution_time: payload.expectedResolutionTime,
      evidence_rules: payload.evidenceRules,
      dispute_rules: payload.disputeRules,
      fee_bps: payload.feeBps,
      status: input.status,
      visibility: payload.visibility,
      resolution_mode: payload.resolutionMode,
      access_rules: serializeMarketAccessRules(payload.accessRules),
      tags: payload.tags,
      risk_flags: payload.riskFlags,
      creator_id: creatorId,
    })
    .select("id, status")
    .single();

  if (marketError || !market) {
    return {
      ok: false,
      status: 500,
      error: messages.marketInsert,
      detail: marketError?.message ?? "Unknown market insert failure.",
    };
  }

  if (payload.sources.length > 0) {
    const sourceRows = payload.sources.map((source) => ({
      market_id: market.id,
      source_label: source.label,
      source_url: source.url,
      source_type: source.type,
    }));

    const { error: sourceError } = await db.from("market_sources").insert(sourceRows);
    if (sourceError) {
      await rollbackMarket(db, market.id, creatorId);
      return {
        ok: false,
        status: 500,
        error: messages.sourceInsert,
        detail: sourceError.message,
      };
    }
  }

  if (input.listingFeeAmount !== null) {
    if (!input.listingFeeClient) {
      await rollbackMarket(db, market.id, creatorId);
      return {
        ok: false,
        status: 503,
        error: messages.listingFee,
        detail: "Listing fee client is unavailable.",
      };
    }

    const { error: listingFeeError } = await input.listingFeeClient.rpc("apply_market_listing_fee", {
      p_market_id: market.id,
      p_user_id: creatorId,
      p_amount: input.listingFeeAmount,
    });

    if (listingFeeError) {
      await rollbackMarket(db, market.id, creatorId);
      const insufficientFunds = listingFeeError.message.toLowerCase().includes("[listing_funds]");
      return {
        ok: false,
        status: insufficientFunds ? 409 : 500,
        error: insufficientFunds ? messages.insufficientFunds : messages.listingFee,
        detail: listingFeeError.message,
      };
    }
  }

  return {
    ok: true,
    market: {
      id: market.id,
      status: market.status as "draft" | "review",
    },
  };
}
