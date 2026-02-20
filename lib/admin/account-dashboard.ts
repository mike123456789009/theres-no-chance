import { listRecentResearchRunsForAdmin, type AdminResearchRunCard } from "@/lib/automation/market-research/db";
import { getAdminAllowlistEmails, isEmailAllowlisted } from "@/lib/auth/admin";
import { marketAccessBadge, normalizeAccessRules } from "@/lib/markets/view-access";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export type AdminPageAccessResult =
  | {
      ok: true;
      adminUser: {
        id: string;
        email: string | null;
      };
      allowlist: string[];
    }
  | {
      ok: false;
      reason: "missing_server_env" | "unauthenticated" | "forbidden" | "missing_service_env";
      email?: string | null;
      allowlist?: string[];
      missingEnv?: string[];
    };

export type AdminQueueMarket = {
  id: string;
  question: string;
  status: "review" | "open";
  closeTime: string;
  createdAt: string;
  creatorId: string;
  tags: string[];
};

export type ResolutionMarket = {
  id: string;
  question: string;
  status: string;
  closeTime: string;
  resolvedAt: string | null;
  resolutionOutcome: string | null;
  creatorId: string;
  tags: string[];
};

export type ProposedMarketPreview = {
  id: string;
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  status: string;
  visibility: string;
  accessBadge: string;
  closeTime: string;
  createdAt: string;
  feeBps: number;
  creatorId: string;
  tags: string[];
  priceYes: number;
  priceNo: number;
  yesShares: number;
  noShares: number;
  poolShares: number;
  sources: Array<{
    label: string;
    url: string;
    type: string;
  }>;
};

type MarketRow = {
  id: string;
  question: string;
  status: "review" | "open";
  close_time: string;
  created_at: string;
  creator_id: string;
  tags: string[] | null;
};

type ResolutionMarketRow = {
  id: string;
  question: string;
  status: string;
  close_time: string;
  resolved_at: string | null;
  resolution_outcome: string | null;
  creator_id: string;
  tags: string[] | null;
};

type ProposedMarketRow = {
  id: string;
  question: string;
  description: string;
  resolves_yes_if: string;
  resolves_no_if: string;
  status: string;
  visibility: string;
  access_rules: Record<string, unknown> | null;
  close_time: string;
  created_at: string;
  fee_bps: number;
  creator_id: string;
  tags: string[] | null;
  market_amm_state:
    | {
        last_price_yes: number | string | null;
        last_price_no: number | string | null;
        yes_shares: number | string | null;
        no_shares: number | string | null;
      }
    | Array<{
        last_price_yes: number | string | null;
        last_price_no: number | string | null;
        yes_shares: number | string | null;
        no_shares: number | string | null;
      }>
    | null;
  market_sources:
    | Array<{
        source_label: string;
        source_url: string;
        source_type: string;
      }>
    | null;
};

export type AdminResearchRunsResult = {
  runs: AdminResearchRunCard[];
  errorMessage: string;
};

export const DEFAULT_DISPUTE_WINDOW_HOURS = 48;

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeAmmState(raw: ProposedMarketRow["market_amm_state"]): {
  last_price_yes: number | string | null;
  last_price_no: number | string | null;
  yes_shares: number | string | null;
  no_shares: number | string | null;
} | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export async function guardAdminPageAccess(): Promise<AdminPageAccessResult> {
  if (!isSupabaseServerEnvConfigured()) {
    return {
      ok: false,
      reason: "missing_server_env",
      missingEnv: getMissingSupabaseServerEnv(),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      reason: "unauthenticated",
    };
  }

  const email = user.email?.toLowerCase() ?? null;
  const allowlist = getAdminAllowlistEmails();

  if (!isEmailAllowlisted(email)) {
    return {
      ok: false,
      reason: "forbidden",
      email,
      allowlist,
    };
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return {
      ok: false,
      reason: "missing_service_env",
      email,
      allowlist,
      missingEnv: getMissingSupabaseServiceEnv(),
    };
  }

  return {
    ok: true,
    adminUser: {
      id: user.id,
      email: user.email ?? null,
    },
    allowlist,
  };
}

export async function loadAdminQueueMarkets(): Promise<{
  reviewMarkets: AdminQueueMarket[];
  openMarkets: AdminQueueMarket[];
  errorMessage: string;
}> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("markets")
    .select("id, question, status, close_time, created_at, creator_id, tags")
    .in("status", ["review", "open"])
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) {
    return {
      reviewMarkets: [],
      openMarkets: [],
      errorMessage: error.message,
    };
  }

  const rows = (data ?? []) as MarketRow[];
  const mapped = rows.map((market) => ({
    id: market.id,
    question: market.question,
    status: market.status,
    closeTime: market.close_time,
    createdAt: market.created_at,
    creatorId: market.creator_id,
    tags: market.tags ?? [],
  }));

  return {
    reviewMarkets: mapped.filter((market) => market.status === "review"),
    openMarkets: mapped.filter((market) => market.status === "open"),
    errorMessage: "",
  };
}

export function getDisputeWindowHours(): number {
  const parsed = Number(process.env.MARKET_DISPUTE_WINDOW_HOURS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.floor(parsed));
  }
  return DEFAULT_DISPUTE_WINDOW_HOURS;
}

export async function loadResolutionMarkets(): Promise<{
  readyToResolve: ResolutionMarket[];
  resolvedMarkets: ResolutionMarket[];
  errorMessage: string;
}> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: readyData, error: readyError } = await service
    .from("markets")
    .select("id, question, status, close_time, resolved_at, resolution_outcome, creator_id, tags")
    .in("status", ["open", "trading_halted", "pending_resolution"])
    .lte("close_time", nowIso)
    .order("close_time", { ascending: true })
    .limit(120);

  if (readyError) {
    return {
      readyToResolve: [],
      resolvedMarkets: [],
      errorMessage: readyError.message,
    };
  }

  const { data: resolvedData, error: resolvedError } = await service
    .from("markets")
    .select("id, question, status, close_time, resolved_at, resolution_outcome, creator_id, tags")
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(120);

  if (resolvedError) {
    return {
      readyToResolve: [],
      resolvedMarkets: [],
      errorMessage: resolvedError.message,
    };
  }

  const mapRow = (row: ResolutionMarketRow): ResolutionMarket => ({
    id: row.id,
    question: row.question,
    status: row.status,
    closeTime: row.close_time,
    resolvedAt: row.resolved_at,
    resolutionOutcome: row.resolution_outcome,
    creatorId: row.creator_id,
    tags: row.tags ?? [],
  });

  return {
    readyToResolve: ((readyData ?? []) as ResolutionMarketRow[]).map(mapRow),
    resolvedMarkets: ((resolvedData ?? []) as ResolutionMarketRow[]).map(mapRow),
    errorMessage: "",
  };
}

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

export async function loadProposedMarketPreviews(limit = 60): Promise<{
  proposals: ProposedMarketPreview[];
  errorMessage: string;
}> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("markets")
    .select(
      "id, question, description, resolves_yes_if, resolves_no_if, status, visibility, access_rules, close_time, created_at, fee_bps, creator_id, tags, market_amm_state(last_price_yes, last_price_no, yes_shares, no_shares), market_sources(source_label, source_url, source_type)"
    )
    .eq("status", "review")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      proposals: [],
      errorMessage: error.message,
    };
  }

  const rows = (data ?? []) as ProposedMarketRow[];

  return {
    proposals: rows.map((row) => {
      const amm = normalizeAmmState(row.market_amm_state);
      const priceYes = Math.max(0, Math.min(1, toNumber(amm?.last_price_yes, 0.5)));
      const priceNo = Math.max(0, Math.min(1, toNumber(amm?.last_price_no, 1 - priceYes)));
      const yesShares = Math.max(0, toNumber(amm?.yes_shares, 0));
      const noShares = Math.max(0, toNumber(amm?.no_shares, 0));
      const accessRules = normalizeAccessRules(row.access_rules);
      return {
        id: row.id,
        question: row.question,
        description: row.description,
        resolvesYesIf: row.resolves_yes_if,
        resolvesNoIf: row.resolves_no_if,
        status: row.status,
        visibility: row.visibility,
        accessBadge: marketAccessBadge(row.visibility, accessRules),
        closeTime: row.close_time,
        createdAt: row.created_at,
        feeBps: row.fee_bps,
        creatorId: row.creator_id,
        tags: row.tags ?? [],
        priceYes,
        priceNo,
        yesShares,
        noShares,
        poolShares: yesShares + noShares,
        sources: (row.market_sources ?? []).map((source) => ({
          label: source.source_label,
          url: source.source_url,
          type: source.source_type,
        })),
      };
    }),
    errorMessage: "",
  };
}
