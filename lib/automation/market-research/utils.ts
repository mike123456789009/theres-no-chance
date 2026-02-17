export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function toHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeTag(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeStringList(values: unknown, maxItems: number): string[] {
  if (!Array.isArray(values)) return [];
  const next = values
    .map((item) => (typeof item === "string" ? normalizeTag(item) : ""))
    .filter((item) => item.length > 0);
  return Array.from(new Set(next)).slice(0, maxItems);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeFingerprint(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s|:_-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 220);
}

export function fallbackFingerprint(seed: {
  question: string;
  category: string;
  closeTime: string;
  scopeKey: string;
}): string {
  const closeDate = new Date(seed.closeTime);
  const closeBucket = Number.isNaN(closeDate.getTime()) ? "unknown-time" : closeDate.toISOString().slice(0, 10);
  return normalizeFingerprint(`${seed.scopeKey}|${seed.category}|${seed.question}|${closeBucket}`);
}

export type RunDeadline = {
  startedAt: number;
  timeoutMs: number;
  timeRemainingMs: () => number;
  throwIfExpired: (label: string) => void;
};

export function createRunDeadline(timeoutMs: number): RunDeadline {
  const startedAt = Date.now();
  return {
    startedAt,
    timeoutMs,
    timeRemainingMs: () => Math.max(0, startedAt + timeoutMs - Date.now()),
    throwIfExpired: (label: string) => {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Run timeout exceeded while ${label}.`);
      }
    },
  };
}
