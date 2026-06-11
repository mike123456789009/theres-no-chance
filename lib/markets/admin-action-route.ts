import { jsonError } from "@/lib/api/http-errors";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { performAdminMarketAction, type QueueAction } from "@/lib/markets/admin-actions";

type AdminMarketActionContext = {
  params: Promise<{ marketId: string }>;
};

type AdminMarketActionRouteConfig = {
  action: QueueAction;
  message: string;
};

async function readOptionalReason(request: Request): Promise<string | null> {
  try {
    const payload = (await request.json()) as { reason?: unknown };
    return typeof payload.reason === "string" ? payload.reason : null;
  } catch {
    return null;
  }
}

export function createAdminMarketActionRoute(config: AdminMarketActionRouteConfig) {
  return async function POST(request: Request, context: AdminMarketActionContext) {
    const auth = await requireAllowlistedAdmin();
    if (!auth.ok) {
      return auth.response;
    }

    const { marketId } = await context.params;
    const result = await performAdminMarketAction({
      marketId,
      action: config.action,
      adminUserId: auth.adminUser.id,
      reason: await readOptionalReason(request),
    });

    if (!result.ok) {
      return jsonError(result.status, result.error, {
        detail: result.detail,
        missingEnv: result.missingEnv,
      });
    }

    return Response.json({
      message: config.message,
      market: result.market,
    });
  };
}
