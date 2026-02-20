import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Stripe checkout is temporarily disabled while Venmo funding is active.",
      provider: "stripe",
      status: "disabled",
    },
    { status: 503 }
  );
}
