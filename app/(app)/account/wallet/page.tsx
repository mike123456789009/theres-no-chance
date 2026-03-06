import Link from "next/link";

import { DepositPanel } from "@/components/wallet/deposit-panel";
import { DepositStatusBanner } from "@/components/wallet/deposit-status-banner";
import { LedgerTable } from "@/components/wallet/ledger-table";
import { getDepositConfig } from "@/lib/payments/deposit-config";
import { getVenmoFeeConfig } from "@/lib/payments/venmo-fees";
import { getVenmoPayUrl, getVenmoQrImageUrl, getVenmoUsername } from "@/lib/payments/venmo";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

type WalletAccountRow = {
  available_balance: number | string | null;
  reserved_balance: number | string | null;
} | null;

type LedgerEntryRow = {
  id: string;
  entry_type: string;
  amount: number | string | null;
  currency: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type FundingIntentRow = {
  id: string;
  provider: string;
  intent: string;
  key: string;
  tokens_granted: number | null;
  requested_amount_usd: number | string | null;
  estimated_fee_usd: number | string | null;
  estimated_net_credit_usd: number | string | null;
  invoice_code: string | null;
  status: string;
  ledger_entry_id: string | null;
  created_at: string;
  updated_at: string;
} | null;

function toUrlSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim().length > 0);
      if (first) params.set(key, first);
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      params.set(key, value);
    }
  }
  return params;
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function isFundingIntentSchemaMissing(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("relation") && normalized.includes("funding_intents")) ||
    normalized.includes("could not find the table") ||
    normalized.includes("schema cache")
  );
}

export default async function WalletPage({ searchParams }: Readonly<{ searchParams?: SearchParamsInput }>) {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return (
      <section className="account-panel account-panel-warning" aria-label="Wallet configuration error">
        <p className="create-kicker">Wallet</p>
        <h1 className="create-title">Wallet Unavailable</h1>
        <p className="create-copy">Configure Supabase server environment values before loading wallet data.</p>
        <p className="create-copy">
          Missing env vars: <code>{missingEnv.join(", ")}</code>
        </p>
        <p className="create-copy">
          Continue to <a href="/">home</a>
        </p>
      </section>
    );
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const params = toUrlSearchParams(resolvedSearchParams);
  const checkoutState = clean(params.get("checkout")).toLowerCase();
  const fundingIntentId = clean(params.get("funding_intent_id"));

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return (
      <section className="account-panel" aria-label="Wallet login required">
        <p className="create-kicker">Wallet</p>
        <h1 className="create-title">Log in to view wallet</h1>
        <p className="create-copy">Wallet balances, deposits, and ledger history require an authenticated account.</p>
        <div className="create-actions account-actions-top">
          <Link className="create-submit create-submit-muted" href="/login">
            Log in
          </Link>
          <Link className="create-submit" href="/signup">
            Create account
          </Link>
          <Link className="create-submit create-submit-muted" href="/markets">
            Back to markets
          </Link>
        </div>
      </section>
    );
  }

  const depositConfig = getDepositConfig();
  const venmoFeeConfig = getVenmoFeeConfig();

  let wallet: { cashUsd: number; reservedUsd: number; totalUsd: number } = { cashUsd: 0, reservedUsd: 0, totalUsd: 0 };
  let ledgerEntries: Array<{ id: string; entryType: string; amount: number; currency: string; createdAt: string; metadata: Record<string, unknown> }> = [];
  let fundingIntent: FundingIntentRow = null;
  let fundingIntentError: string | null = null;

  const { data: walletData, error: walletError } = await supabase
    .from("wallet_accounts")
    .select("available_balance, reserved_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!walletError) {
    const walletRow = walletData as WalletAccountRow;
    const cashUsd = Math.max(0, toNumber(walletRow?.available_balance, 0));
    const reservedUsd = Math.max(0, toNumber(walletRow?.reserved_balance, 0));
    wallet = {
      cashUsd,
      reservedUsd,
      totalUsd: cashUsd + reservedUsd,
    };
  }

  const { data: ledgerData, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select("id, entry_type, amount, currency, created_at, metadata")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!ledgerError) {
    const rows = (ledgerData ?? []) as LedgerEntryRow[];
    ledgerEntries = rows.map((row) => ({
      id: row.id,
      entryType: row.entry_type,
      amount: toNumber(row.amount, 0),
      currency: clean(row.currency) || "USD",
      createdAt: row.created_at,
      metadata: row.metadata ?? {},
    }));
  }

  if (fundingIntentId) {
    const { data: fundingData, error: fundingError } = await supabase
      .from("funding_intents")
      .select(
        "id, provider, intent, key, tokens_granted, requested_amount_usd, estimated_fee_usd, estimated_net_credit_usd, invoice_code, status, ledger_entry_id, created_at, updated_at"
      )
      .eq("id", fundingIntentId)
      .maybeSingle();

    if (fundingError) {
      if (!isFundingIntentSchemaMissing(fundingError.message)) {
        fundingIntentError = fundingError.message;
      }
    } else {
      fundingIntent = fundingData as FundingIntentRow;
    }
  }

  let banner: { kind: "pending" | "credited" | "canceled" | "unknown"; title: string; detail: string; showRefresh?: boolean } | null =
    null;

  if (checkoutState === "cancel") {
    banner = {
      kind: "canceled",
      title: "Deposit canceled",
      detail: "No funds were credited. You can try again any time.",
    };
  } else if (checkoutState === "success") {
    if (!fundingIntentId) {
      banner = {
        kind: "unknown",
        title: "Deposit started",
        detail:
          "Return confirmed. Waiting for credit confirmation. This deposit is missing a funding_intent_id; refresh in a moment.",
        showRefresh: true,
      };
    } else if (fundingIntentError) {
      banner = {
        kind: "unknown",
        title: "Deposit status unavailable",
        detail: `Unable to load funding intent status: ${fundingIntentError}`,
        showRefresh: true,
      };
    } else if (!fundingIntent) {
      banner = {
        kind: "unknown",
        title: "Deposit status pending",
        detail: "Deposit record not found yet. Refresh in a moment while matching completes.",
        showRefresh: true,
      };
    } else if (fundingIntent.status === "credited") {
      const gross = toNumber(fundingIntent.requested_amount_usd, 0);
      banner = {
        kind: "credited",
        title: "Deposit credited",
        detail: `Deposit credited ${formatCurrency(gross)}. Venmo withdrawal fee applies when cashing out. Funding intent id: ${
          fundingIntent.id
        }${fundingIntent.invoice_code ? ` · invoice ${fundingIntent.invoice_code}` : ""}`,
      };
    } else {
      const gross = toNumber(fundingIntent.requested_amount_usd, 0);
      banner = {
        kind: "pending",
        title: "Deposit pending",
        detail: `Deposit is still pending credit for ${formatCurrency(gross)}. Venmo withdrawal fee applies when cashing out. Refresh in a moment${
          fundingIntent.invoice_code ? ` · invoice ${fundingIntent.invoice_code}` : ""
        }.`,
        showRefresh: true,
      };
    }
  }

  return (
    <section className="account-panel" aria-label="Wallet overview">
      <p className="create-kicker">Wallet</p>
      <h1 className="create-title">Balances + deposits</h1>
      <p className="create-copy">View wallet balances, deposit methods, and your most recent ledger entries.</p>
      <p className="create-note">Venmo deposits are credited at gross amount. Venmo processing fee is applied when you withdraw.</p>

      <div className="create-actions account-actions-top">
        <Link className="create-submit create-submit-muted" href="/markets">
          Back to markets
        </Link>
        <Link className="create-submit create-submit-muted" href="/account/portfolio">
          Portfolio
        </Link>
        <Link className="create-submit create-submit-muted" href="/account/settings">
          Settings
        </Link>
      </div>

      {banner ? <DepositStatusBanner {...banner} /> : null}

      <section className="create-section account-summary-grid" aria-label="Wallet balances">
        <div>
          <p className="create-note">Available</p>
          <h2>{formatCurrency(wallet.cashUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Reserved</p>
          <h2>{formatCurrency(wallet.reservedUsd)}</h2>
        </div>
        <div>
          <p className="create-note">Total</p>
          <h2>{formatCurrency(wallet.totalUsd)}</h2>
        </div>
      </section>

      {walletError ? (
        <p className="create-note tnc-error-text">
          Unable to load wallet balances: <code>{walletError.message}</code>
        </p>
      ) : null}

      <DepositPanel
        minDepositUsd={depositConfig.minUsd}
        maxDepositUsd={depositConfig.maxUsd}
        quickAmountsUsd={depositConfig.quickAmountsUsd}
        venmoUsername={getVenmoUsername()}
        venmoPayUrl={getVenmoPayUrl()}
        venmoQrImageUrl={getVenmoQrImageUrl()}
        venmoFeePercent={venmoFeeConfig.feePercent}
        venmoFeeFixedUsd={venmoFeeConfig.fixedFeeUsd}
      />

      <section className="create-section" aria-label="Recent ledger entries">
        <h2>Recent ledger entries</h2>
        {ledgerError ? (
          <p className="create-note tnc-error-text">
            Unable to load ledger entries: <code>{ledgerError.message}</code>
          </p>
        ) : (
          <LedgerTable entries={ledgerEntries} />
        )}
      </section>
    </section>
  );
}
