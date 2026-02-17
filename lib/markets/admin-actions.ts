import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type QueueAction = "approve" | "reject" | "halt";
type QueueStatus = "draft" | "review" | "open" | "trading_halted";

type AdminActionConfig = {
  fromStatus: QueueStatus;
  toStatus: QueueStatus;
  actionLogType: string;
};

const ACTION_CONFIG: Record<QueueAction, AdminActionConfig> = {
  approve: {
    fromStatus: "review",
    toStatus: "open",
    actionLogType: "market_approve",
  },
  reject: {
    fromStatus: "review",
    toStatus: "draft",
    actionLogType: "market_reject",
  },
  halt: {
    fromStatus: "open",
    toStatus: "trading_halted",
    actionLogType: "market_halt",
  },
};

type PerformAdminMarketActionInput = {
  marketId: string;
  action: QueueAction;
  adminUserId: string;
  reason?: string | null;
};

type PerformAdminMarketActionResult =
  | {
      ok: true;
      market: {
        id: string;
        status: string;
        question: string;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
      detail?: string;
      missingEnv?: string[];
    };

function sanitizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const cleaned = reason.trim().slice(0, 1000);
  return cleaned.length > 0 ? cleaned : null;
}

export async function performAdminMarketAction({
  marketId,
  action,
  adminUserId,
  reason,
}: PerformAdminMarketActionInput): Promise<PerformAdminMarketActionResult> {
  if (!isSupabaseServiceEnvConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Admin market action unavailable: missing service role configuration.",
      missingEnv: getMissingSupabaseServiceEnv(),
    };
  }

  const service = createServiceClient();
  const config = ACTION_CONFIG[action];
  const note = sanitizeReason(reason);

  const { data: market, error: marketLookupError } = await service
    .from("markets")
    .select("id, status, question")
    .eq("id", marketId)
    .maybeSingle();

  if (marketLookupError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to load market for admin action.",
      detail: marketLookupError.message,
    };
  }

  if (!market) {
    return {
      ok: false,
      status: 404,
      error: "Market not found.",
    };
  }

  if (market.status !== config.fromStatus) {
    return {
      ok: false,
      status: 409,
      error: `Market must be in '${config.fromStatus}' status for '${action}' action.`,
    };
  }

  const updatePayload: Record<string, unknown> = {
    status: config.toStatus,
  };

  if (action === "approve" || action === "reject") {
    updatePayload.reviewer_id = adminUserId;
  }

  const { data: updatedMarket, error: updateError } = await service
    .from("markets")
    .update(updatePayload)
    .eq("id", marketId)
    .eq("status", config.fromStatus)
    .select("id, status, question")
    .maybeSingle();

  if (updateError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to update market status.",
      detail: updateError.message,
    };
  }

  if (!updatedMarket) {
    return {
      ok: false,
      status: 409,
      error: "Market status changed before this action could be applied.",
    };
  }

  const { error: adminLogError } = await service.from("admin_action_log").insert({
    admin_user_id: adminUserId,
    action: config.actionLogType,
    target_type: "market",
    target_id: marketId,
    details: {
      action,
      fromStatus: config.fromStatus,
      toStatus: config.toStatus,
      reason: note,
      marketQuestion: updatedMarket.question,
    },
  });

  if (adminLogError) {
    return {
      ok: false,
      status: 500,
      error: "Market status updated but audit logging failed.",
      detail: adminLogError.message,
    };
  }

  return {
    ok: true,
    market: {
      id: updatedMarket.id,
      status: updatedMarket.status,
      question: updatedMarket.question,
    },
  };
}
