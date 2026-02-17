import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCoinbaseChargeIntent } from "@/lib/payments/coinbase";
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
  walletAccountId: string;
  walletAvailableBalance: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseMoneyCents(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function parseUsdCentsFromCharge(charge: Record<string, unknown>, metadata: Record<string, unknown>): number {
  const metadataAmount = parseMoneyCents(metadata.local_amount_usd);
  if (metadataAmount > 0) return metadataAmount;

  const pricing = isRecord(charge.pricing) ? charge.pricing : null;
  if (!pricing) return 0;

  const local = isRecord(pricing.local) ? pricing.local : null;
  if (local && clean(local.currency).toUpperCase() === "USD") {
    return parseMoneyCents(local.amount);
  }

  const usd = isRecord(pricing.usd) ? pricing.usd : null;
  if (usd) {
    return parseMoneyCents(usd.amount);
  }

  return 0;
}

function isFundingIntentsSchemaMissing(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("relation") && normalized.includes("funding_intents")) ||
    normalized.includes("could not find the table") ||
    normalized.includes("schema cache")
  );
}

async function markFundingIntentCredited(options: {
  service: ServiceClient;
  provider: "coinbase";
  fundingIntentId: string | null;
  coinbaseChargeId: string;
  userId: string;
  ledgerEntryId: string;
}): Promise<string | null> {
  try {
    const updatePayload = {
      status: "credited",
      ledger_entry_id: options.ledgerEntryId,
      coinbase_charge_id: options.coinbaseChargeId,
    };

    let request = options.service.from("funding_intents").update(updatePayload).eq("provider", options.provider);

    if (options.fundingIntentId) {
      request = request.eq("id", options.fundingIntentId).eq("user_id", options.userId);
    } else {
      request = request.eq("coinbase_charge_id", options.coinbaseChargeId);
    }

    const { data, error } = await request.select("id").maybeSingle();
    if (error) {
      if (isFundingIntentsSchemaMissing(error.message)) return null;
      return `Funding intent update failed: ${error.message}`;
    }

    if (!data) {
      return "Funding intent not found to mark credited.";
    }

    return "Funding intent marked credited.";
  } catch (error) {
    return error instanceof Error ? `Funding intent update failed: ${error.message}` : "Funding intent update failed.";
  }
}

async function getExistingTokenGrant(options: {
  service: ServiceClient;
  ledgerEntryId: string;
}): Promise<boolean> {
  const { data, error } = await options.service
    .from("token_grants")
    .select("id")
    .eq("ledger_entry_id", options.ledgerEntryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

async function writeTokenGrantIfMissing(options: {
  service: ServiceClient;
  userId: string;
  source: string;
  amountTokens: number;
  ledgerEntryId: string;
}): Promise<void> {
  const exists = await getExistingTokenGrant({
    service: options.service,
    ledgerEntryId: options.ledgerEntryId,
  });

  if (exists) return;

  const { error } = await options.service.from("token_grants").insert({
    user_id: options.userId,
    source: options.source,
    amount_tokens: options.amountTokens,
    ledger_entry_id: options.ledgerEntryId,
  });

  if (error) {
    throw new Error(`Unable to write token grant: ${error.message}`);
  }
}

async function callWalletCreditRpc(options: {
  service: ServiceClient;
  userId: string;
  amount: number;
  idempotencyKey: string;
  referenceTable: string;
  referenceId: string | null;
  metadata: Record<string, unknown>;
}): Promise<WalletCreditRpcResult> {
  const { data, error } = await options.service.rpc("apply_wallet_credit", {
    p_user_id: options.userId,
    p_amount: options.amount,
    p_entry_type: "pack_purchase",
    p_idempotency_key: options.idempotencyKey,
    p_reference_table: options.referenceTable,
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
  const walletAccountId = clean(data.walletAccountId);
  const walletAvailableBalance = Number(data.walletAvailableBalance);
  const reused = data.reused === true;

  if (!ledgerEntryId || !walletAccountId || !Number.isFinite(walletAvailableBalance)) {
    throw new Error("Wallet credit failed: incomplete RPC response.");
  }

  return {
    reused,
    ledgerEntryId,
    walletAccountId,
    walletAvailableBalance,
  };
}

async function processConfirmedCharge(options: {
  service: ServiceClient;
  event: CoinbaseWebhookEvent;
}): Promise<CoinbaseWebhookProcessResult> {
  const charge = options.event.data;

  const chargeId = clean(charge.id);
  const chargeCode = clean(charge.code);
  const metadata = isRecord(charge.metadata) ? charge.metadata : {};
  const intent = parseCoinbaseChargeIntent(clean(metadata.intent));
  const key = clean(metadata.key);
  const userId = clean(metadata.user_id);
  const tokensGranted = parsePositiveInt(metadata.tokens_granted, 0);
  const amountPaidCents = parseUsdCentsFromCharge(charge, metadata);
  const fundingIntentId = clean(metadata.funding_intent_id) || clean(metadata.fundingIntentId);

  if (!chargeId) {
    return {
      processed: false,
      ignored: true,
      details: ["Coinbase charge event missing charge id."],
    };
  }

  if (!intent || !key || !userId || tokensGranted <= 0) {
    return {
      processed: false,
      ignored: true,
      details: ["Coinbase charge event missing required metadata for wallet crediting."],
    };
  }

  let purchaseId: string | null = null;

  const { data: purchaseData, error: purchaseError } = await options.service
    .from("token_pack_purchases")
    .insert({
      user_id: userId,
      pack_key: key,
      amount_paid_cents: amountPaidCents,
      tokens_granted: tokensGranted,
      coinbase_charge_id: chargeId,
    })
    .select("id")
    .maybeSingle();

  if (!purchaseError && purchaseData) {
    purchaseId = clean((purchaseData as { id?: string }).id);
  }

  if (purchaseError && purchaseError.code !== "23505") {
    throw new Error(`Unable to write Coinbase token pack receipt: ${purchaseError.message}`);
  }

  if (purchaseError && purchaseError.code === "23505") {
    const { data: existingPurchase, error: existingPurchaseError } = await options.service
      .from("token_pack_purchases")
      .select("id")
      .eq("coinbase_charge_id", chargeId)
      .maybeSingle();

    if (existingPurchaseError) {
      throw new Error(`Unable to load existing Coinbase token pack receipt: ${existingPurchaseError.message}`);
    }

    purchaseId = clean((existingPurchase as { id?: string } | null)?.id);
  }

  const { ledgerEntryId, reused } = await callWalletCreditRpc({
    service: options.service,
    userId,
    amount: tokensGranted,
    idempotencyKey: `coinbase:charge:${chargeId}:pack_credit`,
    referenceTable: "token_pack_purchases",
    referenceId: purchaseId,
    metadata: {
      coinbaseEventId: options.event.id,
      coinbaseEventType: options.event.type,
      coinbaseChargeId: chargeId,
      coinbaseChargeCode: chargeCode || null,
      intent,
      key,
      tokensGranted,
      network: "base",
      fundingIntentId: fundingIntentId || null,
    },
  });

  await writeTokenGrantIfMissing({
    service: options.service,
    userId,
    source: `coinbase_pack:${key}`,
    amountTokens: tokensGranted,
    ledgerEntryId,
  });

  const fundingIntentNote = await markFundingIntentCredited({
    service: options.service,
    provider: "coinbase",
    fundingIntentId: fundingIntentId || null,
    coinbaseChargeId: chargeId,
    userId,
    ledgerEntryId,
  });

  return {
    processed: true,
    ignored: false,
    details: [
      reused ? "Coinbase pack credit reused existing idempotent ledger entry." : "Coinbase pack credit applied.",
      ...(fundingIntentNote ? [fundingIntentNote] : []),
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
