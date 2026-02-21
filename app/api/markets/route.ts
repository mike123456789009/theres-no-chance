import { NextResponse } from "next/server";

import { getServerEnvReadiness, getServiceEnvReadiness } from "@/lib/api/env-guards";
import { jsonEnvUnavailable, jsonError, jsonInternalError, jsonUnauthorized } from "@/lib/api/http-errors";
import { serializeMarketAccessRules, withEnforcedOrganizationId } from "@/lib/markets/access-rules";
import { validateCreateMarketPayload } from "@/lib/markets/create-market";
import { extractRequiredOrganizationId, hasInstitutionAccessRule } from "@/lib/markets/view-access";
import {
  getMarketViewerContext,
  listDiscoveryMarketCards,
  parseMarketDiscoveryQuery,
} from "@/lib/markets/read-markets";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const serverEnv = getServerEnvReadiness();
  if (!serverEnv.isConfigured) {
    return jsonEnvUnavailable("Market discovery is unavailable: missing Supabase environment variables.", serverEnv.missingEnv);
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
      return jsonError(500, "Unable to load markets.", { detail: markets.error });
    }

    return NextResponse.json({
      markets: markets.markets,
      query,
      viewer,
    });
  } catch (error) {
    return jsonInternalError("Market discovery failed.", error);
  }
}

export async function POST(request: Request) {
  const serverEnv = getServerEnvReadiness();
  if (!serverEnv.isConfigured) {
    return jsonEnvUnavailable("Market creation is unavailable: missing Supabase environment variables.", serverEnv.missingEnv);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const validation = validateCreateMarketPayload(payload);
  if (!validation.ok) {
    return jsonError(400, "Validation failed.", { details: validation.errors });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonUnauthorized();
    }

    let enforcedAccessRules = validation.data.accessRules;

    if (hasInstitutionAccessRule(validation.data.accessRules)) {
      if (validation.data.visibility !== "private") {
        return jsonError(400, "Institution-gated markets must use private visibility.");
      }

      const requiredOrganizationId = extractRequiredOrganizationId(validation.data.accessRules);

      const { data: membershipData, error: membershipError } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        return jsonError(500, "Unable to validate institution membership for market creation.", {
          detail: membershipError.message,
        });
      }

      const activeOrganizationId =
        typeof membershipData?.organization_id === "string" ? membershipData.organization_id.toLowerCase() : "";

      if (!activeOrganizationId) {
        return jsonError(403, "Institution verification required before creating institution-gated markets.");
      }

      if (!requiredOrganizationId || requiredOrganizationId !== activeOrganizationId) {
        return jsonError(403, "Institution-gated market must target your active institution membership.");
      }

      enforcedAccessRules = withEnforcedOrganizationId(validation.data.accessRules, activeOrganizationId);
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
        access_rules: serializeMarketAccessRules(enforcedAccessRules),
        tags: validation.data.tags,
        risk_flags: validation.data.riskFlags,
        creator_id: user.id,
      })
      .select("id, status")
      .single();

    if (marketError || !market) {
      return jsonError(500, "Unable to create market.", {
        detail: marketError?.message ?? "Unknown insert failure.",
      });
    }

    if (validation.data.sources.length > 0) {
      const sourceRows = validation.data.sources.map((source) => ({
        market_id: market.id,
        source_label: source.label,
        source_url: source.url,
        source_type: source.type,
      }));

      const { error: sourceError } = await supabase.from("market_sources").insert(sourceRows);
      if (sourceError) {
        await supabase.from("markets").delete().eq("id", market.id).eq("creator_id", user.id);

        return jsonError(500, "Unable to save market sources.", { detail: sourceError.message });
      }
    }

    if (validation.data.submissionMode === "review") {
      const serviceEnv = getServiceEnvReadiness();
      if (!serviceEnv.isConfigured) {
        await supabase.from("markets").delete().eq("id", market.id).eq("creator_id", user.id);
        return jsonEnvUnavailable(
          "Market submission is unavailable: missing service role configuration for listing fees.",
          serviceEnv.missingEnv
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
          return jsonError(409, "Insufficient wallet balance for listing fee.", {
            detail: listingFeeError.message,
          });
        }

        return jsonError(500, "Unable to charge market listing fee.", { detail: listingFeeError.message });
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
    return jsonInternalError("Market creation failed.", error);
  }
}
