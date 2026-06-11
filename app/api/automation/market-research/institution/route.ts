import { DEFAULT_INSTITUTION_MAX_PER_ORG } from "@/lib/automation/market-research/constants";
import { createMarketResearchCronRoute } from "@/lib/automation/market-research/route-helpers";
import { runInstitutionResearch } from "@/lib/automation/market-research/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export const GET = createMarketResearchCronRoute({
  maxDurationSeconds: maxDuration,
  maxEnvName: "MARKET_RESEARCH_INSTITUTION_MAX_PER_CRON",
  maxFallback: DEFAULT_INSTITUTION_MAX_PER_ORG,
  failureMessage: "Institution market research cron run failed.",
  run: ({ submit, max, modelName, scoutModelName, runTimeoutMs }) =>
    runInstitutionResearch({
      submit,
      maxPerOrganization: max,
      modelName,
      scoutModelName,
      runTimeoutMs,
    }),
});
