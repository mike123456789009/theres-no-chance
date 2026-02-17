import crypto from "node:crypto";

import { requiredEnv } from "@/lib/env";

export const COINBASE_CHARGE_INTENTS = ["token_pack"] as const;

export type CoinbaseChargeIntent = (typeof COINBASE_CHARGE_INTENTS)[number];

export type CoinbaseCatalogItem = {
  key: string;
  amountUsd: number;
  tokensGranted: number;
};

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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function parsePositiveUsd(raw: string | undefined): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function parseCoinbaseTokenPackCatalogFromEnv(): CoinbaseCatalogItem[] {
  const items: CoinbaseCatalogItem[] = [];

  Object.entries(process.env).forEach(([name, value]) => {
    if (!name.startsWith("COINBASE_PRICE_USD_PACK_")) return;

    const amountUsd = parsePositiveUsd(clean(value));
    if (amountUsd === null) return;

    const suffix = name.slice("COINBASE_PRICE_USD_PACK_".length);
    if (!suffix) return;

    const key = normalizeKey(suffix);
    const tokensGranted = toPositiveInt(process.env[`COINBASE_PACK_TOKENS_${suffix}`], 100);

    items.push({
      key,
      amountUsd,
      tokensGranted,
    });
  });

  return items.sort((a, b) => a.key.localeCompare(b.key));
}

export function getCoinbaseCatalog(intent: CoinbaseChargeIntent): CoinbaseCatalogItem[] {
  if (intent === "token_pack") {
    return parseCoinbaseTokenPackCatalogFromEnv();
  }

  return [];
}

export function getCoinbaseCatalogItem(intent: CoinbaseChargeIntent, key: string): CoinbaseCatalogItem | null {
  const normalizedKey = normalizeKey(key);
  return getCoinbaseCatalog(intent).find((item) => item.key === normalizedKey) ?? null;
}

export function parseCoinbaseChargeIntent(value: string): CoinbaseChargeIntent | null {
  if ((COINBASE_CHARGE_INTENTS as readonly string[]).includes(value)) {
    return value as CoinbaseChargeIntent;
  }
  return null;
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
  intent: CoinbaseChargeIntent;
  item: CoinbaseCatalogItem;
  userId: string;
  request: Request;
}): Promise<CoinbaseChargeResult> {
  const apiKey = requiredEnv("COINBASE_COMMERCE_API_KEY");
  const endpoint = getCoinbaseChargeCreateEndpoint();
  const baseUrl = getCoinbaseChargeBaseUrl(input.request);
  const successUrl = `${baseUrl}/portfolio?checkout=success&provider=coinbase&intent=${encodeURIComponent(
    input.intent
  )}&key=${encodeURIComponent(input.item.key)}`;
  const cancelUrl = `${baseUrl}/portfolio?checkout=cancel&provider=coinbase`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": apiKey,
      "X-CC-Version": clean(process.env.COINBASE_COMMERCE_API_VERSION) || "2018-03-22",
    },
    body: JSON.stringify({
      name: `Token Pack ${input.item.key.toUpperCase()}`,
      description: `Theres No Chance token pack (${input.item.key})`,
      pricing_type: "fixed_price",
      local_price: {
        amount: input.item.amountUsd.toFixed(2),
        currency: "USD",
      },
      redirect_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        intent: input.intent,
        key: input.item.key,
        user_id: input.userId,
        tokens_granted: String(input.item.tokensGranted),
        local_amount_usd: input.item.amountUsd.toFixed(2),
        network: "base",
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
