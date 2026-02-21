import { NextResponse } from "next/server";

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type MatchBody = {
  incomingPaymentId?: unknown;
  fundingIntentId?: unknown;
};

type WalletCreditRpcResult = {
  ledgerEntryId: string;
  reused: boolean;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseUsd(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function toCents(value: unknown): number {
  return Math.round(parseUsd(value) * 100);
}

async function callWalletCreditRpc(options: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  netAmountUsd: number;
  providerPaymentId: string;
  depositReceiptId: string;
  metadata: Record<string, unknown>;
}): Promise<WalletCreditRpcResult> {
  const { data, error } = await options.service.rpc("apply_wallet_credit", {
    p_user_id: options.userId,
    p_amount: options.netAmountUsd,
    p_entry_type: "deposit",
    p_idempotency_key: `venmo:payment:${options.providerPaymentId}:deposit`,
    p_reference_table: "deposit_receipts",
    p_reference_id: options.depositReceiptId,
    p_metadata: options.metadata,
  });

  if (error) {
    throw new Error(`Wallet credit failed: ${error.message}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Wallet credit failed: malformed RPC response.");
  }

  const ledgerEntryId = clean((data as { ledgerEntryId?: unknown }).ledgerEntryId);
  if (!ledgerEntryId) {
    throw new Error("Wallet credit failed: missing ledger entry id.");
  }

  return {
    ledgerEntryId,
    reused: (data as { reused?: unknown }).reused === true,
  };
}

export async function POST(request: Request) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Manual Venmo matching unavailable: missing service environment variables.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  let body: MatchBody;
  try {
    body = (await request.json()) as MatchBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const incomingPaymentId = clean(body.incomingPaymentId);
  const fundingIntentId = clean(body.fundingIntentId);
  if (!incomingPaymentId || !fundingIntentId) {
    return NextResponse.json(
      {
        error: "incomingPaymentId and fundingIntentId are required.",
      },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: incomingData, error: incomingError } = await service
    .from("venmo_incoming_payments")
    .select("id, gmail_message_id, venmo_transaction_id, provider_payment_id, gross_amount_usd, note, payer_display_name, payer_handle, match_status")
    .eq("id", incomingPaymentId)
    .maybeSingle();

  if (incomingError || !incomingData) {
    return NextResponse.json({ error: "Incoming payment row not found." }, { status: 404 });
  }

  const incoming = incomingData as Record<string, unknown>;
  const matchStatus = clean(incoming.match_status);
  if (matchStatus === "credited") {
    return NextResponse.json({ message: "Incoming payment is already credited.", duplicate: true }, { status: 200 });
  }

  const { data: intentData, error: intentError } = await service
    .from("funding_intents")
    .select("id, user_id, provider, status, requested_amount_usd, invoice_code")
    .eq("id", fundingIntentId)
    .maybeSingle();

  if (intentError || !intentData) {
    return NextResponse.json({ error: "Funding intent not found." }, { status: 404 });
  }

  const intent = intentData as Record<string, unknown>;
  if (clean(intent.provider) !== "venmo") {
    return NextResponse.json({ error: "Funding intent provider must be venmo." }, { status: 400 });
  }

  const grossAmountUsd = parseUsd(incoming.gross_amount_usd);
  const expectedAmountUsd = parseUsd(intent.requested_amount_usd);
  if (toCents(grossAmountUsd) !== toCents(expectedAmountUsd)) {
    return NextResponse.json(
      {
        error: "Funding intent gross amount does not match incoming payment gross amount.",
      },
      { status: 409 }
    );
  }

  const creditedAmountUsd = grossAmountUsd;
  const appliedFeeUsd = 0;

  const providerPaymentId = clean(incoming.provider_payment_id);
  const { data: receiptData, error: receiptError } = await service
    .from("deposit_receipts")
    .upsert(
      {
        user_id: clean(intent.user_id),
        funding_intent_id: clean(intent.id),
        provider: "venmo",
        provider_payment_id: providerPaymentId,
        gross_amount_usd: creditedAmountUsd,
        fee_amount_usd: appliedFeeUsd,
        net_amount_usd: creditedAmountUsd,
        currency: "USD",
        payer_display_name: clean(incoming.payer_display_name) || null,
        payer_handle: clean(incoming.payer_handle) || null,
        payment_note: clean(incoming.note) || null,
        source: "admin_manual_match",
      },
      {
        onConflict: "provider,provider_payment_id",
      }
    )
    .select("id")
    .single();

  if (receiptError || !receiptData?.id) {
    return NextResponse.json(
      {
        error: `Unable to create deposit receipt: ${receiptError?.message ?? "Unknown receipt error."}`,
      },
      { status: 500 }
    );
  }

  const depositReceiptId = clean((receiptData as { id?: unknown }).id);

  try {
    const creditResult = await callWalletCreditRpc({
      service,
      userId: clean(intent.user_id),
      netAmountUsd: creditedAmountUsd,
      providerPaymentId,
      depositReceiptId,
      metadata: {
        provider: "venmo",
        fundingIntentId: clean(intent.id),
        invoiceCode: clean(intent.invoice_code),
        gmailMessageId: clean(incoming.gmail_message_id),
        venmoTransactionId: clean(incoming.venmo_transaction_id) || null,
        grossAmountUsd: creditedAmountUsd,
        feeAmountUsd: appliedFeeUsd,
        netAmountUsd: creditedAmountUsd,
        matchedByAdminId: auth.adminUser.id,
        withdrawalFeeApplied: true,
      },
    });

    await service.from("deposit_receipts").update({ ledger_entry_id: creditResult.ledgerEntryId }).eq("id", depositReceiptId);

    await service
      .from("funding_intents")
      .update({
        status: "credited",
        ledger_entry_id: creditResult.ledgerEntryId,
        venmo_transaction_id: clean(incoming.venmo_transaction_id) || null,
      })
      .eq("id", clean(intent.id))
      .eq("provider", "venmo");

    await service
      .from("venmo_incoming_payments")
      .update({
        computed_fee_usd: appliedFeeUsd,
        computed_net_usd: creditedAmountUsd,
        match_status: "credited",
        matched_funding_intent_id: clean(intent.id),
        deposit_receipt_id: depositReceiptId,
        ledger_entry_id: creditResult.ledgerEntryId,
        error_message: null,
      })
      .eq("id", incomingPaymentId);

    return NextResponse.json({
      message: creditResult.reused ? "Manual match reused existing idempotent credit." : "Manual match credited successfully.",
      ledgerEntryId: creditResult.ledgerEntryId,
      depositReceiptId,
      netAmountUsd: creditedAmountUsd,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to complete manual match.",
      },
      { status: 500 }
    );
  }
}
