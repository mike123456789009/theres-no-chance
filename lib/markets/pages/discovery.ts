import { isPixelAvatarUrl } from "@/components/account/avatar-options";
import { checkUserAdminAccess } from "@/lib/auth/admin";
import {
  getMarketViewerContext,
  listDiscoveryMarketCards,
  parseMarketDiscoveryQuery,
  toUrlSearchParams,
  type MarketDiscoveryQuery,
  type MarketViewerContext,
} from "@/lib/markets/read-markets";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import {
  DEFAULT_AVATAR_URL,
  cleanText,
  parseNumberish,
  type ViewerAccountSummary,
} from "@/lib/markets/view-models/discovery";

type WalletAccountSummaryRow = {
  available_balance: number | string | null;
  reserved_balance: number | string | null;
} | null;

type ProfileSummaryRow = {
  display_name: string | null;
  avatar_url: string | null;
  ui_style: string | null;
} | null;

export type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

export type DiscoveryMarketCardsResult = Awaited<ReturnType<typeof listDiscoveryMarketCards>>;

type DiscoveryPageDependencies = {
  isSupabaseServerEnvConfigured: typeof isSupabaseServerEnvConfigured;
  getMissingSupabaseServerEnv: typeof getMissingSupabaseServerEnv;
  createClient: typeof createClient;
  toUrlSearchParams: typeof toUrlSearchParams;
  parseMarketDiscoveryQuery: typeof parseMarketDiscoveryQuery;
  getMarketViewerContext: typeof getMarketViewerContext;
  listDiscoveryMarketCards: typeof listDiscoveryMarketCards;
  getViewerAccountSummary: typeof getViewerAccountSummary;
};

const DEFAULT_DISCOVERY_PAGE_DEPENDENCIES: DiscoveryPageDependencies = {
  isSupabaseServerEnvConfigured,
  getMissingSupabaseServerEnv,
  createClient,
  toUrlSearchParams,
  parseMarketDiscoveryQuery,
  getMarketViewerContext,
  listDiscoveryMarketCards,
  getViewerAccountSummary,
};

export type DiscoveryPageLoadResult =
  | { kind: "env_missing"; missingEnv: string[] }
  | {
      kind: "ready";
      query: MarketDiscoveryQuery;
      viewer: MarketViewerContext;
      result: DiscoveryMarketCardsResult;
      accountSummary: ViewerAccountSummary;
      loadError: string | null;
    };

export async function getViewerAccountSummary(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  viewer: MarketViewerContext;
}): Promise<ViewerAccountSummary> {
  const { supabase, viewer } = options;

  if (!viewer.isAuthenticated || !viewer.userId) {
    return {
      portfolioUsd: null,
      cashUsd: null,
      avatarUrl: DEFAULT_AVATAR_URL,
      displayName: "Guest",
      isAdmin: false,
    };
  }

  try {
    const [walletResult, profileResult] = await Promise.all([
      supabase.from("wallet_accounts").select("available_balance, reserved_balance").eq("user_id", viewer.userId).maybeSingle(),
      supabase.from("profiles").select("display_name, avatar_url, ui_style").eq("id", viewer.userId).maybeSingle(),
    ]);

    let portfolioUsd: number | null = null;
    let cashUsd: number | null = null;
    let avatarUrl = DEFAULT_AVATAR_URL;
    let displayName = "Account";
    let isAdmin = false;

    if (!walletResult.error) {
      const wallet = walletResult.data as WalletAccountSummaryRow;
      cashUsd = Math.max(0, parseNumberish(wallet?.available_balance, 0));
      const reservedUsd = Math.max(0, parseNumberish(wallet?.reserved_balance, 0));
      portfolioUsd = cashUsd + reservedUsd;
    }

    if (!profileResult.error) {
      const profile = profileResult.data as ProfileSummaryRow;
      const avatarCandidate = cleanText(profile?.avatar_url);
      avatarUrl = isPixelAvatarUrl(avatarCandidate) ? avatarCandidate : DEFAULT_AVATAR_URL;
      displayName = cleanText(profile?.display_name) || "Account";
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      const adminAccess = await checkUserAdminAccess({
        userId: user.id,
        email: user.email,
      });
      isAdmin = adminAccess.isAdmin;
    }

    return {
      portfolioUsd,
      cashUsd,
      avatarUrl,
      displayName,
      isAdmin,
    };
  } catch {
    return {
      portfolioUsd: null,
      cashUsd: null,
      avatarUrl: DEFAULT_AVATAR_URL,
      displayName: "Account",
      isAdmin: false,
    };
  }
}

export async function loadDiscoveryPageData(options: {
  searchParams?: SearchParamsInput;
  dependencies?: Partial<DiscoveryPageDependencies>;
} = {}): Promise<DiscoveryPageLoadResult> {
  const dependencies = {
    ...DEFAULT_DISCOVERY_PAGE_DEPENDENCIES,
    ...options.dependencies,
  };

  if (!dependencies.isSupabaseServerEnvConfigured()) {
    return {
      kind: "env_missing",
      missingEnv: dependencies.getMissingSupabaseServerEnv(),
    };
  }

  const resolvedSearchParams = await Promise.resolve(options.searchParams ?? {});
  const search = dependencies.toUrlSearchParams(resolvedSearchParams);
  const query = dependencies.parseMarketDiscoveryQuery(search);
  const supabase = await dependencies.createClient();

  let viewer: MarketViewerContext = {
    userId: null,
    isAuthenticated: false,
    activeOrganizationId: null,
    hasActiveInstitution: false,
  };
  let result: DiscoveryMarketCardsResult = {
    markets: [],
    error: null,
    schemaMissing: false,
  };
  let accountSummary: ViewerAccountSummary = {
    portfolioUsd: null,
    cashUsd: null,
    avatarUrl: DEFAULT_AVATAR_URL,
    displayName: "Guest",
    isAdmin: false,
  };
  let loadError: string | null = null;

  try {
    viewer = await dependencies.getMarketViewerContext(supabase);
    accountSummary = await dependencies.getViewerAccountSummary({ supabase, viewer });
    result = await dependencies.listDiscoveryMarketCards({
      supabase,
      viewer,
      query,
    });
  } catch (caught) {
    loadError = caught instanceof Error ? caught.message : "Unknown discovery load error.";
  }

  return {
    kind: "ready",
    query,
    viewer,
    result,
    accountSummary,
    loadError,
  };
}
