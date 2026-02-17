import { NextResponse } from "next/server";

import { getPortfolioSnapshot, portfolioFillsToCsv } from "@/lib/markets/portfolio";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Portfolio is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const snapshot = await getPortfolioSnapshot({
      supabase,
      userId: user.id,
    });

    const format = new URL(request.url).searchParams.get("format")?.toLowerCase();
    if (format === "csv") {
      const csv = portfolioFillsToCsv(snapshot.fills);
      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="portfolio-trade-history-${new Date().toISOString().slice(0, 10)}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    return NextResponse.json({
      portfolio: snapshot,
      user: {
        id: user.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Portfolio load failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
