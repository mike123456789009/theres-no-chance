import { NextResponse } from "next/server";

import { getServerEnvReadiness } from "@/lib/api/env-guards";
import { jsonEnvUnavailable, jsonInternalError, jsonUnauthorized } from "@/lib/api/http-errors";
import { getPortfolioSnapshot, portfolioFillsToCsv } from "@/lib/markets/portfolio";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const serverEnv = getServerEnvReadiness();
  if (!serverEnv.isConfigured) {
    return jsonEnvUnavailable("Portfolio is unavailable: missing Supabase environment variables.", serverEnv.missingEnv);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonUnauthorized();
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
    return jsonInternalError("Portfolio load failed.", error);
  }
}
