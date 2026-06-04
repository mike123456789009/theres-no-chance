import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type CoinbaseWebhookEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

type CoinbaseWebhookProcessResult = {
  processed: boolean;
  ignored: boolean;
  details: string[];
};

type WalletCreditRpcResult = {
  reused: boolean;
  ledgerEntryId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseUsd(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function parseUsdFromCharge(charge: Record<string, unknown>, metadata: Record<string, unknown>): number {
  const metadataAmount = parseUsd(metadata.local_amount_usd);
  if (metadataAmount > 0) return metadataAmount;

  const pricing = isRecord(charge.pricing) ? charge.pricing : null;
  if (!pricing) return 0;

  const local = isRecord(pricing.local) ? pricing.local : null;
  if (local && clean(local.currency).toUpperCase() === "USD") {
    return parseUsd(local.amount);
  }

  const usd = isRecord(pricing.usd) ? pricing.usd : null;
  if (usd) {
    return parseUsd(usd.amount);
  }

  return 0;
}

async function resolveUserId(options: {
  service: ServiceClient;
  metadataUserId: string;
  fundingIntentId: string;
}): Promise<string | null> {
  if (options.metadataUserId) return options.metadataUserId;
  if (!options.fundingIntentId) return null;

  const { data, error } = await options.service
    .from("funding_intents")
    .select("user_id")
    .eq("id", options.fundingIntentId)
    .maybeSingle();

  if (error || !data) return null;
  return clean((data as { user_id?: string }).user_id) || null;
}

async function callWalletCreditRpc(options: {
  service: ServiceClient;
  userId: string;
  amountUsd: number;
  idempotencyKey: string;
  referenceId: string;
  metadata: Record<string, unknown>;
}): Promise<WalletCreditRpcResult> {
  const { data, error } = await options.service.rpc("apply_wallet_credit", {
    p_user_id: options.userId,
    p_amount: options.amountUsd,
    p_entry_type: "deposit",
    p_idempotency_key: options.idempotencyKey,
    p_reference_table: "deposit_receipts",
    p_reference_id: options.referenceId,
    p_metadata: options.metadata,
  });

  if (error) {
    throw new Error(`Wallet credit failed: ${error.message}`);
  }

  if (!isRecord(data)) {
    throw new Error("Wallet credit failed: malformed RPC response.");
  }

  const ledgerEntryId = clean(data.ledgerEntryId);
  if (!ledgerEntryId) {
    throw new Error("Wallet credit failed: missing ledger entry id.");
  }

  return {
    reused: data.reused === true,
    ledgerEntryId,
  };
}

async function processConfirmedCharge(options: {
  service: ServiceClient;
  event: CoinbaseWebhookEvent;
}): Promise<CoinbaseWebhookProcessResult> {
  const charge = options.event.data;

  const chargeId = clean(charge.id);
  if (!chargeId) {
    return {
      processed: false,
      ignored: true,
      details: ["Coinbase charge event missing charge id."],
    };
  }

  const metadata = isRecord(charge.metadata) ? charge.metadata : {};
  const fundingIntentId = clean(metadata.funding_intent_id) || clean(metadata.fundingIntentId);
  const metadataUserId = clean(metadata.user_id);
  const userId = await resolveUserId({
    service: options.service,
    metadataUserId,
    fundingIntentId,
  });

  const amountPaidUsd = parseUsdFromCharge(charge, metadata);
  if (!userId || amountPaidUsd <= 0) {
    return {
      processed: false,
      ignored: true,
      details: ["Coinbase charge event missing user or positive USD amount."],
    };
  }

  const paidAt = clean((charge as { confirmed_at?: unknown }).confirmed_at) || clean((charge as { timeline?: unknown }).timeline);
  const payerDisplayName = clean(metadata.payer_display_name);
  const payerHandle = clean(metadata.payer_handle);
  const note = clean(metadata.note);

  const { data: receiptData, error: receiptError } = await options.service
    .from("deposit_receipts")
    .upsert(
      {
        user_id: userId,
        funding_intent_id: fundingIntentId || null,
        provider: "coinbase",
        provider_payment_id: chargeId,
        gross_amount_usd: amountPaidUsd,
        fee_amount_usd: 0,
        net_amount_usd: amountPaidUsd,
        currency: "USD",
        payer_display_name: payerDisplayName || null,
        payer_handle: payerHandle || null,
        payment_note: note || null,
        paid_at: paidAt || null,
        source: "coinbase_webhook",
        raw_payload: charge,
      },
      {
        onConflict: "provider,provider_payment_id",
      }
    )
    .select("id")
    .single();

  if (receiptError || !receiptData) {
    throw new Error(`Unable to upsert Coinbase deposit receipt: ${receiptError?.message ?? "Unknown error."}`);
  }

  const depositReceiptId = clean((receiptData as { id?: string }).id);
  if (!depositReceiptId) {
    throw new Error("Unable to upsert Coinbase deposit receipt: missing id.");
  }

  const creditResult = await callWalletCreditRpc({
    service: options.service,
    userId,
    amountUsd: amountPaidUsd,
    idempotencyKey: `coinbase:charge:${chargeId}:deposit`,
    referenceId: depositReceiptId,
    metadata: {
      provider: "coinbase",
      coinbaseEventId: options.event.id,
      coinbaseEventType: options.event.type,
      coinbaseChargeId: chargeId,
      grossAmountUsd: amountPaidUsd,
      feeAmountUsd: 0,
      netAmountUsd: amountPaidUsd,
      fundingIntentId: fundingIntentId || null,
    },
  });

  const { error: receiptLedgerError } = await options.service
    .from("deposit_receipts")
    .update({
      ledger_entry_id: creditResult.ledgerEntryId,
    })
    .eq("id", depositReceiptId);

  if (receiptLedgerError) {
    throw new Error(`Unable to update Coinbase deposit receipt ledger link: ${receiptLedgerError.message}`);
  }

  if (fundingIntentId) {
    const { error: fundingIntentError } = await options.service
      .from("funding_intents")
      .update({
        status: "credited",
        ledger_entry_id: creditResult.ledgerEntryId,
        coinbase_charge_id: chargeId,
      })
      .eq("id", fundingIntentId)
      .eq("provider", "coinbase");

    if (fundingIntentError) {
      throw new Error(`Unable to update Coinbase funding intent: ${fundingIntentError.message}`);
    }
  }

  return {
    processed: true,
    ignored: false,
    details: [
      creditResult.reused ? "Coinbase deposit reused existing idempotent ledger entry." : "Coinbase deposit credited.",
    ],
  };
}

export async function processCoinbaseWebhookEvent(options: {
  service: SupabaseClient;
  event: CoinbaseWebhookEvent;
}): Promise<CoinbaseWebhookProcessResult> {
  const service = options.service as ServiceClient;
  const eventType = options.event.type;

  if (eventType === "charge:confirmed" || eventType === "charge:resolved") {
    return processConfirmedCharge({
      service,
      event: options.event,
    });
  }

  if (eventType === "charge:pending" || eventType === "charge:failed" || eventType === "charge:delayed") {
    return {
      processed: false,
      ignored: true,
      details: [`Ignored non-credit Coinbase event type: ${eventType}`],
    };
  }

  return {
    processed: false,
    ignored: true,
    details: [`Ignored unsupported Coinbase event type: ${eventType}`],
  };
}
