import { NextResponse } from "next/server";

import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FIXED_RESOLUTION_WINDOW_HOURS = 24;

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}`;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Community resolution sync unavailable: missing Supabase service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  try {
    const service = createServiceClient();

    const [closeSync, resolutionSync, finalizationSync] = await Promise.all([
      service.rpc("sync_market_close_state", { p_market_id: null }),
      service.rpc("sync_due_community_resolutions", {
        p_resolution_window_hours: FIXED_RESOLUTION_WINDOW_HOURS,
      }),
      service.rpc("sync_due_community_finalizations", { p_actor_user_id: null }),
    ]);

    if (closeSync.error || resolutionSync.error || finalizationSync.error) {
      return NextResponse.json(
        {
          error: "Community resolution sync failed.",
          detail:
            closeSync.error?.message ||
            resolutionSync.error?.message ||
            finalizationSync.error?.message ||
            "Unknown RPC error.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        summary: {
          closedMarketsUpdated: toNumber(closeSync.data),
          resolutionStatesProcessed: toNumber(resolutionSync.data),
          autoFinalizedMarkets: toNumber(finalizationSync.data),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Community resolution sync failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
