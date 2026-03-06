import {
  MARKET_DISCOVERY_ACCESS_FILTERS,
  MARKET_DISCOVERY_SORTS,
  getMarketDetail,
  getMarketViewerContext,
  listDiscoveryMarketCards,
  parseMarketDiscoveryQuery,
  toUrlSearchParams,
  type MarketCardDTO,
  type MarketDetailDTO,
  type MarketDiscoveryQuery,
  type MarketViewerContext,
} from "@/lib/markets/read-markets";
import {
  MarketDetailContextSection,
  MarketDetailMainSection,
  MarketDetailPositionPanel,
  MarketDetailResolutionSection,
  MarketDetailSourcesSection,
  MarketsDiscoveryHeaderSection,
  MarketsDiscoveryResultsSection,
} from "@/components/markets/page-sections";
import {
  BasicsStep,
  CriteriaStep,
  EvidenceStep,
  ReviewStep,
  RulesStep,
  SourcesStep,
} from "@/components/markets/create-market/steps";

const parsedQuery: MarketDiscoveryQuery = parseMarketDiscoveryQuery(
  new URLSearchParams("q=forecast&access=all&sort=volume")
);

const urlSearchParamsContract: URLSearchParams = toUrlSearchParams({
  q: parsedQuery.search,
  category: parsedQuery.category,
  status: parsedQuery.status,
  access: parsedQuery.access,
  sort: parsedQuery.sort,
});

const accessFilterContract: ReadonlyArray<MarketDiscoveryQuery["access"]> =
  MARKET_DISCOVERY_ACCESS_FILTERS;
const sortContract: ReadonlyArray<MarketDiscoveryQuery["sort"]> = MARKET_DISCOVERY_SORTS;

declare const marketCard: MarketCardDTO;
declare const marketDetail: MarketDetailDTO;
declare const viewerContext: MarketViewerContext;

const marketCardContract = {
  id: marketCard.id,
  actionRequired: marketCard.actionRequired,
  cardShadowTone: marketCard.cardShadowTone,
} satisfies Pick<MarketCardDTO, "id" | "actionRequired" | "cardShadowTone">;

const marketDetailContract = {
  adjudicationRequired: marketDetail.adjudicationRequired,
  challengeWindowEndsAt: marketDetail.challengeWindowEndsAt,
  creatorRakePaidAmount: marketDetail.creatorRakePaidAmount,
  creatorRakePaidAt: marketDetail.creatorRakePaidAt,
  finalOutcomeChangedByChallenge: marketDetail.finalOutcomeChangedByChallenge,
  resolverPrizeContributionCount: marketDetail.resolverPrizeContributionCount,
  resolverPrizeLockedTotal: marketDetail.resolverPrizeLockedTotal,
  resolverPrizeRecentContributions: marketDetail.resolverPrizeRecentContributions,
  resolverStakeCap: marketDetail.resolverStakeCap,
  viewerCanChallenge: marketDetail.viewerCanChallenge,
  viewerCanResolve: marketDetail.viewerCanResolve,
  viewerReadOnlyReason: marketDetail.viewerReadOnlyReason,
} satisfies Pick<
  MarketDetailDTO,
  | "adjudicationRequired"
  | "challengeWindowEndsAt"
  | "creatorRakePaidAmount"
  | "creatorRakePaidAt"
  | "finalOutcomeChangedByChallenge"
  | "resolverPrizeContributionCount"
  | "resolverPrizeLockedTotal"
  | "resolverPrizeRecentContributions"
  | "resolverStakeCap"
  | "viewerCanChallenge"
  | "viewerCanResolve"
  | "viewerReadOnlyReason"
>;

const viewerContextContract = {
  activeOrganizationId: viewerContext.activeOrganizationId,
  hasActiveInstitution: viewerContext.hasActiveInstitution,
  isAuthenticated: viewerContext.isAuthenticated,
  userId: viewerContext.userId,
} satisfies MarketViewerContext;

const readMarketsContract = {
  getMarketDetail,
  getMarketViewerContext,
  listDiscoveryMarketCards,
};

const pageSectionsContract = [
  MarketDetailContextSection,
  MarketDetailMainSection,
  MarketDetailPositionPanel,
  MarketDetailResolutionSection,
  MarketDetailSourcesSection,
  MarketsDiscoveryHeaderSection,
  MarketsDiscoveryResultsSection,
] as const;

const createMarketStepsContract = [
  BasicsStep,
  CriteriaStep,
  EvidenceStep,
  ReviewStep,
  RulesStep,
  SourcesStep,
] as const;

void urlSearchParamsContract;
void accessFilterContract;
void sortContract;
void marketCardContract;
void marketDetailContract;
void viewerContextContract;
void readMarketsContract;
void pageSectionsContract;
void createMarketStepsContract;
