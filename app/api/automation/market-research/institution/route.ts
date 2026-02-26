import { NextResponse } from "next/server";

import {
  DEFAULT_INSTITUTION_MAX_PER_ORG,
  DEFAULT_RESEARCH_MODEL,
  DEFAULT_SCOUT_MODEL,
} from "@/lib/automation/market-research/constants";
import { runInstitutionResearch } from "@/lib/automation/market-research/runner";
import { getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;
const CRON_RUN_TIMEOUT_BUFFER_MS = 90_000;
const CRON_RUN_TIMEOUT_MS = Math.max(60_000, maxDuration * 1000 - CRON_RUN_TIMEOUT_BUFFER_MS);

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

  const maxPerOrganization = parsePositiveInt(
    process.env.MARKET_RESEARCH_INSTITUTION_MAX_PER_CRON,
    DEFAULT_INSTITUTION_MAX_PER_ORG
  );
  const modelName = process.env.MARKET_RESEARCH_MODEL?.trim() || DEFAULT_RESEARCH_MODEL;
  const scoutModelName = process.env.MARKET_RESEARCH_SCOUT_MODEL?.trim() || DEFAULT_SCOUT_MODEL;

  try {
    const summary = await runInstitutionResearch({
      submit: true,
      maxPerOrganization,
      modelName,
      scoutModelName,
      runTimeoutMs: CRON_RUN_TIMEOUT_MS,
    });

    return NextResponse.json({ summary }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Institution market research cron run failed.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
