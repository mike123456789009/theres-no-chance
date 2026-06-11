import crypto from "node:crypto";

import { generateInvoiceCode } from "@/lib/payments/venmo";
import { createServiceClient } from "@/lib/supabase/service";

export function parseUsdAmount(raw: unknown): number | null {
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

export function isFundingIntentSchemaMissing(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("funding_intents") ||
    normalized.includes("schema cache")
  );
}

export async function createVenmoFundingIntentWithInvoice(options: {
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
