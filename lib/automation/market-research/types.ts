import type { MarketCardShadowTone } from "@/lib/markets/presentation";
import type { MarketCategoryKey } from "@/lib/markets/taxonomy";

export type ResearchRunScope = "public" | "institution";
export type ResearchRunStatus = "running" | "completed" | "partial" | "failed" | "skipped";

export type ResearchSubmissionStatus =
  | "submitted_review"
  | "skipped_duplicate"
  | "skipped_quality"
  | "skipped_invalid"
  | "submit_failed";

export type GeneratedProposalSource = {
  label: string;
  url: string;
  type: "official" | "supporting" | "rules";
};

export type GeneratedMarketProposal = {
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  closeTime: string;
  expectedResolutionTime: string | null;
  evidenceRules: string | null;
  disputeRules: string | null;
  feeBps: number;
  visibility: "public" | "unlisted" | "private";
  accessRules: Record<string, unknown>;
  tags: string[];
  riskFlags: string[];
  sources: GeneratedProposalSource[];
  cardShadowTone: MarketCardShadowTone;
  confidence: number;
  eventFingerprint: string;
  rationale: string;
  category: MarketCategoryKey;
  usFocus: boolean;
};

export type ResearchRunSummary = {
  scope: ResearchRunScope;
  runId: string;
  status: Exclude<ResearchRunStatus, "running">;
  modelName: string;
  scoutModelName?: string;
  startedAt: string;
  completedAt?: string;
  generated: number;
  submitted: number;
  skippedDuplicate: number;
  skippedQuality: number;
  skippedInvalid: number;
  submitFailed: number;
  organizationId?: string | null;
  organizationName?: string | null;
  topSubmittedQuestions: string[];
  failuresByInstitution?: Array<{ organizationId: string; organizationName: string; error: string }>;
};

export type ResearchOrganization = {
  id: string;
  name: string;
  slug: string;
  domains: Array<{
    domain: string;
    allowSubdomains: boolean;
  }>;
};
