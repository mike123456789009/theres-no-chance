import { NextResponse } from "next/server";
import crypto from "node:crypto";

import {
  COINBASE_CHARGE_INTENTS,
  createCoinbaseCharge,
  getCoinbaseCatalog,
  getCoinbaseCatalogItem,
  parseCoinbaseChargeIntent,
} from "@/lib/payments/coinbase";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type ChargeBody = {
  intent?: string;
  key?: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mergeMissingEnv(serverMissing: string[], serviceMissing: string[]): string[] {
  return Array.from(new Set([...serverMissing, ...serviceMissing]));
}

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("relation") && normalized.includes("funding_intents");
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

  const intent = parseCoinbaseChargeIntent(clean(body.intent));
  const key = clean(body.key).toLowerCase();

  if (!intent) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: [`intent must be one of: ${COINBASE_CHARGE_INTENTS.join(", ")}`],
      },
      { status: 400 }
    );
  }

  if (!key) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["key is required."],
      },
      { status: 400 }
    );
  }

  const catalog = getCoinbaseCatalog(intent);
  const item = getCoinbaseCatalogItem(intent, key);
  if (!item) {
    return NextResponse.json(
      {
        error: "Charge item is not configured.",
        detail: `No Coinbase charge config found for intent '${intent}' and key '${key}'.`,
        availableKeys: catalog.map((entry) => entry.key),
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
      intent,
      key: item.key,
      tokens_granted: item.tokensGranted,
      status: "created",
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
      intent,
      item,
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
          intent,
          key: item.key,
          tokensGranted: item.tokensGranted,
          amountUsd: item.amountUsd,
          chargeId: charge.id,
          code: charge.code,
          url: charge.hostedUrl,
          expiresAt: charge.expiresAt,
        },
        fundingIntentId,
        warning: intentUpdateError ? intentUpdateError.message : null,
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
