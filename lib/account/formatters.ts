import { cleanText, toNumber } from "@/lib/shared/primitives";
import {
  formatCurrency,
  formatDateTime,
  formatLabel,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/shared/formatters";

export { formatCurrency, formatLabel, formatPercent, formatSignedCurrency, toNumber };

export function formatDate(value: string): string {
  return formatDateTime(value);
}

export function displayNameFallback(email: string | null | undefined): string {
  const normalized = cleanText(email);
  if (!normalized.includes("@")) return "Trader";
  const [name] = normalized.split("@");
  return cleanText(name) || "Trader";
}
