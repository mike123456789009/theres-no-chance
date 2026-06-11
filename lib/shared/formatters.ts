export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedCurrency(value: number): string {
  if (value === 0) return formatCurrency(0);
  const absolute = formatCurrency(Math.abs(value));
  return value > 0 ? `+${absolute}` : `-${absolute}`;
}

export function formatPercent(value: number, maximumFractionDigits = 2): string {
  return `${(value * 100).toFixed(maximumFractionDigits)}%`;
}

export function formatDateTime(
  value: string | null | undefined,
  options: { missingFallback?: string; invalidFallback?: string } = {}
): string {
  const { missingFallback = "Unknown", invalidFallback = "Unknown" } = options;
  if (!value) return missingFallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return invalidFallback;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
