import type { ActiveMembershipRow, MarketViewerContext, SupabaseServerClient } from "./types";

function cleanText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getMarketViewerContext(
  supabase: SupabaseServerClient
): Promise<MarketViewerContext> {
  let user: { id: string } | null = null;
  let error: unknown = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (caught) {
    error = caught;
  }

  if (error || !user) {
    return {
      userId: null,
      isAuthenticated: false,
      activeOrganizationId: null,
      hasActiveInstitution: false,
    };
  }

  let activeOrganizationId: string | null = null;

  try {
    const { data: membershipData, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!membershipError) {
      const membership = (membershipData ?? null) as ActiveMembershipRow;
      activeOrganizationId = cleanText(membership?.organization_id).toLowerCase() || null;
    }
  } catch {
    activeOrganizationId = null;
  }

  return {
    userId: user.id,
    isAuthenticated: true,
    activeOrganizationId,
    hasActiveInstitution: Boolean(activeOrganizationId),
  };
}
