import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http-errors";
import { parseJsonBody, requireServiceEnv } from "@/lib/api/route-primitives";
import { marketResearchModelConfig, marketResearchRunTimeoutMs } from "@/lib/automation/market-research/route-helpers";
import { runInstitutionResearch, runPublicResearch } from "@/lib/automation/market-research/runner";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { cleanText, parseBoolean, parsePositiveInt } from "@/lib/shared/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;
const ADMIN_RUN_TIMEOUT_MS = marketResearchRunTimeoutMs(maxDuration);

type RunScope = "public" | "institution";

type RunRequestBody = {
  scope?: unknown;
  submit?: unknown;
  maxToSubmit?: unknown;
  maxPerOrganization?: unknown;
};

function parseScope(value: unknown): RunScope | null {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "public" || normalized === "institution") return normalized;
  return null;
}

export async function POST(request: Request) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const env = requireServiceEnv("Market research automation unavailable: missing Supabase service role configuration.");
  if (!env.ok) return env.response;

  const parsed = await parseJsonBody<RunRequestBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const scope = parseScope(body.scope);
  if (!scope) {
    return jsonError(400, "scope must be one of: public, institution.");
  }

  const submit = parseBoolean(body.submit, true);
  const { modelName, scoutModelName } = marketResearchModelConfig();

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
