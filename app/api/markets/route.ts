import { NextResponse } from "next/server";

import { validateCreateMarketPayload } from "@/lib/markets/create-market";
import {
  getMarketViewerContext,
  listDiscoveryMarketCards,
  parseMarketDiscoveryQuery,
} from "@/lib/markets/read-markets";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market discovery is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const query = parseMarketDiscoveryQuery(searchParams);
    const supabase = await createClient();
    const viewer = await getMarketViewerContext(supabase);

    const markets = await listDiscoveryMarketCards({
      supabase,
      viewer,
      query,
    });

    if (markets.schemaMissing) {
      return NextResponse.json({
        markets: [],
        query,
        viewer,
        warning: "Market tables are not provisioned in this environment yet.",
      });
    }

    if (markets.error) {
      return NextResponse.json(
        {
          error: "Unable to load markets.",
          detail: markets.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      markets: markets.markets,
      query,
      viewer,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Market discovery failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market creation is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateCreateMarketPayload(payload);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: validation.errors,
      },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const marketStatus = validation.data.submissionMode === "review" ? "review" : "draft";

    const { data: market, error: marketError } = await supabase
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
        status: marketStatus,
        visibility: validation.data.visibility,
        resolution_mode: validation.data.resolutionMode,
        access_rules: validation.data.accessRules,
        tags: validation.data.tags,
        risk_flags: validation.data.riskFlags,
        creator_id: user.id,
      })
      .select("id, status")
      .single();

    if (marketError || !market) {
      return NextResponse.json(
        {
          error: "Unable to create market.",
          detail: marketError?.message ?? "Unknown insert failure.",
        },
        { status: 500 }
      );
    }

    const sourceRows = validation.data.sources.map((source) => ({
      market_id: market.id,
      source_label: source.label,
      source_url: source.url,
      source_type: source.type,
    }));

    const { error: sourceError } = await supabase.from("market_sources").insert(sourceRows);
    if (sourceError) {
      await supabase.from("markets").delete().eq("id", market.id).eq("creator_id", user.id);

      return NextResponse.json(
        {
          error: "Unable to save market sources.",
          detail: sourceError.message,
        },
        { status: 500 }
      );
    }

    if (validation.data.submissionMode === "review") {
      if (!isSupabaseServiceEnvConfigured()) {
        await supabase.from("markets").delete().eq("id", market.id).eq("creator_id", user.id);
        return NextResponse.json(
          {
            error: "Market submission is unavailable: missing service role configuration for listing fees.",
            missingEnv: getMissingSupabaseServiceEnv(),
          },
          { status: 503 }
        );
      }

      const service = createServiceClient();
      const { error: listingFeeError } = await service.rpc("apply_market_listing_fee", {
        p_market_id: market.id,
        p_user_id: user.id,
        p_amount: 0.5,
      });

      if (listingFeeError) {
        await supabase.from("market_sources").delete().eq("market_id", market.id);
        await supabase.from("markets").delete().eq("id", market.id).eq("creator_id", user.id);

        const normalizedMessage = listingFeeError.message.toLowerCase();
        if (normalizedMessage.includes("[listing_funds]")) {
          return NextResponse.json(
            {
              error: "Insufficient wallet balance for listing fee.",
              detail: listingFeeError.message,
            },
            { status: 409 }
          );
        }

        return NextResponse.json(
          {
            error: "Unable to charge market listing fee.",
            detail: listingFeeError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        marketId: market.id,
        status: market.status,
        submissionMode: validation.data.submissionMode,
        resolutionMode: validation.data.resolutionMode,
        message:
          validation.data.submissionMode === "review"
            ? "Market submitted for review."
            : "Market draft saved successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Market creation failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
