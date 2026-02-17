import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";
import { parseStripeIntent, type StripeCheckoutIntent } from "@/lib/payments/stripe";

type ServiceClient = ReturnType<typeof createServiceClient>;

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type StripeWebhookProcessResult = {
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
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function formatPlanDisplayName(key: string): string {
  return key
    .split(/[_-]+/g)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
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

async function callWalletCreditRpc(options: {
  service: ServiceClient;
  userId: string;
  amount: number;
  entryType: "pack_purchase" | "subscription_grant";
  idempotencyKey: string;
  referenceTable: string;
  referenceId: string | null;
  metadata: Record<string, unknown>;
}): Promise<WalletCreditRpcResult> {
  const { data, error } = await options.service.rpc("apply_wallet_credit", {
    p_user_id: options.userId,
    p_amount: options.amount,
    p_entry_type: options.entryType,
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

async function upsertSubscriptionPlan(options: {
  service: ServiceClient;
  planKey: string;
  monthlyPriceCents: number;
  monthlyTokenGrant: number;
}): Promise<string> {
  const { data, error } = await options.service
    .from("subscription_plans")
    .upsert(
      {
        plan_key: options.planKey,
        display_name: formatPlanDisplayName(options.planKey),
        monthly_price_cents: options.monthlyPriceCents,
        monthly_token_grant: options.monthlyTokenGrant,
        active: true,
      },
      { onConflict: "plan_key" }
    )
    .select("id")
    .single();

  if (error || !data || !clean((data as { id?: string }).id)) {
    throw new Error(`Unable to upsert subscription plan: ${error?.message ?? "Unknown plan upsert failure."}`);
  }

  return (data as { id: string }).id;
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

async function processCheckoutSessionCompleted(options: {
  service: ServiceClient;
  event: StripeEvent;
}): Promise<StripeWebhookProcessResult> {
  const session = options.event.data.object;

  const sessionId = clean(session.id);
  const mode = clean(session.mode);
  const paymentStatus = clean(session.payment_status);
  const metadata = isRecord(session.metadata) ? session.metadata : {};
  const intent = parseStripeIntent(clean(metadata.intent));
  const key = clean(metadata.key);
  const userId = clean(metadata.user_id) || clean(session.client_reference_id);
  const subscriptionId = clean(session.subscription);
  const customerId = clean(session.customer);
  const amountTotalCents = parseMoneyCents(session.amount_total);
  const tokensGranted = parsePositiveInt(metadata.tokens_granted, 0);

  if (!sessionId) {
    return {
      processed: false,
      ignored: true,
      details: ["checkout.session.completed missing session id."],
    };
  }

  if (!intent || !key || !userId || tokensGranted <= 0) {
    return {
      processed: false,
      ignored: true,
      details: ["checkout.session.completed missing required metadata for ledger crediting."],
    };
  }

  if (intent === "token_pack" && paymentStatus !== "paid") {
    return {
      processed: false,
      ignored: true,
      details: [`checkout.session.completed payment status '${paymentStatus}' is not billable.`],
    };
  }

  if (intent === "subscription" && paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return {
      processed: false,
      ignored: true,
      details: [`checkout.session.completed subscription payment status '${paymentStatus}' is not billable.`],
    };
  }

  if (intent === "token_pack") {
    let purchaseId: string | null = null;

    const { data: purchaseData, error: purchaseError } = await options.service
      .from("token_pack_purchases")
      .insert({
        user_id: userId,
        pack_key: key,
        amount_paid_cents: amountTotalCents,
        tokens_granted: tokensGranted,
        stripe_session_id: sessionId,
      })
      .select("id")
      .maybeSingle();

    if (!purchaseError && purchaseData) {
      purchaseId = clean((purchaseData as { id?: string }).id);
    }

    if (purchaseError && purchaseError.code !== "23505") {
      throw new Error(`Unable to write token pack purchase receipt: ${purchaseError.message}`);
    }

    if (purchaseError && purchaseError.code === "23505") {
      const { data: existingPurchase } = await options.service
        .from("token_pack_purchases")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      purchaseId = clean((existingPurchase as { id?: string } | null)?.id);
    }

    const { ledgerEntryId, reused } = await callWalletCreditRpc({
      service: options.service,
      userId,
      amount: tokensGranted,
      entryType: "pack_purchase",
      idempotencyKey: `stripe:checkout:${sessionId}:pack_credit`,
      referenceTable: "token_pack_purchases",
      referenceId: purchaseId,
      metadata: {
        stripeEventId: options.event.id,
        stripeSessionId: sessionId,
        intent,
        key,
        tokensGranted,
      },
    });

    await writeTokenGrantIfMissing({
      service: options.service,
      userId,
      source: `stripe_pack:${key}`,
      amountTokens: tokensGranted,
      ledgerEntryId,
    });

    return {
      processed: true,
      ignored: false,
      details: [reused ? "Pack credit reused existing idempotent ledger entry." : "Pack credit applied."],
    };
  }

  const planId = await upsertSubscriptionPlan({
    service: options.service,
    planKey: key,
    monthlyPriceCents: amountTotalCents,
    monthlyTokenGrant: tokensGranted,
  });

  const resolvedStripeSubscriptionId = subscriptionId || sessionId;

  const { data: subscriptionData, error: subError } = await options.service
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        plan_id: planId,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: resolvedStripeSubscriptionId,
        status: "active",
      },
      {
        onConflict: "stripe_subscription_id",
      }
    )
    .select("id")
    .maybeSingle();

  if (subError) {
    throw new Error(`Unable to upsert user subscription: ${subError.message}`);
  }

  const subscriptionRowId = clean((subscriptionData as { id?: string } | null)?.id);
  const creditRefId = resolvedStripeSubscriptionId;

  const { ledgerEntryId, reused } = await callWalletCreditRpc({
    service: options.service,
    userId,
    amount: tokensGranted,
    entryType: "subscription_grant",
    idempotencyKey: `stripe:subscription:${creditRefId}:initial_grant`,
    referenceTable: "user_subscriptions",
    referenceId: subscriptionRowId || null,
    metadata: {
      stripeEventId: options.event.id,
      stripeSessionId: sessionId,
      stripeSubscriptionId: resolvedStripeSubscriptionId,
      intent,
      key,
      tokensGranted,
    },
  });

  await writeTokenGrantIfMissing({
    service: options.service,
    userId,
    source: `stripe_subscription:${key}`,
    amountTokens: tokensGranted,
    ledgerEntryId,
  });

  return {
    processed: true,
    ignored: false,
    details: [reused ? "Subscription grant reused existing idempotent ledger entry." : "Subscription grant applied."],
  };
}

async function processSubscriptionLifecycle(options: {
  service: ServiceClient;
  event: StripeEvent;
}): Promise<StripeWebhookProcessResult> {
  const subscription = options.event.data.object;
  const stripeSubscriptionId = clean(subscription.id);
  const status = clean(subscription.status);
  const periodEndRaw = subscription.current_period_end;
  const currentPeriodEnd = Number.isFinite(Number(periodEndRaw))
    ? new Date(Number(periodEndRaw) * 1000).toISOString()
    : null;

  if (!stripeSubscriptionId || !status) {
    return {
      processed: false,
      ignored: true,
      details: ["customer.subscription.* event missing id/status."],
    };
  }

  const { error } = await options.service
    .from("user_subscriptions")
    .update({
      status,
      current_period_end: currentPeriodEnd,
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  if (error) {
    throw new Error(`Unable to update subscription status from lifecycle event: ${error.message}`);
  }

  return {
    processed: true,
    ignored: false,
    details: ["Subscription lifecycle status updated."],
  };
}

export async function processStripeWebhookEvent(options: {
  service: SupabaseClient;
  event: StripeEvent;
}): Promise<StripeWebhookProcessResult> {
  const service = options.service as ServiceClient;

  if (options.event.type === "checkout.session.completed") {
    return processCheckoutSessionCompleted({
      service,
      event: options.event,
    });
  }

  if (options.event.type.startsWith("customer.subscription.")) {
    return processSubscriptionLifecycle({
      service,
      event: options.event,
    });
  }

  return {
    processed: false,
    ignored: true,
    details: [`Ignored unsupported Stripe event type: ${options.event.type}`],
  };
}
