import { computeVenmoFeeBreakdown, isNetCreditAtLeastOneCent } from "@/lib/payments/venmo-fees";
import { extractInvoiceCodeFromNote } from "@/lib/payments/venmo";
import { getRpcErrorDetail } from "@/lib/payments/rpc-errors";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type ReconcilePaymentInput = {
  gmailMessageId?: unknown;
  venmoTransactionId?: unknown;
  amountUsd?: unknown;
  paidAt?: unknown;
  payerDisplayName?: unknown;
  payerHandle?: unknown;
  note?: unknown;
  raw?: unknown;
};

type ReconcileBody = {
  payments?: unknown;
};

type ExistingIncomingRow = {
  id: string;
  gmail_message_id: string;
  provider_payment_id: string;
  match_status: string;
  ledger_entry_id: string | null;
};

type MatchingFundingIntentRow = {
  id: string;
  user_id: string;
  requested_amount_usd: number | string | null;
  status: string;
};

export type VenmoReconcileResponse = {
  status: number;
  body: Record<string, unknown>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseUsd(raw: unknown): number | null {
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function toCents(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function parseTimestamp(raw: unknown): string | null {
  const value = clean(raw);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function isAuthorizedRequest(request: Request): boolean {
  const secret = clean(process.env.VENMO_RECONCILE_BEARER_SECRET);
  if (!secret) return false;
  const authorization = clean(request.headers.get("authorization"));
  return authorization === `Bearer ${secret}`;
}

function mergeMissingEnv(serviceMissing: string[]): string[] {
  const missing = [...serviceMissing];
  if (!clean(process.env.VENMO_RECONCILE_BEARER_SECRET)) {
    missing.push("VENMO_RECONCILE_BEARER_SECRET");
  }
  return Array.from(new Set(missing));
}

async function findExistingIncoming(options: {
  service: ReturnType<typeof createServiceClient>;
  providerPaymentId: string;
  gmailMessageId: string;
}): Promise<ExistingIncomingRow | null> {
  const byProvider = await options.service
    .from("venmo_incoming_payments")
    .select("id, gmail_message_id, provider_payment_id, match_status, ledger_entry_id")
    .eq("provider_payment_id", options.providerPaymentId)
    .maybeSingle();

  if (byProvider.data) return byProvider.data as ExistingIncomingRow;

  const byGmail = await options.service
    .from("venmo_incoming_payments")
    .select("id, gmail_message_id, provider_payment_id, match_status, ledger_entry_id")
    .eq("gmail_message_id", options.gmailMessageId)
    .maybeSingle();

  return (byGmail.data as ExistingIncomingRow | null) ?? null;
}

async function upsertIncoming(options: {
  service: ReturnType<typeof createServiceClient>;
  existing: ExistingIncomingRow | null;
  payload: Record<string, unknown>;
}) {
  if (options.existing) {
    const { error } = await options.service.from("venmo_incoming_payments").update(options.payload).eq("id", options.existing.id);
    if (error) {
      throw new Error(`Unable to update incoming Venmo payment row: ${error.message}`);
    }
    return options.existing.id;
  }

  const { data, error } = await options.service
    .from("venmo_incoming_payments")
    .insert(options.payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Unable to insert incoming Venmo payment row: ${error?.message ?? "Unknown insert error."}`);
  }

  return clean((data as { id?: string }).id);
}

async function findMatchingFundingIntent(options: {
  service: ReturnType<typeof createServiceClient>;
  invoiceCode: string;
  grossAmountCents: number;
}) {
  const { data, error } = await options.service
    .from("funding_intents")
    .select("id, user_id, requested_amount_usd, status")
    .eq("provider", "venmo")
    .eq("invoice_code", options.invoiceCode)
    .in("status", ["awaiting_payment", "pending_reconciliation", "review_required", "created", "redirected"]);

  if (error) {
    throw new Error(`Unable to load funding intent candidates: ${error.message}`);
  }

  const candidates = ((data ?? []) as MatchingFundingIntentRow[]).filter(
    (row) => toCents(row.requested_amount_usd) === options.grossAmountCents
  );
  return candidates;
}

type ApplyWalletCreditResult = {
  ledgerEntryId: string;
  reused: boolean;
};

async function applyNetWalletCredit(options: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  netAmountUsd: number;
  providerPaymentId: string;
  depositReceiptId: string;
  metadata: Record<string, unknown>;
}): Promise<ApplyWalletCreditResult> {
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
    throw new Error(`Wallet credit failed: ${getRpcErrorDetail(error, "Unknown RPC error.")}`);
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

async function insertOrUpdateDepositReceipt(options: {
  service: ReturnType<typeof createServiceClient>;
  userId: string;
  fundingIntentId: string;
  providerPaymentId: string;
  grossAmountUsd: number;
  feeAmountUsd: number;
  netAmountUsd: number;
  paidAt: string | null;
  payerDisplayName: string;
  payerHandle: string;
  note: string;
  rawPayload: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await options.service
    .from("deposit_receipts")
    .upsert(
      {
        user_id: options.userId,
        funding_intent_id: options.fundingIntentId,
        provider: "venmo",
        provider_payment_id: options.providerPaymentId,
        gross_amount_usd: options.grossAmountUsd,
        fee_amount_usd: options.feeAmountUsd,
        net_amount_usd: options.netAmountUsd,
        currency: "USD",
        payer_display_name: options.payerDisplayName || null,
        payer_handle: options.payerHandle || null,
        payment_note: options.note || null,
        paid_at: options.paidAt,
        source: "gmail_parser",
        raw_payload: options.rawPayload,
      },
      {
        onConflict: "provider,provider_payment_id",
      }
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Unable to write deposit receipt: ${error?.message ?? "Unknown receipt insert error."}`);
  }

  return clean((data as { id?: string }).id);
}

export async function handleVenmoReconcileRequest(request: Request): Promise<VenmoReconcileResponse> {
  if (!isSupabaseServiceEnvConfigured() || !clean(process.env.VENMO_RECONCILE_BEARER_SECRET)) {
    return {
      status: 503,
      body: {
        error: "Venmo reconcile API unavailable: missing environment variables.",
        missingEnv: mergeMissingEnv(getMissingSupabaseServiceEnv()),
      },
    };
  }

  if (!isAuthorizedRequest(request)) {
    return {
      status: 401,
      body: { error: "Unauthorized reconcile request." },
    };
  }

  let body: ReconcileBody;
  try {
    body = (await request.json()) as ReconcileBody;
  } catch {
    return {
      status: 400,
      body: { error: "Request body must be valid JSON." },
    };
  }

  const rawPayments = Array.isArray(body.payments) ? (body.payments as ReconcilePaymentInput[]) : [];
  if (rawPayments.length === 0) {
    return {
      status: 400,
      body: { error: "payments must be a non-empty array." },
    };
  }

  const service = createServiceClient();
  let processed = 0;
  let credited = 0;
  let reviewRequired = 0;
  let duplicates = 0;
  let errors = 0;
  let creditedNetTotalUsd = 0;

  for (const rawPayment of rawPayments) {
    try {
      const gmailMessageId = clean(rawPayment.gmailMessageId);
      const venmoTransactionId = clean(rawPayment.venmoTransactionId);
      const note = clean(rawPayment.note);
      const payerDisplayName = clean(rawPayment.payerDisplayName);
      const payerHandle = clean(rawPayment.payerHandle);
      const grossAmountUsd = parseUsd(rawPayment.amountUsd);
      const paidAt = parseTimestamp(rawPayment.paidAt);
      const rawPayload = asRecord(rawPayment.raw);

      if (!gmailMessageId || grossAmountUsd === null) {
        errors += 1;
        continue;
      }

      processed += 1;
      const providerPaymentId = venmoTransactionId || `gmail:${gmailMessageId}`;
      const feeBreakdown = computeVenmoFeeBreakdown(grossAmountUsd);
      const invoiceCode = extractInvoiceCodeFromNote(note);

      const existing = await findExistingIncoming({
        service,
        providerPaymentId,
        gmailMessageId,
      });

      if (existing && existing.match_status === "credited" && existing.ledger_entry_id) {
        duplicates += 1;
        continue;
      }

      if (!invoiceCode || !isNetCreditAtLeastOneCent(feeBreakdown)) {
        await upsertIncoming({
          service,
          existing,
          payload: {
            gmail_message_id: gmailMessageId,
            venmo_transaction_id: venmoTransactionId || null,
            provider_payment_id: providerPaymentId,
            gross_amount_usd: feeBreakdown.grossAmountUsd,
            computed_fee_usd: feeBreakdown.feeAmountUsd,
            computed_net_usd: feeBreakdown.netAmountUsd,
            currency: "USD",
            paid_at: paidAt,
            payer_display_name: payerDisplayName || null,
            payer_handle: payerHandle || null,
            note: note || null,
            extracted_invoice_code: invoiceCode,
            match_status: "review_required",
            raw_payload: rawPayload,
            error_message: invoiceCode ? "Computed net credit below one cent." : "Missing required invoice code in payment note.",
          },
        });
        reviewRequired += 1;
        continue;
      }

      const candidates = await findMatchingFundingIntent({
        service,
        invoiceCode,
        grossAmountCents: feeBreakdown.grossAmountCents,
      });

      if (candidates.length !== 1) {
        await upsertIncoming({
          service,
          existing,
          payload: {
            gmail_message_id: gmailMessageId,
            venmo_transaction_id: venmoTransactionId || null,
            provider_payment_id: providerPaymentId,
            gross_amount_usd: feeBreakdown.grossAmountUsd,
            computed_fee_usd: feeBreakdown.feeAmountUsd,
            computed_net_usd: feeBreakdown.netAmountUsd,
            currency: "USD",
            paid_at: paidAt,
            payer_display_name: payerDisplayName || null,
            payer_handle: payerHandle || null,
            note: note || null,
            extracted_invoice_code: invoiceCode,
            match_status: "review_required",
            raw_payload: rawPayload,
            error_message:
              candidates.length === 0
                ? "No funding intent matched invoice code and gross amount."
                : "Multiple funding intents matched invoice code and gross amount.",
          },
        });
        reviewRequired += 1;
        continue;
      }

      const matchedIntent = candidates[0];
      const depositReceiptId = await insertOrUpdateDepositReceipt({
        service,
        userId: matchedIntent.user_id,
        fundingIntentId: matchedIntent.id,
        providerPaymentId,
        grossAmountUsd: feeBreakdown.grossAmountUsd,
        feeAmountUsd: feeBreakdown.feeAmountUsd,
        netAmountUsd: feeBreakdown.netAmountUsd,
        paidAt,
        payerDisplayName,
        payerHandle,
        note,
        rawPayload,
      });

      const creditResult = await applyNetWalletCredit({
        service,
        userId: matchedIntent.user_id,
        netAmountUsd: feeBreakdown.netAmountUsd,
        providerPaymentId,
        depositReceiptId,
        metadata: {
          provider: "venmo",
          providerPaymentId,
          invoiceCode,
          gmailMessageId,
          venmoTransactionId: venmoTransactionId || null,
          grossAmountUsd: feeBreakdown.grossAmountUsd,
          feeAmountUsd: feeBreakdown.feeAmountUsd,
          netAmountUsd: feeBreakdown.netAmountUsd,
          feePercent: feeBreakdown.feePercent,
          feeFixedUsd: feeBreakdown.feeFixedUsd,
          payerDisplayName: payerDisplayName || null,
          payerHandle: payerHandle || null,
        },
      });

      const { error: receiptLedgerError } = await service
        .from("deposit_receipts")
        .update({
          ledger_entry_id: creditResult.ledgerEntryId,
        })
        .eq("id", depositReceiptId);

      if (receiptLedgerError) {
        throw new Error(`Unable to update deposit receipt ledger link: ${receiptLedgerError.message}`);
      }

      const { error: fundingIntentError } = await service
        .from("funding_intents")
        .update({
          status: "credited",
          ledger_entry_id: creditResult.ledgerEntryId,
          venmo_transaction_id: venmoTransactionId || null,
        })
        .eq("id", matchedIntent.id)
        .eq("provider", "venmo");

      if (fundingIntentError) {
        throw new Error(`Unable to update funding intent status: ${fundingIntentError.message}`);
      }

      await upsertIncoming({
        service,
        existing,
        payload: {
          gmail_message_id: gmailMessageId,
          venmo_transaction_id: venmoTransactionId || null,
          provider_payment_id: providerPaymentId,
          gross_amount_usd: feeBreakdown.grossAmountUsd,
          computed_fee_usd: feeBreakdown.feeAmountUsd,
          computed_net_usd: feeBreakdown.netAmountUsd,
          currency: "USD",
          paid_at: paidAt,
          payer_display_name: payerDisplayName || null,
          payer_handle: payerHandle || null,
          note: note || null,
          extracted_invoice_code: invoiceCode,
          match_status: "credited",
          matched_funding_intent_id: matchedIntent.id,
          deposit_receipt_id: depositReceiptId,
          ledger_entry_id: creditResult.ledgerEntryId,
          raw_payload: rawPayload,
          error_message: null,
        },
      });

      credited += 1;
      creditedNetTotalUsd += feeBreakdown.netAmountUsd;
    } catch {
      errors += 1;
    }
  }

  return {
    status: 200,
    body: {
      processed,
      credited,
      reviewRequired,
      duplicates,
      errors,
      creditedNetTotalUsd: Math.round(creditedNetTotalUsd * 100) / 100,
    },
  };
}
