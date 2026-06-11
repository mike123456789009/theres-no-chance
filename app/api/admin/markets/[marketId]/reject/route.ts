import { createAdminMarketActionRoute } from "@/lib/markets/admin-action-route";

export const POST = createAdminMarketActionRoute({
  action: "reject",
  message: "Market rejected and moved back to draft.",
});
