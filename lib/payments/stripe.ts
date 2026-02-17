import crypto from "node:crypto";

import { requiredEnv } from "@/lib/env";

export const STRIPE_CHECKOUT_INTENTS = ["token_pack", "subscription"] as const;

export type StripeCheckoutIntent = (typeof STRIPE_CHECKOUT_INTENTS)[number];

export type StripeCatalogItem = {
  key: string;
  priceId: string;
  tokensGranted: number;
};

export type StripeCheckoutSessionResult = {
  id: string;
  url: string;
};

type StripeSignatureParts = {
  timestamp: string;
  signatures: string[];
};

function clean(value: string | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function parseStripeCatalogFromEnv(options: {
  pricePrefix: string;
  tokenPrefix: string;
  defaultTokens: number;
}): StripeCatalogItem[] {
  const items: StripeCatalogItem[] = [];

  Object.entries(process.env).forEach(([name, value]) => {
    if (!name.startsWith(options.pricePrefix)) return;
    const priceId = clean(value);
    if (!priceId) return;

    const suffix = name.slice(options.pricePrefix.length);
    if (!suffix) return;

    const key = normalizeKey(suffix);
    const tokensGranted = toPositiveInt(process.env[`${options.tokenPrefix}${suffix}`], options.defaultTokens);

    items.push({
      key,
      priceId,
      tokensGranted,
    });
  });

  return items.sort((a, b) => a.key.localeCompare(b.key));
}

export function getStripeCatalog(intent: StripeCheckoutIntent): StripeCatalogItem[] {
  if (intent === "token_pack") {
    return parseStripeCatalogFromEnv({
      pricePrefix: "STRIPE_PRICE_ID_PACK_",
      tokenPrefix: "STRIPE_PACK_TOKENS_",
      defaultTokens: 100,
    });
  }

  return parseStripeCatalogFromEnv({
    pricePrefix: "STRIPE_PRICE_ID_SUB_",
    tokenPrefix: "STRIPE_PLAN_TOKENS_",
    defaultTokens: 250,
  });
}

export function getStripeCatalogItem(intent: StripeCheckoutIntent, key: string): StripeCatalogItem | null {
  const normalizedKey = normalizeKey(key);
  return getStripeCatalog(intent).find((item) => item.key === normalizedKey) ?? null;
}

export function getStripeCheckoutBaseUrl(request: Request): string {
  const configured = clean(process.env.APP_BASE_URL);
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function createStripeCheckoutSession(input: {
  intent: StripeCheckoutIntent;
  item: StripeCatalogItem;
  userId: string;
  request: Request;
}): Promise<StripeCheckoutSessionResult> {
  const secretKey = requiredEnv("STRIPE_SECRET_KEY");
  const baseUrl = getStripeCheckoutBaseUrl(input.request);
  const successUrl = `${baseUrl}/portfolio?checkout=success&intent=${encodeURIComponent(input.intent)}&key=${encodeURIComponent(
    input.item.key
  )}`;
  const cancelUrl = `${baseUrl}/portfolio?checkout=cancel`;

  const params = new URLSearchParams();
  params.set("mode", input.intent === "subscription" ? "subscription" : "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", input.userId);
  params.set("line_items[0][price]", input.item.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[intent]", input.intent);
  params.set("metadata[key]", input.item.key);
  params.set("metadata[user_id]", input.userId);
  params.set("metadata[tokens_granted]", String(input.item.tokensGranted));

  if (input.intent === "subscription") {
    params.set("subscription_data[metadata][intent]", input.intent);
    params.set("subscription_data[metadata][key]", input.item.key);
    params.set("subscription_data[metadata][user_id]", input.userId);
    params.set("subscription_data[metadata][tokens_granted]", String(input.item.tokensGranted));
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Stripe checkout session create failed: ${response.status} ${responseText}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("Stripe checkout session response was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Stripe checkout session response was malformed.");
  }

  const id = clean((parsed as { id?: string }).id);
  const url = clean((parsed as { url?: string }).url);

  if (!id || !url) {
    throw new Error("Stripe checkout session response was missing id/url.");
  }

  return { id, url };
}

function parseStripeSignatureHeader(headerValue: string): StripeSignatureParts | null {
  const timestamp = clean(
    headerValue
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.startsWith("t="))
      ?.slice(2)
  );

  const signatures = headerValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .map((value) => clean(value))
    .filter((value) => value.length > 0);

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return {
    timestamp,
    signatures,
  };
}

function timingSafeHexCompare(expectedHex: string, candidateHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(expected, candidate);
}

export function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string | null;
}): boolean {
  const secret = clean(process.env.STRIPE_WEBHOOK_SECRET);
  if (!secret) {
    throw new Error("Missing required environment variable: STRIPE_WEBHOOK_SECRET");
  }

  if (!input.signatureHeader) return false;
  const parsed = parseStripeSignatureHeader(input.signatureHeader);
  if (!parsed) return false;

  const signedPayload = `${parsed.timestamp}.${input.payload}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  return parsed.signatures.some((candidate) => timingSafeHexCompare(expectedSignature, candidate));
}

export function parseStripeIntent(value: string): StripeCheckoutIntent | null {
  if ((STRIPE_CHECKOUT_INTENTS as readonly string[]).includes(value)) {
    return value as StripeCheckoutIntent;
  }
  return null;
}
