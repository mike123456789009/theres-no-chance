import { DEFAULT_PUBLIC_MAX } from "@/lib/automation/market-research/constants";
import { createMarketResearchCronRoute } from "@/lib/automation/market-research/route-helpers";
import { runPublicResearch } from "@/lib/automation/market-research/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export const GET = createMarketResearchCronRoute({
  maxDurationSeconds: maxDuration,
  maxEnvName: "MARKET_RESEARCH_PUBLIC_MAX_PER_CRON",
  maxFallback: DEFAULT_PUBLIC_MAX,
  failureMessage: "Public market research cron run failed.",
  run: ({ submit, max, modelName, scoutModelName, runTimeoutMs }) =>
    runPublicResearch({
      submit,
      maxToSubmit: max,
      modelName,
      scoutModelName,
      runTimeoutMs,
    }),
});
