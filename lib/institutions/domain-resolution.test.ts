import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { resolveOrganizationForDomain } from "@/lib/institutions/domain-resolution";

type DomainRow = {
  organization_id: string;
  domain: string;
  allow_subdomains: boolean;
  organizations: {
    id: string;
    name: string;
    slug: string;
  };
};

function mockDomainRows(rows: DomainRow[]) {
  const query = {
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "organization_domains") {
      return query;
    }

    throw new Error(`Unexpected table in domain-resolution test: ${table}`);
  });

  mocks.createServiceClient.mockReturnValue({ from });
}

describe("resolveOrganizationForDomain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ambiguous when multiple candidates match without a selected org", async () => {
    mockDomainRows([
      {
        organization_id: "11111111-1111-4111-8111-111111111111",
        domain: "alpha.edu",
        allow_subdomains: true,
        organizations: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Alpha University",
          slug: "alpha-university",
        },
      },
      {
        organization_id: "22222222-2222-4222-8222-222222222222",
        domain: "alpha.edu",
        allow_subdomains: true,
        organizations: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Alpha State College",
          slug: "alpha-state-college",
        },
      },
    ]);

    const result = await resolveOrganizationForDomain({
      domain: "alpha.edu",
      createdBy: "user-123",
    });

    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("returns no_match when no candidates match and no new institution name is supplied", async () => {
    mockDomainRows([
      {
        organization_id: "11111111-1111-4111-8111-111111111111",
        domain: "alpha.edu",
        allow_subdomains: true,
        organizations: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Alpha University",
          slug: "alpha-university",
        },
      },
    ]);

    const result = await resolveOrganizationForDomain({
      domain: "unknown.edu",
      createdBy: "user-123",
    });

    expect(result.kind).toBe("no_match");
    if (result.kind === "no_match") {
      expect(result.candidates).toEqual([]);
    }
  });

  it("returns resolved when exactly one domain candidate matches", async () => {
    mockDomainRows([
      {
        organization_id: "11111111-1111-4111-8111-111111111111",
        domain: "alpha.edu",
        allow_subdomains: true,
        organizations: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Alpha University",
          slug: "alpha-university",
        },
      },
    ]);

    const result = await resolveOrganizationForDomain({
      domain: "alpha.edu",
      createdBy: "user-123",
    });

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.organization).toEqual({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Alpha University",
        slug: "alpha-university",
      });
      expect(result.createdOrganization).toBe(false);
    }
  });
});
