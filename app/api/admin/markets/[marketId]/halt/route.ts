import { createAdminMarketActionRoute } from "@/lib/markets/admin-action-route";

export const POST = createAdminMarketActionRoute({
  action: "halt",
  message: "Trading halted for this market.",
});
