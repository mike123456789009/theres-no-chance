import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { parseBracketedRpcError } from "@/lib/payments/rpc-errors";

export const WITHDRAWAL_NETWORKS = ["base", "ethereum", "solana"] as const;

export type WithdrawalNetwork = (typeof WITHDRAWAL_NETWORKS)[number];

export type ValidatedWithdrawalPayload = {
  amount: number;
  idempotencyKey: string;
  destination: {
    network: WithdrawalNetwork;
    address: string;
  };
  note: string | null;
};

export type WithdrawalConfig = {
  minAmountUsd: number;
  maxAmountUsd: number;
  dailyLimitUsd: number;
  maxPendingRequests: number;
  autoPayoutEnabled: boolean;
};

export type WithdrawalRequestRpcResult = {
  reused: boolean;
  withdrawalRequestId: string;
  status: string;
  amount: number;
  currency: string;
  availableBalance: number;
  reservedBalance: number;
  requestedAt: string;
};

export type WithdrawalProcessRpcResult = {
  reused: boolean;
  withdrawalRequestId: string;
  status: string;
  amount: number;
  currency: string;
  availableBalance: number;
  reservedBalance: number;
  processedAt: string;
  failureReason: string | null;
};

type ServiceCallError = {
  status: number;
  error: string;
  detail?: string;
  missingEnv?: string[];
};

type ServiceCallResult<T> = { ok: true; data: T } | ({ ok: false } & ServiceCallError);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function isOneOf<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function parseRpcError(message: string): ServiceCallError {
  const parsed = parseBracketedRpcError({
    message,
    mapping: {
      WITHDRAW_VALIDATION: {
        status: 400,
        error: "Withdrawal validation failed.",
      },
      WITHDRAW_NOT_FOUND: {
        status: 404,
        error: "Withdrawal request not found.",
      },
      WITHDRAW_FUNDS: {
        status: 409,
        error: "Withdrawal cannot be processed.",
      },
      WITHDRAW_CONFLICT: {
        status: 409,
        error: "Withdrawal cannot be processed.",
      },
    },
    fallback: {
      status: 500,
      error: "Withdrawal operation failed.",
    },
  });

  return {
    status: parsed.status,
    error: parsed.error,
    detail: parsed.detail,
  };
}

function normalizeRequestResult(raw: unknown): WithdrawalRequestRpcResult | null {
  if (!isRecord(raw)) return null;

  const withdrawalRequestId = cleanText(raw.withdrawalRequestId, 64);
  const status = cleanText(raw.status, 32);
  const currency = cleanText(raw.currency, 16);
  const requestedAt = cleanText(raw.requestedAt, 64);
  const amount = parseNumber(raw.amount);
  const availableBalance = parseNumber(raw.availableBalance);
  const reservedBalance = parseNumber(raw.reservedBalance);
  const reused = raw.reused === true;

  if (
    !withdrawalRequestId ||
    !status ||
    !currency ||
    !requestedAt ||
    amount === null ||
    availableBalance === null ||
    reservedBalance === null
  ) {
    return null;
  }

  return {
    reused,
    withdrawalRequestId,
    status,
    amount,
    currency,
    availableBalance,
    reservedBalance,
    requestedAt,
  };
}

function normalizeProcessResult(raw: unknown): WithdrawalProcessRpcResult | null {
  if (!isRecord(raw)) return null;

  const withdrawalRequestId = cleanText(raw.withdrawalRequestId, 64);
  const status = cleanText(raw.status, 32);
  const currency = cleanText(raw.currency, 16);
  const processedAt = cleanText(raw.processedAt, 64);
  const failureReasonRaw = cleanText(raw.failureReason, 255);
  const amount = parseNumber(raw.amount);
  const availableBalance = parseNumber(raw.availableBalance);
  const reservedBalance = parseNumber(raw.reservedBalance);
  const reused = raw.reused === true;

  if (!withdrawalRequestId || !status || !currency || !processedAt || amount === null || availableBalance === null || reservedBalance === null) {
    return null;
  }

  return {
    reused,
    withdrawalRequestId,
    status,
    amount,
    currency,
    availableBalance,
    reservedBalance,
    processedAt,
    failureReason: failureReasonRaw || null,
  };
}

export function getWithdrawalConfig(): WithdrawalConfig {
  const minAmountUsd = parsePositiveNumber(process.env.WITHDRAWAL_MIN_USD, 10);
  const maxAmountUsd = parsePositiveNumber(process.env.WITHDRAWAL_MAX_USD, 2_500);
  const dailyLimitUsd = parsePositiveNumber(process.env.WITHDRAWAL_DAILY_LIMIT_USD, 5_000);
  const maxPendingRequests = parsePositiveInteger(process.env.WITHDRAWAL_MAX_PENDING, 2);
  const autoPayoutEnabled = parseBoolean(process.env.WITHDRAWAL_AUTO_PAYOUT_ENABLED, true);

  return {
    minAmountUsd: Math.min(minAmountUsd, maxAmountUsd),
    maxAmountUsd: Math.max(minAmountUsd, maxAmountUsd),
    dailyLimitUsd: Math.max(dailyLimitUsd, maxAmountUsd),
    maxPendingRequests: Math.max(1, maxPendingRequests),
    autoPayoutEnabled,
  };
}

export function validateWithdrawalPayload(raw: unknown): { ok: true; data: ValidatedWithdrawalPayload } | { ok: false; errors: string[] } {
  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: ["Invalid request body."],
    };
  }

  const errors: string[] = [];
  const amountValue = parseNumber(raw.amount);
  const idempotencyKey = cleanText(raw.idempotencyKey, 120);
  const noteRaw = cleanText(raw.note, 280);
  const destinationRaw = raw.destination;

  let network = "";
  let address = "";

  if (!isRecord(destinationRaw)) {
    errors.push("destination is required.");
  } else {
    network = cleanText(destinationRaw.network, 24).toLowerCase();
    address = cleanText(destinationRaw.address, 200);
  }

  if (amountValue === null) {
    errors.push("amount must be numeric.");
  } else if (amountValue <= 0) {
    errors.push("amount must be greater than zero.");
  } else if (amountValue > 1_000_000) {
    errors.push("amount must be less than or equal to 1,000,000.");
  }

  if (!idempotencyKey || idempotencyKey.length < 8) {
    errors.push("idempotencyKey is required and must be at least 8 characters.");
  }

  if (!network || !isOneOf(network, WITHDRAWAL_NETWORKS)) {
    errors.push(`destination.network must be one of: ${WITHDRAWAL_NETWORKS.join(", ")}.`);
  }

  if (!address || address.length < 8) {
    errors.push("destination.address is required and must be at least 8 characters.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    data: {
      amount: amountValue as number,
      idempotencyKey,
      destination: {
        network: network as WithdrawalNetwork,
        address,
      },
      note: noteRaw || null,
    },
  };
}

export async function requestWithdrawal(options: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}): Promise<ServiceCallResult<WithdrawalRequestRpcResult>> {
  if (!isSupabaseServiceEnvConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Withdrawal service unavailable.",
      missingEnv: getMissingSupabaseServiceEnv(),
      detail: "Missing service-role environment variables.",
    };
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("request_withdrawal", {
      p_user_id: options.userId,
      p_amount: options.amount,
      p_idempotency_key: options.idempotencyKey,
      p_currency: "USD",
      p_metadata: options.metadata,
    });

    if (error) {
      const parsed = parseRpcError(error.message);
      return {
        ok: false,
        ...parsed,
      };
    }

    const normalized = normalizeRequestResult(data);
    if (!normalized) {
      return {
        ok: false,
        status: 500,
        error: "Withdrawal request failed.",
        detail: "Malformed request_withdrawal RPC response.",
      };
    }

    return {
      ok: true,
      data: normalized,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: "Withdrawal request failed.",
      detail: error instanceof Error ? error.message : "Unknown request_withdrawal error.",
    };
  }
}

export async function processWithdrawalRequest(options: {
  withdrawalRequestId: string;
  status: "completed" | "failed";
  idempotencyKey: string;
  failureReason?: string | null;
  actorUserId?: string | null;
  metadata: Record<string, unknown>;
}): Promise<ServiceCallResult<WithdrawalProcessRpcResult>> {
  if (!isSupabaseServiceEnvConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Withdrawal service unavailable.",
      missingEnv: getMissingSupabaseServiceEnv(),
      detail: "Missing service-role environment variables.",
    };
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("process_withdrawal_request", {
      p_withdrawal_request_id: options.withdrawalRequestId,
      p_status: options.status,
      p_failure_reason: options.failureReason ?? null,
      p_actor_user_id: options.actorUserId ?? null,
      p_idempotency_key: options.idempotencyKey,
      p_metadata: options.metadata,
    });

    if (error) {
      const parsed = parseRpcError(error.message);
      return {
        ok: false,
        ...parsed,
      };
    }

    const normalized = normalizeProcessResult(data);
    if (!normalized) {
      return {
        ok: false,
        status: 500,
        error: "Withdrawal process failed.",
        detail: "Malformed process_withdrawal_request RPC response.",
      };
    }

    return {
      ok: true,
      data: normalized,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: "Withdrawal process failed.",
      detail: error instanceof Error ? error.message : "Unknown process_withdrawal_request error.",
    };
  }
}
