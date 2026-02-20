"use client";

import { useMemo, useState } from "react";

import type { CoinbaseCatalogItem } from "@/lib/payments/coinbase";
import type { StripeCatalogItem, StripeCheckoutIntent } from "@/lib/payments/stripe";

type DepositPanelProps = {
  stripeTokenPacks: StripeCatalogItem[];
  stripeSubscriptions: StripeCatalogItem[];
  coinbaseTokenPacks: CoinbaseCatalogItem[];
};

function formatKeyLabel(key: string): string {
  return key
    .split(/[_-]+/g)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getErrorText(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  return clean(record.error) || clean(record.detail) || null;
}

export function DepositPanel({ stripeTokenPacks, stripeSubscriptions, coinbaseTokenPacks }: DepositPanelProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const hasStripe = useMemo(() => stripeTokenPacks.length > 0 || stripeSubscriptions.length > 0, [stripeTokenPacks, stripeSubscriptions]);
  const hasCoinbase = useMemo(() => coinbaseTokenPacks.length > 0, [coinbaseTokenPacks]);

  async function startStripe(intent: StripeCheckoutIntent, key: string) {
    setErrorMessage("");
    const actionKey = `stripe:${intent}:${key}`;
    setPendingKey(actionKey);

    try {
      const response = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent,
          key,
        }),
      });

      const result = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setErrorMessage(getErrorText(result) ?? "Stripe checkout initialization failed.");
        return;
      }

      if (!result || typeof result !== "object" || Array.isArray(result)) {
        setErrorMessage("Stripe checkout returned malformed response.");
        return;
      }

      const url = clean((result as any)?.checkout?.url);
      if (!url) {
        setErrorMessage("Stripe checkout did not return a redirect URL.");
        return;
      }

      window.location.assign(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Network error starting Stripe checkout.");
    } finally {
      setPendingKey(null);
    }
  }

  async function startCoinbase(key: string) {
    setErrorMessage("");
    const actionKey = `coinbase:token_pack:${key}`;
    setPendingKey(actionKey);

    try {
      const response = await fetch("/api/payments/coinbase/charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "token_pack",
          key,
        }),
      });

      const result = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setErrorMessage(getErrorText(result) ?? "Coinbase charge initialization failed.");
        return;
      }

      if (!result || typeof result !== "object" || Array.isArray(result)) {
        setErrorMessage("Coinbase charge returned malformed response.");
        return;
      }

      const url = clean((result as any)?.charge?.url);
      if (!url) {
        setErrorMessage("Coinbase charge did not return a redirect URL.");
        return;
      }

      window.location.assign(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Network error starting Coinbase charge.");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="create-section" aria-label="Deposit options">
      <h2>Deposit</h2>
      <p className="create-note">
        Fund your wallet via card (Stripe) or USDC on Base (Coinbase Commerce). Credits are applied by webhook and may take a moment.
      </p>

      {errorMessage ? (
        <p className="create-note tnc-error-text">
          {errorMessage}
        </p>
      ) : null}

      <div className="deposit-panel-grid">
        <article className="deposit-provider-card">
          <h3>Card (Stripe)</h3>
          {!hasStripe ? <p className="create-note">No Stripe products configured in environment variables.</p> : null}

          {stripeTokenPacks.length > 0 ? (
            <>
              <p className="create-note">
                Token packs
              </p>
              <div className="deposit-provider-stack">
                {stripeTokenPacks.map((item) => {
                  const actionKey = `stripe:token_pack:${item.key}`;
                  const isPending = pendingKey === actionKey;
                  return (
                    <div key={item.key} className="deposit-provider-row">
                      <div>
                        <strong>{formatKeyLabel(item.key)}</strong>
                        <div className="create-note">{item.tokensGranted} tokens</div>
                      </div>
                      <button
                        type="button"
                        className="create-submit"
                        disabled={Boolean(pendingKey)}
                        onClick={() => startStripe("token_pack", item.key)}
                      >
                        {isPending ? "Starting..." : "Checkout"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {stripeSubscriptions.length > 0 ? (
            <>
              <p className="create-note">
                Subscriptions
              </p>
              <div className="deposit-provider-stack">
                {stripeSubscriptions.map((item) => {
                  const actionKey = `stripe:subscription:${item.key}`;
                  const isPending = pendingKey === actionKey;
                  return (
                    <div key={item.key} className="deposit-provider-row">
                      <div>
                        <strong>{formatKeyLabel(item.key)}</strong>
                        <div className="create-note">{item.tokensGranted} tokens / month (configured)</div>
                      </div>
                      <button
                        type="button"
                        className="create-submit"
                        disabled={Boolean(pendingKey)}
                        onClick={() => startStripe("subscription", item.key)}
                      >
                        {isPending ? "Starting..." : "Subscribe"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </article>

        <article className="deposit-provider-card">
          <h3>USDC (Coinbase Commerce)</h3>
          {!hasCoinbase ? <p className="create-note">No Coinbase token packs configured in environment variables.</p> : null}

          {coinbaseTokenPacks.length > 0 ? (
            <div className="deposit-provider-stack">
              {coinbaseTokenPacks.map((item) => {
                const actionKey = `coinbase:token_pack:${item.key}`;
                const isPending = pendingKey === actionKey;
                return (
                  <div key={item.key} className="deposit-provider-row">
                    <div>
                      <strong>{formatKeyLabel(item.key)}</strong>
                      <div className="create-note">
                        {formatCurrency(item.amountUsd)} · {item.tokensGranted} tokens
                      </div>
                    </div>
                    <button type="button" className="create-submit" disabled={Boolean(pendingKey)} onClick={() => startCoinbase(item.key)}>
                      {isPending ? "Starting..." : "Pay with USDC"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
