import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      received: true,
      processed: false,
      ignored: true,
      details: ["Stripe webhooks are currently ignored while Stripe is disabled."],
    },
    { status: 200 }
  );
}
