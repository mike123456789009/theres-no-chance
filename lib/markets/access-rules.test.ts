import { describe, expect, it } from "vitest";

import {
  extractRequiredOrganizationIdFromAccessRules,
  hasInstitutionAccessRuleInRules,
  normalizeMarketAccessRules,
  serializeMarketAccessRules,
  withEnforcedOrganizationId,
} from "./access-rules";

describe("market access rules normalization", () => {
  it("returns safe defaults for non-object values", () => {
    const rules = normalizeMarketAccessRules(null);

    expect(rules.institutionOnly).toBe(false);
    expect(rules.organizationId).toBeNull();
    expect(rules.organizationIds).toEqual([]);
    expect(rules.institutionDomain).toBeNull();
    expect(rules.requiredDomains).toEqual([]);
    expect(rules.extras).toEqual({});
    expect(hasInstitutionAccessRuleInRules(rules)).toBe(false);
  });

  it("normalizes known fields and preserves extras", () => {
    const rules = normalizeMarketAccessRules({
      institution_only: true,
      organization_id: " 11111111-1111-4111-8111-111111111111 ",
      organizationIds: [" 22222222-2222-4222-8222-222222222222 ", "", "x-not-uuid"],
      institution_domains: ["ALPHA.EDU", "  "],
      required_domain: "Beta.edu",
      card_shadow_tone: "MINT",
      customFlag: true,
      proposalOrigin: "ai_automation",
    });

    expect(rules.institutionOnly).toBe(true);
    expect(rules.organizationId).toBe("11111111-1111-4111-8111-111111111111");
    expect(rules.organizationIds).toContain("22222222-2222-4222-8222-222222222222");
    expect(rules.organizationIds).toContain("x-not-uuid");
    expect(rules.institutionDomains).toEqual(["alpha.edu"]);
    expect(rules.requiredDomain).toBe("beta.edu");
    expect(rules.cardShadowTone).toBe("mint");
    expect(rules.extras.customFlag).toBe(true);
    expect(rules.extras.proposalOrigin).toBe("ai_automation");
  });
});

describe("institution access detection and extraction", () => {
  it("detects institution gate from non-empty but invalid organization id", () => {
    const rules = normalizeMarketAccessRules({
      organizationId: "alpha-university",
    });

    expect(hasInstitutionAccessRuleInRules(rules)).toBe(true);
    expect(extractRequiredOrganizationIdFromAccessRules(rules)).toBeNull();
  });

  it("extracts first valid organization id from list when direct value is invalid", () => {
    const rules = normalizeMarketAccessRules({
      organizationId: "not-a-uuid",
      organizationIds: ["bad", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
    });

    expect(extractRequiredOrganizationIdFromAccessRules(rules)).toBe("33333333-3333-4333-8333-333333333333");
  });
});

describe("market access rules mutation and serialization", () => {
  it("enforces organization id for institution-only market creation", () => {
    const original = normalizeMarketAccessRules({
      proposalOrigin: "ai_automation",
    });

    const enforced = withEnforcedOrganizationId(original, "55555555-5555-4555-8555-555555555555");
    const serialized = serializeMarketAccessRules(enforced);

    expect(enforced.institutionOnly).toBe(true);
    expect(enforced.organizationId).toBe("55555555-5555-4555-8555-555555555555");
    expect(serialized.institutionOnly).toBe(true);
    expect(serialized.organizationId).toBe("55555555-5555-4555-8555-555555555555");
    expect(serialized.proposalOrigin).toBe("ai_automation");
  });
});
