import { NextResponse } from "next/server";

import { handleVenmoReconcileRequest } from "@/lib/payments/venmo-reconcile/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handleVenmoReconcileRequest(request);
  return NextResponse.json(result.body, { status: result.status });
}
