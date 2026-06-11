import type { ErrorExtras } from "@/lib/api/http-errors";

export type RpcFailure = {
  status: number;
  error: string;
  detail?: string;
  missingEnv?: string[];
};

export function schemaMissingFromMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("schema cache")
  );
}

export function rpcFailureExtras(failure: RpcFailure): ErrorExtras {
  return {
    detail: failure.detail,
    missingEnv: failure.missingEnv,
  };
}

export function getRpcErrorDetail(
  error: {
    message?: unknown;
  } | null | undefined,
  fallback: string
): string {
  return typeof error?.message === "string" && error.message.trim() ? error.message.trim() : fallback;
}

export function parseBracketedRpcError(
  message: string,
  handlers: Record<string, Omit<RpcFailure, "detail">>,
  fallback: Omit<RpcFailure, "detail">
): RpcFailure {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[([A-Z0-9_]+)\]\s*(.*)$/);
  if (!match) {
    return {
      ...fallback,
      detail: trimmed,
    };
  }

  const detail = match[2] || fallback.error;
  return {
    ...(handlers[match[1]] ?? fallback),
    detail,
  };
}
