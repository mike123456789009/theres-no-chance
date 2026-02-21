import { describe, expect, it, vi } from "vitest";

import { getMarketViewerContext } from "./viewer";
import type { SupabaseServerClient } from "./types";

function createMembershipQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

describe("getMarketViewerContext", () => {
  it("returns unauthenticated context when auth lookup fails", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("no session") }),
      },
      from: vi.fn(),
    } as unknown as SupabaseServerClient;

    await expect(getMarketViewerContext(supabase)).resolves.toEqual({
      userId: null,
      isAuthenticated: false,
      activeOrganizationId: null,
      hasActiveInstitution: false,
    });
  });

  it("returns active institution membership when present", async () => {
    const membershipQuery = createMembershipQuery({
      data: { organization_id: "ABCDEF12-3456-4789-9ABC-DEF123456789" },
      error: null,
    });

    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      },
      from: vi.fn().mockReturnValue(membershipQuery),
    } as unknown as SupabaseServerClient;

    await expect(getMarketViewerContext(supabase)).resolves.toEqual({
      userId: "user-1",
      isAuthenticated: true,
      activeOrganizationId: "abcdef12-3456-4789-9abc-def123456789",
      hasActiveInstitution: true,
    });
  });

  it("degrades gracefully when membership query throws", async () => {
    const failingMembershipQuery = {
      select: vi.fn().mockImplementation(() => {
        throw new Error("db unavailable");
      }),
    };

    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-2" } }, error: null }),
      },
      from: vi.fn().mockReturnValue(failingMembershipQuery),
    } as unknown as SupabaseServerClient;

    await expect(getMarketViewerContext(supabase)).resolves.toEqual({
      userId: "user-2",
      isAuthenticated: true,
      activeOrganizationId: null,
      hasActiveInstitution: false,
    });
  });
});
