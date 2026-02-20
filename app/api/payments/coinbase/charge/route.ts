import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { createCoinbaseCharge } from "@/lib/payments/coinbase";
import { getDepositConfig } from "@/lib/payments/deposit-config";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type ChargeBody = {
  amountUsd?: unknown;
};

function parseUsdAmount(raw: unknown): number | null {
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function mergeMissingEnv(serverMissing: string[], serviceMissing: string[]): string[] {
  return Array.from(new Set([...serverMissing, ...serviceMissing]));
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("relation") || normalized.includes("column") || normalized.includes("funding_intents");
}

export async function POST(request: Request) {
  const serverEnvReady = isSupabaseServerEnvConfigured();
  const serviceEnvReady = isSupabaseServiceEnvConfigured();

  if (!serverEnvReady || !serviceEnvReady) {
    return NextResponse.json(
      {
        error: "Coinbase charge creation is unavailable: missing Supabase environment variables.",
        missingEnv: mergeMissingEnv(getMissingSupabaseServerEnv(), getMissingSupabaseServiceEnv()),
      },
      { status: 503 }
    );
  }

  let body: ChargeBody;
  try {
    body = (await request.json()) as ChargeBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const amountUsd = parseUsdAmount(body.amountUsd);
  if (amountUsd === null) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["amountUsd must be a positive USD amount."],
      },
      { status: 400 }
    );
  }

  const depositConfig = getDepositConfig();
  if (amountUsd < depositConfig.minUsd || amountUsd > depositConfig.maxUsd) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: [`amountUsd must be between ${depositConfig.minUsd.toFixed(2)} and ${depositConfig.maxUsd.toFixed(2)}.`],
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

    const fundingIntentId = crypto.randomUUID();
    const service = createServiceClient();

    const { error: intentInsertError } = await service.from("funding_intents").insert({
      id: fundingIntentId,
      user_id: user.id,
      provider: "coinbase",
      intent: "usd_topup",
      key: "usd_topup",
      tokens_granted: 0,
      status: "created",
      requested_amount_usd: amountUsd,
      estimated_fee_usd: 0,
      estimated_net_credit_usd: amountUsd,
    });

    if (intentInsertError) {
      return NextResponse.json(
        {
          error: "Unable to initialize wallet funding intent.",
          detail: intentInsertError.message,
        },
        { status: isSchemaMissingError(intentInsertError.message) ? 503 : 500 }
      );
    }

    const charge = await createCoinbaseCharge({
      amountUsd,
      userId: user.id,
      request,
      fundingIntentId,
    });

    const { error: intentUpdateError } = await service
      .from("funding_intents")
      .update({
        status: "redirected",
        coinbase_charge_id: charge.id,
      })
      .eq("id", fundingIntentId)
      .eq("user_id", user.id);

    return NextResponse.json(
      {
        charge: {
          provider: "coinbase",
          network: "base",
          intent: "usd_topup",
          grossAmountUsd: amountUsd,
          estimatedFeeUsd: 0,
          estimatedNetCreditUsd: amountUsd,
          chargeId: charge.id,
          code: charge.code,
          url: charge.hostedUrl,
          expiresAt: charge.expiresAt,
        },
        fundingIntentId,
        warning: intentUpdateError ? clean(intentUpdateError.message) : null,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to create Coinbase charge.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
