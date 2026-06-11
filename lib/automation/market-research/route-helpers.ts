import { NextResponse } from "next/server";

import { jsonError, jsonInternalError } from "@/lib/api/http-errors";
import { requireServiceEnv } from "@/lib/api/route-primitives";
import { DEFAULT_RESEARCH_MODEL, DEFAULT_SCOUT_MODEL } from "@/lib/automation/market-research/constants";
import { cleanText, parsePositiveInt } from "@/lib/shared/primitives";

type MarketResearchCronRouteConfig<TSummary> = {
  maxDurationSeconds: number;
  maxEnvName: string;
  maxFallback: number;
  failureMessage: string;
  run: (options: {
    submit: true;
    max: number;
    modelName: string;
    scoutModelName: string;
    runTimeoutMs: number;
  }) => Promise<TSummary>;
};

export function marketResearchRunTimeoutMs(maxDurationSeconds: number): number {
  return Math.max(60_000, maxDurationSeconds * 1000 - 90_000);
}

export function marketResearchModelConfig() {
  return {
    modelName: cleanText(process.env.MARKET_RESEARCH_MODEL) || DEFAULT_RESEARCH_MODEL,
    scoutModelName: cleanText(process.env.MARKET_RESEARCH_SCOUT_MODEL) || DEFAULT_SCOUT_MODEL,
  };
}

export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function createMarketResearchCronRoute<TSummary>(config: MarketResearchCronRouteConfig<TSummary>) {
  return async function GET(request: Request) {
    if (!isAuthorizedCronRequest(request)) {
      return jsonError(401, "Unauthorized cron request.");
    }

    const env = requireServiceEnv("Market research automation unavailable: missing Supabase service role configuration.");
    if (!env.ok) {
      return env.response;
    }

    const { modelName, scoutModelName } = marketResearchModelConfig();

    try {
      const summary = await config.run({
        submit: true,
        max: parsePositiveInt(process.env[config.maxEnvName], config.maxFallback) ?? config.maxFallback,
        modelName,
        scoutModelName,
        runTimeoutMs: marketResearchRunTimeoutMs(config.maxDurationSeconds),
      });

      return NextResponse.json({ summary }, { status: 200 });
    } catch (error) {
      return jsonInternalError(config.failureMessage, error, "Unknown error.");
    }
  };
}
