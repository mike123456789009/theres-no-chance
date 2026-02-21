type RpcErrorMapping = {
  status: number;
  error: string;
};

type ParseBracketedRpcErrorOptions = {
  message: string;
  mapping: Record<string, RpcErrorMapping>;
  fallback: RpcErrorMapping;
};

export type ParsedBracketedRpcError = {
  status: number;
  error: string;
  detail: string;
  code: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getRpcErrorDetail(
  error: {
    message?: unknown;
  } | null | undefined,
  fallback: string
): string {
  return clean(error?.message) || fallback;
}

export function parseBracketedRpcError(options: ParseBracketedRpcErrorOptions): ParsedBracketedRpcError {
  const trimmed = clean(options.message);
  const match = trimmed.match(/^\[([A-Z0-9_]+)\]\s*(.*)$/);

  if (!match) {
    return {
      status: options.fallback.status,
      error: options.fallback.error,
      detail: trimmed || options.fallback.error,
      code: null,
    };
  }

  const code = clean(match[1]);
  const mapped = options.mapping[code] ?? options.fallback;
  const detail = clean(match[2]) || mapped.error;

  return {
    status: mapped.status,
    error: mapped.error,
    detail,
    code,
  };
}
