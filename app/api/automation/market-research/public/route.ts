import { NextResponse } from "next/server";

import { DEFAULT_PUBLIC_MAX } from "@/lib/automation/market-research/constants";
import { runPublicResearch } from "@/lib/automation/market-research/runner";
import { getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}`;
}

function parsePositiveInt(raw: string | undefined, fallbackValue: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market research automation unavailable: missing Supabase service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const maxToSubmit = parsePositiveInt(process.env.MARKET_RESEARCH_PUBLIC_MAX_PER_CRON, DEFAULT_PUBLIC_MAX);
  const modelName = process.env.MARKET_RESEARCH_MODEL?.trim() || "gpt-5";
  const scoutModelName = process.env.MARKET_RESEARCH_SCOUT_MODEL?.trim() || "gpt-5-mini";

  try {
    const summary = await runPublicResearch({
      submit: true,
      maxToSubmit,
      modelName,
      scoutModelName,
    });

    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Public market research cron run failed.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
