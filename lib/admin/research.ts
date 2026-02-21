import { listRecentResearchRunsForAdmin, type AdminResearchRunCard } from "@/lib/automation/market-research/db";

export type AdminResearchRunsResult = {
  runs: AdminResearchRunCard[];
  errorMessage: string;
};

export async function loadResearchRuns(limit = 20): Promise<AdminResearchRunsResult> {
  try {
    const runs = await listRecentResearchRunsForAdmin(limit);
    return {
      runs,
      errorMessage: "",
    };
  } catch (error) {
    return {
      runs: [],
      errorMessage: error instanceof Error ? error.message : "Unable to load research runs.",
    };
  }
}
