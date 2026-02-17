import { NextResponse } from "next/server";

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { performAdminMarketAction } from "@/lib/markets/admin-actions";

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const { marketId } = await context.params;

  let reason: string | null = null;
  try {
    const payload = (await request.json()) as { reason?: unknown };
    reason = typeof payload.reason === "string" ? payload.reason : null;
  } catch {
    reason = null;
  }

  const result = await performAdminMarketAction({
    marketId,
    action: "halt",
    adminUserId: auth.adminUser.id,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        detail: result.detail,
        missingEnv: result.missingEnv,
      },
      { status: result.status }
    );
  }

  return NextResponse.json({
    message: "Trading halted for this market.",
    market: result.market,
  });
}
