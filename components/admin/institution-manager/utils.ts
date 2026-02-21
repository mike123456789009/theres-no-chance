function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: string | null | undefined): string {
  const normalized = clean(value);
  if (!normalized) return "N/A";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function toErrorMessage(payload: { error?: string; detail?: string } | null, fallback: string): string {
  const detail = clean(payload?.detail);
  const error = clean(payload?.error);
  if (detail) return detail;
  if (error) return error;
  return fallback;
}

function normalizeDomainDraft(value: string): string {
  return value.trim().toLowerCase();
}

function shortId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export { clean, formatDate, normalizeDomainDraft, shortId, toErrorMessage };
