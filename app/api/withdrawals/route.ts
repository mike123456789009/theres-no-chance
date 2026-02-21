import { NextResponse } from "next/server";

import { handleWithdrawalRequest } from "@/lib/payments/withdrawal-service";

export async function POST(request: Request) {
  const result = await handleWithdrawalRequest(request);
  return NextResponse.json(result.body, { status: result.status });
}
