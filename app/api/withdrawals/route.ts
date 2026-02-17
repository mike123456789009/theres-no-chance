import { NextResponse } from "next/server";

import { getWithdrawalConfig, processWithdrawalRequest, requestWithdrawal, validateWithdrawalPayload } from "@/lib/payments/withdrawals";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type ProfileRow = {
  kyc_status: string | null;
} | null;

type AmountRow = {
  amount: number | string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getUtcDayStartIso(now = new Date()): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

function maskAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function mergeMissingEnv(serverMissing: string[], serviceMissing: string[]): string[] {
  return Array.from(new Set([...serverMissing, ...serviceMissing]));
}

export async function POST(request: Request) {
  const serverEnvReady = isSupabaseServerEnvConfigured();
  const serviceEnvReady = isSupabaseServiceEnvConfigured();

  if (!serverEnvReady || !serviceEnvReady) {
    return NextResponse.json(
      {
        error: "Withdrawal processing is unavailable: missing environment configuration.",
        missingEnv: mergeMissingEnv(getMissingSupabaseServerEnv(), getMissingSupabaseServiceEnv()),
      },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const idempotencyHeader = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  const payloadWithIdempotency = isRecord(payload)
    ? {
        ...payload,
        idempotencyKey: idempotencyHeader ?? payload.idempotencyKey,
      }
    : payload;

  const validation = validateWithdrawalPayload(payloadWithIdempotency);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: validation.errors,
      },
      { status: 400 }
    );
  }

  const config = getWithdrawalConfig();

  if (validation.data.amount < config.minAmountUsd) {
    return NextResponse.json(
      {
        error: "Withdrawal amount too small.",
        detail: `Minimum withdrawal amount is ${config.minAmountUsd.toFixed(2)} USD.`,
      },
      { status: 400 }
    );
  }

  if (validation.data.amount > config.maxAmountUsd) {
    return NextResponse.json(
      {
        error: "Withdrawal amount exceeds per-request limit.",
        detail: `Maximum withdrawal amount per request is ${config.maxAmountUsd.toFixed(2)} USD.`,
      },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const service = createServiceClient();

    const { data: profileData, error: profileError } = await service
      .from("profiles")
      .select("kyc_status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        {
          error: "Unable to load withdrawal eligibility profile.",
          detail: profileError.message,
        },
        { status: 500 }
      );
    }

    const profile = profileData as ProfileRow;
    const kycStatus = cleanText(profile?.kyc_status, 32) || "not_started";
    if (kycStatus !== "verified") {
      return NextResponse.json(
        {
          error: "Withdrawal requires verified KYC status.",
          detail: `Current kyc_status is '${kycStatus}'.`,
        },
        { status: 403 }
      );
    }

    const { count: pendingCountRaw, error: pendingError } = await service
      .from("withdrawal_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (pendingError) {
      return NextResponse.json(
        {
          error: "Unable to evaluate pending withdrawal limits.",
          detail: pendingError.message,
        },
        { status: 500 }
      );
    }

    const pendingCount = pendingCountRaw ?? 0;
    if (pendingCount >= config.maxPendingRequests) {
      return NextResponse.json(
        {
          error: "Too many pending withdrawal requests.",
          detail: `Maximum pending withdrawals is ${config.maxPendingRequests}.`,
        },
        { status: 409 }
      );
    }

    const dayStartIso = getUtcDayStartIso();
    const { data: completedRows, error: completedError } = await service
      .from("withdrawal_requests")
      .select("amount")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("requested_at", dayStartIso);

    if (completedError) {
      return NextResponse.json(
        {
          error: "Unable to evaluate daily withdrawal limit.",
          detail: completedError.message,
        },
        { status: 500 }
      );
    }

    const completedTodayUsd = ((completedRows ?? []) as AmountRow[]).reduce((sum, row) => sum + toNumber(row.amount), 0);
    if (completedTodayUsd + validation.data.amount > config.dailyLimitUsd) {
      return NextResponse.json(
        {
          error: "Withdrawal exceeds daily limit.",
          detail: `Daily completed withdrawals cannot exceed ${config.dailyLimitUsd.toFixed(2)} USD.`,
          dailyCompletedUsd: completedTodayUsd,
        },
        { status: 409 }
      );
    }

    const requestResult = await requestWithdrawal({
      userId: user.id,
      amount: validation.data.amount,
      idempotencyKey: validation.data.idempotencyKey,
      metadata: {
        destinationNetwork: validation.data.destination.network,
        destinationAddressMasked: maskAddress(validation.data.destination.address),
        note: validation.data.note,
        requestedVia: "api",
      },
    });

    if (!requestResult.ok) {
      return NextResponse.json(
        {
          error: requestResult.error,
          detail: requestResult.detail,
          missingEnv: requestResult.missingEnv,
        },
        { status: requestResult.status }
      );
    }

    if (!config.autoPayoutEnabled) {
      return NextResponse.json(
        {
          withdrawal: {
            ...requestResult.data,
            network: validation.data.destination.network,
            autoPayout: false,
          },
        },
        { status: requestResult.data.reused ? 200 : 201 }
      );
    }

    const completion = await processWithdrawalRequest({
      withdrawalRequestId: requestResult.data.withdrawalRequestId,
      status: "completed",
      idempotencyKey: `${requestResult.data.withdrawalRequestId}:complete`,
      metadata: {
        autoPayout: true,
        destinationNetwork: validation.data.destination.network,
      },
    });

    if (!completion.ok) {
      await processWithdrawalRequest({
        withdrawalRequestId: requestResult.data.withdrawalRequestId,
        status: "failed",
        failureReason: "auto_payout_processing_failed",
        idempotencyKey: `${requestResult.data.withdrawalRequestId}:failed`,
        metadata: {
          autoPayout: true,
          destinationNetwork: validation.data.destination.network,
          fallbackFailure: true,
        },
      });

      return NextResponse.json(
        {
          error: "Withdrawal auto-payout failed.",
          detail: completion.detail ?? completion.error,
          withdrawalRequestId: requestResult.data.withdrawalRequestId,
        },
        { status: 500 }
      );
    }

    if (completion.data.status !== "completed") {
      return NextResponse.json(
        {
          error: "Withdrawal was not completed.",
          detail: `Current status: ${completion.data.status}.`,
          withdrawal: {
            ...completion.data,
            requestedAt: requestResult.data.requestedAt,
            network: validation.data.destination.network,
            autoPayout: true,
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        withdrawal: {
          ...completion.data,
          requestedAt: requestResult.data.requestedAt,
          network: validation.data.destination.network,
          autoPayout: true,
        },
      },
      { status: requestResult.data.reused && completion.data.reused ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Withdrawal request failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
