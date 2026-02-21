import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { getDepositConfig } from "@/lib/payments/deposit-config";
import { getVenmoFeeConfig } from "@/lib/payments/venmo-fees";
import { buildRequiredVenmoNote, generateInvoiceCode, getVenmoPayUrl, getVenmoQrImageUrl, getVenmoUsername } from "@/lib/payments/venmo";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type VenmoIntentBody = {
  amountUsd?: unknown;
};

function parseUsdAmount(raw: unknown): number | null {
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mergeMissingEnv(serverMissing: string[], serviceMissing: string[]): string[] {
  return Array.from(new Set([...serverMissing, ...serviceMissing]));
}

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("funding_intents") ||
    normalized.includes("schema cache")
  );
}

async function createFundingIntentWithInvoice(options: {
  userId: string;
  amountUsd: number;
  estimatedFeeUsd: number;
  estimatedNetCreditUsd: number;
}) {
  const service = createServiceClient();
  const maxAttempts = 8;
  let lastErrorMessage = "Unable to initialize Venmo funding intent.";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const fundingIntentId = crypto.randomUUID();
    const invoiceCode = generateInvoiceCode();

    const { error } = await service.from("funding_intents").insert({
      id: fundingIntentId,
      user_id: options.userId,
      provider: "venmo",
      intent: "usd_topup",
      key: "usd_topup",
      tokens_granted: 0,
      status: "awaiting_payment",
      requested_amount_usd: options.amountUsd,
      estimated_fee_usd: options.estimatedFeeUsd,
      estimated_net_credit_usd: options.estimatedNetCreditUsd,
      invoice_code: invoiceCode,
    });

    if (!error) {
      return {
        fundingIntentId,
        invoiceCode,
      };
    }

    lastErrorMessage = error.message;
    if (error.code === "23505" && error.message.toLowerCase().includes("invoice")) {
      continue;
    }

    throw new Error(error.message);
  }

  throw new Error(lastErrorMessage);
}

export async function POST(request: Request) {
  const serverEnvReady = isSupabaseServerEnvConfigured();
  const serviceEnvReady = isSupabaseServiceEnvConfigured();

  if (!serverEnvReady || !serviceEnvReady) {
    return NextResponse.json(
      {
        error: "Venmo intent creation unavailable: missing Supabase environment variables.",
        missingEnv: mergeMissingEnv(getMissingSupabaseServerEnv(), getMissingSupabaseServiceEnv()),
      },
      { status: 503 }
    );
  }

  let body: VenmoIntentBody;
  try {
    body = (await request.json()) as VenmoIntentBody;
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

  const feeConfig = getVenmoFeeConfig();
  const estimate = {
    grossAmountUsd: amountUsd,
    feeAmountUsd: 0,
    netAmountUsd: amountUsd,
    feePercent: feeConfig.feePercent,
    feeFixedUsd: feeConfig.fixedFeeUsd,
  };

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const fundingIntent = await createFundingIntentWithInvoice({
      userId: user.id,
      amountUsd: estimate.grossAmountUsd,
      estimatedFeeUsd: estimate.feeAmountUsd,
      estimatedNetCreditUsd: estimate.netAmountUsd,
    });

    return NextResponse.json(
      {
        fundingIntentId: fundingIntent.fundingIntentId,
        invoiceCode: fundingIntent.invoiceCode,
        requiredNote: buildRequiredVenmoNote(fundingIntent.invoiceCode),
        grossAmountUsd: estimate.grossAmountUsd,
        estimatedFeeUsd: estimate.feeAmountUsd,
        estimatedNetCreditUsd: estimate.netAmountUsd,
        feePercent: estimate.feePercent,
        feeFixedUsd: estimate.feeFixedUsd,
        venmo: {
          username: getVenmoUsername(),
          payUrl: getVenmoPayUrl(),
          qrImageUrl: getVenmoQrImageUrl(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json(
      {
        error: "Unable to initialize Venmo payment intent.",
        detail,
      },
      { status: isSchemaMissingError(clean(detail)) ? 503 : 500 }
    );
  }
}
