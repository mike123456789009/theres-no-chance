import type { MarketSourceType } from "@/lib/markets/create-market";
import type { CreateMarketWizardStep } from "@/lib/markets/create-market-client-validation";

export type SourceDraft = {
  id: string;
  label: string;
  url: string;
  type: MarketSourceType;
};

export type InstitutionAccessSnapshot = {
  activeMembership: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  } | null;
};

export type WizardStep = CreateMarketWizardStep;

export const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "rules", label: "Rules" },
  { id: "resolvable", label: "Resolvable" },
  { id: "listingFee", label: "Listing fee" },
  { id: "rake", label: "Maker rake" },
  { id: "evidence", label: "Evidence" },
  { id: "basics", label: "Basics" },
  { id: "idea", label: "Idea" },
  { id: "criteria", label: "Criteria" },
  { id: "sources", label: "References" },
  { id: "review", label: "Review" },
];

export const SOURCE_TYPE_OPTIONS: Array<{ value: MarketSourceType; label: string }> = [
  { value: "official", label: "Official" },
  { value: "supporting", label: "Supporting" },
  { value: "rules", label: "Rules" },
];
