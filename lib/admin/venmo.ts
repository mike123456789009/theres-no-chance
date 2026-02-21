import { createServiceClient } from "@/lib/supabase/service";

import { toNumber } from "./helpers";

export type AdminVenmoReviewQueueRow = {
  id: string;
  createdAt: string;
  gmailMessageId: string;
  providerPaymentId: string;
  grossAmountUsd: number;
  computedFeeUsd: number;
  computedNetUsd: number;
  payerDisplayName: string;
  payerHandle: string;
  note: string;
  extractedInvoiceCode: string;
  errorMessage: string;
};

export type AdminVenmoUnmatchedFundingIntentRow = {
  id: string;
  createdAt: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  status: string;
  requestedAmountUsd: number;
  estimatedFeeUsd: number;
  estimatedNetCreditUsd: number;
  invoiceCode: string;
  unmatchedPaymentCount: number;
};

export async function loadAdminVenmoReviewQueue(limit = 200): Promise<{
  rows: AdminVenmoReviewQueueRow[];
  unmatchedFundingIntents: AdminVenmoUnmatchedFundingIntentRow[];
  errorMessage: string;
  fundingIntentErrorMessage: string;
}> {
  const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const service = createServiceClient();
  const { data, error } = await service
    .from("venmo_incoming_payments")
    .select(
      "id, created_at, gmail_message_id, provider_payment_id, gross_amount_usd, computed_fee_usd, computed_net_usd, payer_display_name, payer_handle, note, extracted_invoice_code, error_message"
    )
    .eq("match_status", "review_required")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      rows: [],
      unmatchedFundingIntents: [],
      errorMessage: error.message,
      fundingIntentErrorMessage: "",
    };
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: clean(row.id),
    createdAt: clean(row.created_at),
    gmailMessageId: clean(row.gmail_message_id),
    providerPaymentId: clean(row.provider_payment_id),
    grossAmountUsd: toNumber(row.gross_amount_usd as number | string | null, 0),
    computedFeeUsd: toNumber(row.computed_fee_usd as number | string | null, 0),
    computedNetUsd: toNumber(row.computed_net_usd as number | string | null, 0),
    payerDisplayName: clean(row.payer_display_name),
    payerHandle: clean(row.payer_handle),
    note: clean(row.note),
    extractedInvoiceCode: clean(row.extracted_invoice_code),
    errorMessage: clean(row.error_message),
  }));

  const reviewCountByInvoice = new Map<string, number>();
  for (const row of rows) {
    const key = row.extractedInvoiceCode;
    if (!key) continue;
    reviewCountByInvoice.set(key, (reviewCountByInvoice.get(key) ?? 0) + 1);
  }

  const { data: intentData, error: intentError } = await service
    .from("funding_intents")
    .select(
      "id, created_at, user_id, status, requested_amount_usd, estimated_fee_usd, estimated_net_credit_usd, invoice_code"
    )
    .eq("provider", "venmo")
    .in("status", ["awaiting_payment", "pending_reconciliation", "review_required", "created", "redirected"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (intentError) {
    return {
      rows,
      unmatchedFundingIntents: [],
      errorMessage: "",
      fundingIntentErrorMessage: intentError.message,
    };
  }

  const intents = (intentData ?? []) as Array<Record<string, unknown>>;
  const userIds = Array.from(new Set(intents.map((row) => clean(row.user_id)).filter((value) => value.length > 0)));

  const { data: profileData, error: profileError } = userIds.length
    ? await service.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [], error: null };

  const displayNameByUserId = new Map<string, string>();
  if (!profileError) {
    for (const profile of (profileData ?? []) as Array<{ id: string; display_name: string | null }>) {
      displayNameByUserId.set(profile.id, clean(profile.display_name));
    }
  }

  const emailByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const unresolvedUserIds = new Set(userIds);
    const maxPages = 10;
    const perPage = 200;

    for (let page = 1; page <= maxPages && unresolvedUserIds.size > 0; page += 1) {
      const { data: usersData, error: usersError } = await service.auth.admin.listUsers({
        page,
        perPage,
      });

      if (usersError) break;
      const users = usersData?.users ?? [];
      if (users.length === 0) break;

      for (const user of users) {
        if (!unresolvedUserIds.has(user.id)) continue;
        emailByUserId.set(user.id, clean(user.email));
        unresolvedUserIds.delete(user.id);
      }

      if (users.length < perPage) break;
    }
  }

  const unmatchedFundingIntents = intents.map((row) => {
    const userId = clean(row.user_id);
    const invoiceCode = clean(row.invoice_code);

    return {
      id: clean(row.id),
      createdAt: clean(row.created_at),
      userId,
      userEmail: emailByUserId.get(userId) ?? "",
      userDisplayName: displayNameByUserId.get(userId) ?? "",
      status: clean(row.status),
      requestedAmountUsd: toNumber(row.requested_amount_usd as number | string | null, 0),
      estimatedFeeUsd: toNumber(row.estimated_fee_usd as number | string | null, 0),
      estimatedNetCreditUsd: toNumber(row.estimated_net_credit_usd as number | string | null, 0),
      invoiceCode,
      unmatchedPaymentCount: invoiceCode ? reviewCountByInvoice.get(invoiceCode) ?? 0 : 0,
    };
  });

  return {
    rows,
    unmatchedFundingIntents,
    errorMessage: "",
    fundingIntentErrorMessage: "",
  };
}
