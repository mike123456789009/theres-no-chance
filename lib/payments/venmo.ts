import crypto from "node:crypto";

const DEFAULT_VENMO_USERNAME = "TheresNoChance";
const DEFAULT_VENMO_QR_IMAGE_URL = "/assets/payments/venmo-theres-no-chance-qr.png";
const INVOICE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function randomAlphabetString(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += INVOICE_ALPHABET[bytes[index] % INVOICE_ALPHABET.length];
  }
  return result;
}

export function getVenmoUsername(): string {
  return clean(process.env.VENMO_USERNAME) || DEFAULT_VENMO_USERNAME;
}

export function getVenmoQrImageUrl(): string {
  return clean(process.env.VENMO_PUBLIC_QR_PATH) || DEFAULT_VENMO_QR_IMAGE_URL;
}

export function getVenmoPayUrl(): string {
  const configured = clean(process.env.VENMO_PAYMENT_URL);
  if (configured) return configured;
  return `https://account.venmo.com/u/${encodeURIComponent(getVenmoUsername())}`;
}

export function generateInvoiceCode(): string {
  return `VC-${randomAlphabetString(6)}`;
}

export function buildRequiredVenmoNote(invoiceCode: string): string {
  return invoiceCode;
}

export function extractInvoiceCodeFromNote(note: string): string | null {
  const match = note.toUpperCase().match(/\bVC-[A-HJ-NP-Z2-9]{6}\b/);
  if (!match) return null;
  return match[0];
}
