import { createAdminMarketActionRoute } from "@/lib/markets/admin-action-route";

export const POST = createAdminMarketActionRoute({
  action: "approve",
  message: "Market approved and opened for trading.",
});
