import { NextResponse } from "next/server";

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type ResolveBody = {
  outcome?: unknown;
  notes?: unknown;
};

type ResolveOutcome = "yes" | "no" | "void";

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseOutcome(value: unknown): ResolveOutcome | null {
  const normalized = clean(value, 16).toLowerCase();
  if (normalized === "yes" || normalized === "no" || normalized === "void") return normalized;
  return null;
}

function normalizeRpcResult(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market resolution unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { marketId } = await context.params;

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const outcome = parseOutcome(body.outcome);
  const notes = clean(body.notes, 1000) || null;

  if (!outcome) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["outcome must be one of: yes, no, void."],
      },
      { status: 400 }
    );
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_resolve_market", {
      p_market_id: marketId,
      p_resolver_id: auth.adminUser.id,
      p_outcome: outcome,
      p_notes: notes,
    });

    if (error) {
      return NextResponse.json(
        {
          error: "Market resolution failed.",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    const result = normalizeRpcResult(data);
    if (!result) {
      return NextResponse.json(
        {
          error: "Market resolution failed.",
          detail: "Malformed admin_resolve_market RPC response.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Market resolved.",
      resolution: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Market resolution failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}

