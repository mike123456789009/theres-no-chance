import { jsonError, jsonInternalError } from "@/lib/api/http-errors";
import { parseJsonBody } from "@/lib/api/route-primitives";
import type { MarketDetailDTO } from "@/lib/markets/read-markets";
import type { MarketDetailGuardConfig } from "@/lib/markets/request-context";
import { isRecord } from "@/lib/shared/primitives";

type TradeRouteKind = "quote" | "execution";

type TradeEngineFailure = {
  status: number;
  error: string;
  detail?: string;
  missingEnv?: string[];
};

export function tradeUnavailableMessage(kind: TradeRouteKind): string {
  return kind === "quote"
    ? "Trade quote is unavailable: missing Supabase environment variables."
    : "Trade execution is unavailable: missing Supabase environment variables.";
}

export async function parseTradeJsonBody(request: Request) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed;
  return { ok: true as const, payload: parsed.value };
}

export function normalizeExecutePayloadWithIdempotencyKey(
  payload: unknown,
  headers: Headers
): unknown {
  const idempotencyHeader = headers.get("Idempotency-Key") ?? headers.get("idempotency-key");

  if (!isRecord(payload)) {
    return payload;
  }

  return {
    ...payload,
    idempotencyKey: idempotencyHeader ?? payload.idempotencyKey,
  };
}

export function jsonTradeValidationFailed(errors: string[]): Response {
  return jsonError(400, "Validation failed.", { details: errors });
}

export function buildTradeDetailGuards(kind: TradeRouteKind): MarketDetailGuardConfig {
  const verificationDetail =
    kind === "quote"
      ? "Verify an institution email to quote this market."
      : "Verify an institution email to trade this market.";
  const detailError =
    kind === "quote"
      ? "Unable to load market for trade quote."
      : "Unable to load market for trade execution.";

  return {
    loginRequired: {
      status: 401,
      error: "Unauthorized.",
    },
    institutionVerificationRequired: {
      status: 403,
      error: "Institution verification required.",
      detail: verificationDetail,
    },
    notFound: {
      status: 404,
      error: "Market not found.",
    },
    schemaMissing: {
      status: 503,
      error: "Market tables are not provisioned in this environment yet.",
      includeSourceMessage: true,
    },
    detailError: {
      status: 500,
      error: detailError,
      includeSourceMessage: true,
    },
  };
}

export function jsonTradeMarketNotOpen(kind: TradeRouteKind): Response {
  return jsonError(409, `Trade ${kind} unavailable.`, {
    detail: "Market must be open for trading.",
  });
}

export function jsonTradeViewerIneligible(
  kind: TradeRouteKind,
  viewerReadOnlyReason: MarketDetailDTO["viewerReadOnlyReason"]
): Response {
  return jsonError(403, `Trade ${kind} unavailable.`, {
    detail:
      viewerReadOnlyReason === "legacy_institution_access"
        ? "Your account can view this market due to an existing position, but new trades are restricted to active institution members."
        : "Your account is not eligible to trade this market.",
  });
}

export function jsonTradeEngineFailure(failure: TradeEngineFailure): Response {
  return jsonError(failure.status, failure.error, {
    detail: failure.detail,
    missingEnv: failure.missingEnv,
  });
}

export function jsonTradeUnhandled(kind: TradeRouteKind, error: unknown): Response {
  return jsonInternalError(
    kind === "quote" ? "Trade quote failed." : "Trade execution failed.",
    error
  );
}
