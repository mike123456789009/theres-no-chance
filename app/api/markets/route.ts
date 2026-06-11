import { NextResponse } from "next/server";

import { getServerEnvReadiness, getServiceEnvReadiness } from "@/lib/api/env-guards";
import { jsonEnvUnavailable, jsonError, jsonInternalError, jsonUnauthorized } from "@/lib/api/http-errors";
import { parseJsonBody } from "@/lib/api/route-primitives";
import { withEnforcedOrganizationId } from "@/lib/markets/access-rules";
import { validateCreateMarketPayload } from "@/lib/markets/create-market";
import { createMarketWithSourcesAndFee } from "@/lib/markets/create-market-service";
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

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const validation = validateCreateMarketPayload(parsed.value);
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
    let listingFeeClient = null;
    let listingFeeAmount: number | null = null;
    if (validation.data.submissionMode === "review") {
      const serviceEnv = getServiceEnvReadiness();
      if (!serviceEnv.isConfigured) {
        return jsonEnvUnavailable(
          "Market submission is unavailable: missing service role configuration for listing fees.",
          serviceEnv.missingEnv
        );
      }

      listingFeeClient = createServiceClient();
      listingFeeAmount = 0.5;
    }

    const created = await createMarketWithSourcesAndFee({
      db: supabase,
      listingFeeClient,
      creatorId: user.id,
      payload: {
        ...validation.data,
        accessRules: enforcedAccessRules,
      },
      status: marketStatus,
      listingFeeAmount,
      messages: {
        marketInsert: "Unable to create market.",
        sourceInsert: "Unable to save market sources.",
        listingFee: "Unable to charge market listing fee.",
        insufficientFunds: "Insufficient wallet balance for listing fee.",
      },
    });

    if (!created.ok) {
      return jsonError(created.status, created.error, { detail: created.detail });
    }

    return NextResponse.json(
      {
        marketId: created.market.id,
        status: created.market.status,
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
