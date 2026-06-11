import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http-errors";
import { parseJsonBody, requireAuthenticatedUser, requireServerAndServiceEnv } from "@/lib/api/route-primitives";
import {
  createVenmoFundingIntentWithInvoice,
  isFundingIntentSchemaMissing,
  parseUsdAmount,
} from "@/lib/payments/funding-intents";
import { getDepositConfig } from "@/lib/payments/deposit-config";
import { getVenmoFeeConfig } from "@/lib/payments/venmo-fees";
import { buildRequiredVenmoNote, getVenmoPayUrl, getVenmoQrImageUrl, getVenmoUsername } from "@/lib/payments/venmo";
import { cleanText } from "@/lib/shared/primitives";

type VenmoIntentBody = {
  amountUsd?: unknown;
};

function clean(value: unknown): string {
  return cleanText(value);
}

export async function POST(request: Request) {
  const env = requireServerAndServiceEnv("Venmo intent creation unavailable: missing Supabase environment variables.");
  if (!env.ok) return env.response;

  const parsed = await parseJsonBody<VenmoIntentBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const amountUsd = parseUsdAmount(body.amountUsd);
  if (amountUsd === null) {
    return jsonError(400, "Validation failed.", { details: ["amountUsd must be a positive USD amount."] });
  }

  const depositConfig = getDepositConfig();
  if (amountUsd < depositConfig.minUsd || amountUsd > depositConfig.maxUsd) {
    return jsonError(400, "Validation failed.", {
      details: [`amountUsd must be between ${depositConfig.minUsd.toFixed(2)} and ${depositConfig.maxUsd.toFixed(2)}.`],
    });
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
    const user = await requireAuthenticatedUser();
    if (!user.ok) {
      return user.response;
    }

    const fundingIntent = await createVenmoFundingIntentWithInvoice({
      userId: user.value.id,
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
      { status: isFundingIntentSchemaMissing(clean(detail)) ? 503 : 500 }
    );
  }
}
