import { NextResponse } from "next/server";

import { DEFAULT_RESEARCH_MODEL, DEFAULT_SCOUT_MODEL } from "@/lib/automation/market-research/constants";
import { runInstitutionResearch, runPublicResearch } from "@/lib/automation/market-research/runner";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;
const ADMIN_RUN_TIMEOUT_BUFFER_MS = 90_000;
const ADMIN_RUN_TIMEOUT_MS = Math.max(60_000, maxDuration * 1000 - ADMIN_RUN_TIMEOUT_BUFFER_MS);

type RunScope = "public" | "institution";

type RunRequestBody = {
  scope?: unknown;
  submit?: unknown;
  maxToSubmit?: unknown;
  maxPerOrganization?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseScope(value: unknown): RunScope | null {
  const normalized = clean(value).toLowerCase();
  if (normalized === "public" || normalized === "institution") return normalized;
  return null;
}

function parseBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export async function POST(request: Request) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
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

  let body: RunRequestBody;
  try {
    body = (await request.json()) as RunRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const scope = parseScope(body.scope);
  if (!scope) {
    return NextResponse.json({ error: "scope must be one of: public, institution." }, { status: 400 });
  }

  const submit = parseBoolean(body.submit, true);
  const modelName = clean(process.env.MARKET_RESEARCH_MODEL) || DEFAULT_RESEARCH_MODEL;
  const scoutModelName = clean(process.env.MARKET_RESEARCH_SCOUT_MODEL) || DEFAULT_SCOUT_MODEL;

  try {
    if (scope === "public") {
      const summary = await runPublicResearch({
        submit,
        maxToSubmit: parsePositiveInt(body.maxToSubmit) ?? 8,
        modelName,
        scoutModelName,
        runTimeoutMs: ADMIN_RUN_TIMEOUT_MS,
      });

      return NextResponse.json({
        message: "Public proposal run completed.",
        summary,
      });
    }

    const summary = await runInstitutionResearch({
      submit,
      maxPerOrganization: parsePositiveInt(body.maxPerOrganization) ?? 3,
      modelName,
      scoutModelName,
      runTimeoutMs: ADMIN_RUN_TIMEOUT_MS,
    });

    return NextResponse.json({
      message: "Institution proposal run completed.",
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to invoke market research run.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 }
    );
  }
}
