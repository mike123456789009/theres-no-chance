import crypto from "node:crypto";

import { requiredEnv } from "@/lib/env";

export type CoinbaseChargeResult = {
  id: string;
  code: string;
  hostedUrl: string;
  expiresAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getCoinbaseChargeCreateEndpoint(): string {
  const configured = clean(process.env.COINBASE_COMMERCE_API_URL);
  if (!configured) {
    return "https://api.commerce.coinbase.com/charges";
  }

  if (configured.endsWith("/charges")) {
    return configured;
  }

  return `${configured.replace(/\/$/, "")}/charges`;
}

export function getCoinbaseChargeBaseUrl(request: Request): string {
  const configured = clean(process.env.APP_BASE_URL);
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function unwrapCoinbaseChargeResponse(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.data)) return value.data;
  return value;
}

export async function createCoinbaseCharge(input: {
  amountUsd: number;
  userId: string;
  request: Request;
  fundingIntentId: string;
}): Promise<CoinbaseChargeResult> {
  const apiKey = requiredEnv("COINBASE_COMMERCE_API_KEY");
  const endpoint = getCoinbaseChargeCreateEndpoint();
  const baseUrl = getCoinbaseChargeBaseUrl(input.request);
  const successUrl = `${baseUrl}/account/wallet?checkout=success&provider=coinbase&intent=usd_topup&funding_intent_id=${encodeURIComponent(
    input.fundingIntentId
  )}`;
  const cancelUrl = `${baseUrl}/account/wallet?checkout=cancel&provider=coinbase&funding_intent_id=${encodeURIComponent(input.fundingIntentId)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": apiKey,
      "X-CC-Version": clean(process.env.COINBASE_COMMERCE_API_VERSION) || "2018-03-22",
    },
    body: JSON.stringify({
      name: "USD Wallet Deposit",
      description: "Theres No Chance account funding",
      pricing_type: "fixed_price",
      local_price: {
        amount: input.amountUsd.toFixed(2),
        currency: "USD",
      },
      redirect_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        intent: "usd_topup",
        user_id: input.userId,
        local_amount_usd: input.amountUsd.toFixed(2),
        funding_intent_id: input.fundingIntentId,
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Coinbase charge create failed: ${response.status} ${responseText}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("Coinbase charge response was not valid JSON.");
  }

  const charge = unwrapCoinbaseChargeResponse(parsed);
  if (!charge) {
    throw new Error("Coinbase charge response was malformed.");
  }

  const id = clean(charge.id);
  const code = clean(charge.code);
  const hostedUrl = clean(charge.hosted_url);
  const expiresAtRaw = clean(charge.expires_at);
  const expiresAt = expiresAtRaw || null;

  if (!id || !code || !hostedUrl) {
    throw new Error("Coinbase charge response was missing id/code/hosted_url.");
  }

  return {
    id,
    code,
    hostedUrl,
    expiresAt,
  };
}

function parseWebhookSignature(signatureHeader: string): string {
  const normalized = signatureHeader.split(",")[0]?.trim() ?? "";
  if (normalized.toLowerCase().startsWith("sha256=")) {
    return normalized.slice("sha256=".length).trim().toLowerCase();
  }
  return normalized.toLowerCase();
}

function timingSafeHexCompare(expectedHex: string, candidateHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(expectedHex) || !/^[a-f0-9]+$/i.test(candidateHex)) {
    return false;
  }

  const expected = Buffer.from(expectedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(expected, candidate);
}

export function verifyCoinbaseWebhookSignature(input: {
  payload: string;
  signatureHeader: string | null;
}): boolean {
  const secret = clean(process.env.COINBASE_COMMERCE_WEBHOOK_SECRET);
  if (!secret) {
    throw new Error("Missing required environment variable: COINBASE_COMMERCE_WEBHOOK_SECRET");
  }

  if (!input.signatureHeader) return false;
  const parsedSignature = parseWebhookSignature(input.signatureHeader);
  if (!parsedSignature) return false;

  const expectedSignature = crypto.createHmac("sha256", secret).update(input.payload, "utf8").digest("hex");
  return timingSafeHexCompare(expectedSignature, parsedSignature);
}
