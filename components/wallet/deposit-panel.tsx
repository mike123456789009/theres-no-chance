"use client";

import { useMemo, useState } from "react";

type DepositPanelProps = {
  minDepositUsd: number;
  maxDepositUsd: number;
  quickAmountsUsd: number[];
  venmoUsername: string;
  venmoPayUrl: string;
  venmoQrImageUrl: string;
  venmoFeePercent: number;
  venmoFeeFixedUsd: number;
};

type VenmoIntentResult = {
  fundingIntentId: string;
  invoiceCode: string;
  requiredNote: string;
  grossAmountUsd: number;
  estimatedFeeUsd: number;
  estimatedNetCreditUsd: number;
  venmo?: {
    username?: string;
    payUrl?: string;
    qrImageUrl?: string;
  };
};

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

function parseAmountInput(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function getErrorText(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  return clean(record.error) || clean(record.detail) || null;
}

function computeFeePreview(amountUsd: number, feePercent: number, fixedFeeUsd: number): {
  grossAmountUsd: number;
  feeAmountUsd: number;
  netAmountUsd: number;
} {
  const grossCents = Math.max(0, Math.round(amountUsd * 100));
  const fixedCents = Math.max(0, Math.round(fixedFeeUsd * 100));
  const feeCents = Math.min(grossCents, Math.max(0, Math.round((grossCents * feePercent) / 100 + fixedCents)));
  const netCents = Math.max(0, grossCents - feeCents);

  return {
    grossAmountUsd: grossCents / 100,
    feeAmountUsd: feeCents / 100,
    netAmountUsd: netCents / 100,
  };
}

export function DepositPanel({
  minDepositUsd,
  maxDepositUsd,
  quickAmountsUsd,
  venmoUsername,
  venmoPayUrl,
  venmoQrImageUrl,
  venmoFeePercent,
  venmoFeeFixedUsd,
}: DepositPanelProps) {
  const defaultAmount = quickAmountsUsd[0] ?? Math.max(minDepositUsd, 25);
  const [amountInput, setAmountInput] = useState<string>(defaultAmount.toFixed(2));
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [venmoIntent, setVenmoIntent] = useState<VenmoIntentResult | null>(null);
  const [copyLabel, setCopyLabel] = useState<"idle" | "copied" | "unsupported">("idle");

  const parsedAmount = useMemo(() => parseAmountInput(amountInput), [amountInput]);
  const venmoPreview = useMemo(
    () => (parsedAmount ? computeFeePreview(parsedAmount, venmoFeePercent, venmoFeeFixedUsd) : null),
    [parsedAmount, venmoFeePercent, venmoFeeFixedUsd]
  );

  async function createVenmoIntent() {
    setErrorMessage("");
    setCopyLabel("idle");
    setPendingKey("venmo");

    if (parsedAmount === null) {
      setErrorMessage("Enter a valid deposit amount.");
      setPendingKey(null);
      return;
    }

    if (parsedAmount < minDepositUsd || parsedAmount > maxDepositUsd) {
      setErrorMessage(`Amount must be between ${formatCurrency(minDepositUsd)} and ${formatCurrency(maxDepositUsd)}.`);
      setPendingKey(null);
      return;
    }

    try {
      const response = await fetch("/api/payments/venmo/intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountUsd: parsedAmount,
        }),
      });

      const result = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        setErrorMessage(getErrorText(result) ?? "Venmo intent initialization failed.");
        return;
      }

      if (!result || typeof result !== "object" || Array.isArray(result)) {
        setErrorMessage("Venmo intent returned malformed response.");
        return;
      }

      const typed = result as VenmoIntentResult;
      if (!clean(typed.invoiceCode) || !clean(typed.requiredNote) || !clean(typed.fundingIntentId)) {
        setErrorMessage("Venmo intent response is missing required fields.");
        return;
      }

      setVenmoIntent(typed);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Network error creating Venmo intent.");
    } finally {
      setPendingKey(null);
    }
  }

  async function startCoinbaseCharge() {
    setErrorMessage("");
    setPendingKey("coinbase");

    if (parsedAmount === null) {
      setErrorMessage("Enter a valid deposit amount.");
      setPendingKey(null);
      return;
    }

    if (parsedAmount < minDepositUsd || parsedAmount > maxDepositUsd) {
      setErrorMessage(`Amount must be between ${formatCurrency(minDepositUsd)} and ${formatCurrency(maxDepositUsd)}.`);
      setPendingKey(null);
      return;
    }

    try {
      const response = await fetch("/api/payments/coinbase/charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountUsd: parsedAmount,
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

      const url = clean((result as { charge?: { url?: string } }).charge?.url);
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

  async function copyRequiredNote() {
    if (!venmoIntent) return;
    if (!navigator.clipboard?.writeText) {
      setCopyLabel("unsupported");
      return;
    }

    try {
      await navigator.clipboard.writeText(venmoIntent.requiredNote);
      setCopyLabel("copied");
      setTimeout(() => setCopyLabel("idle"), 1800);
    } catch {
      setCopyLabel("unsupported");
    }
  }

  const venmoDisplay = venmoIntent?.venmo ?? {};
  const displayUsername = clean(venmoDisplay.username) || venmoUsername;
  const displayPayUrl = clean(venmoDisplay.payUrl) || venmoPayUrl;
  const displayQr = clean(venmoDisplay.qrImageUrl) || venmoQrImageUrl;

  return (
    <section className="create-section" aria-label="Deposit options">
      <h2>Deposit</h2>
      <p className="create-note">
        Deposits are credited at full gross amount. Venmo processing fee is taken when you withdraw.
      </p>

      {errorMessage ? <p className="create-note tnc-error-text">{errorMessage}</p> : null}

      <div className="deposit-amount-box">
        <label className="create-field">
          <span>Deposit amount (USD)</span>
          <input
            type="number"
            min={minDepositUsd}
            max={maxDepositUsd}
            step="0.01"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
          />
        </label>
        {quickAmountsUsd.length ? (
          <div className="deposit-quick-row" role="group" aria-label="Quick amount options">
            {quickAmountsUsd.map((amount) => (
              <button key={amount} type="button" className="create-submit create-submit-muted" onClick={() => setAmountInput(amount.toFixed(2))}>
                {formatCurrency(amount)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="deposit-panel-grid">
        <article className="deposit-provider-card">
          <h3>Venmo (manual reconciliation)</h3>
          <p className="create-note">
            Pay to @{displayUsername}. Deposit credit is posted at gross amount after note-based invoice matching.
          </p>

          <div className="venmo-mandatory-banner" role="alert" aria-live="polite">
            <p className="venmo-mandatory-title">Required: paste your generated invoice code in the Venmo note.</p>
            <p className="venmo-mandatory-copy">
              Missing or edited codes can block automatic matching and send your payment to manual review.
            </p>
          </div>
          {venmoPreview ? (
            <div className="deposit-breakdown">
              <p className="create-note">
                You pay: <strong>{formatCurrency(venmoPreview.grossAmountUsd)}</strong>
              </p>
              <p className="create-note">
                Deposit fee: <strong>{formatCurrency(0)}</strong>
              </p>
              <p className="create-note">
                You are credited: <strong>{formatCurrency(venmoPreview.grossAmountUsd)}</strong>
              </p>
              <p className="create-note">
                If withdrawn via Venmo later: <strong>{formatCurrency(venmoPreview.netAmountUsd)}</strong> after{" "}
                {formatCurrency(venmoPreview.feeAmountUsd)} fee
              </p>
            </div>
          ) : (
            <p className="create-note">Enter a valid amount to preview deposit credit and estimated Venmo withdrawal fee.</p>
          )}

          <button type="button" className="create-submit" disabled={Boolean(pendingKey)} onClick={createVenmoIntent}>
            {pendingKey === "venmo" ? "Generating..." : "Generate Venmo payment code"}
          </button>

          {venmoIntent ? (
            <div className="venmo-instructions">
              <p className="venmo-steps-title">Required steps</p>
              <ol className="venmo-steps-list">
                <li>Copy the code below.</li>
                <li>Open Venmo and send payment to @{displayUsername}.</li>
                <li>Paste the exact code into the payment note before sending.</li>
              </ol>

              <div className="venmo-note-code-wrap">
                <p className="venmo-note-code-label">Paste this exact note value</p>
                <p className="venmo-note-code">
                  <code>{venmoIntent.requiredNote}</code>
                </p>
                <p className="venmo-note-code-warning">Do not edit this code. Do not remove characters.</p>
              </div>

              <div className="venmo-instructions-actions">
                <button type="button" className="create-submit" onClick={copyRequiredNote}>
                  {copyLabel === "copied" ? "Copied" : copyLabel === "unsupported" ? "Copy unavailable" : "Copy note"}
                </button>
                <a className="create-submit" href={displayPayUrl} target="_blank" rel="noreferrer">
                  Open Venmo
                </a>
              </div>

              <img className="venmo-qr-image" src={displayQr} alt={`Venmo QR for @${displayUsername}`} />

              <p className="create-note">
                Funding intent: <code>{venmoIntent.fundingIntentId}</code>
              </p>
              <p className="create-note">
                Deposit credit: {formatCurrency(venmoIntent.grossAmountUsd)} gross / {formatCurrency(venmoIntent.estimatedFeeUsd)}{" "}
                deposit fee
              </p>
            </div>
          ) : (
            <div className="venmo-code-pending">
              <p className="create-note">
                Step 1: click <strong>Generate Venmo payment code</strong>.
              </p>
              <p className="create-note">
                Step 2: we show your required note code in a large block here.
              </p>
              <p className="create-note">
                Step 3: paste it into Venmo note exactly before sending payment.
              </p>
            </div>
          )}
        </article>

        <article className="deposit-provider-card">
          <h3>USDC (Coinbase Commerce)</h3>
          <p className="create-note">
            Coinbase deposits are credited dollar-for-dollar. No Venmo fee is applied to this provider.
          </p>
          {parsedAmount ? (
            <div className="deposit-breakdown">
              <p className="create-note">
                You pay: <strong>{formatCurrency(parsedAmount)}</strong>
              </p>
              <p className="create-note">
                Coinbase fee in app credit: <strong>{formatCurrency(0)}</strong>
              </p>
              <p className="create-note">
                You are credited: <strong>{formatCurrency(parsedAmount)}</strong>
              </p>
            </div>
          ) : (
            <p className="create-note">Enter a valid amount to continue.</p>
          )}

          <button type="button" className="create-submit" disabled={Boolean(pendingKey)} onClick={startCoinbaseCharge}>
            {pendingKey === "coinbase" ? "Starting..." : "Pay with Coinbase"}
          </button>
        </article>
      </div>
    </section>
  );
}
