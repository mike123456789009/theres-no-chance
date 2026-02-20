import { describe, expect, it } from "vitest";

import {
  collectInstitutionDomainCandidates,
  isEduDomain,
  normalizeInstitutionEmail,
  resolveInstitutionCandidate,
} from "@/lib/institutions/access";

describe("institution access helpers", () => {
  describe("normalizeInstitutionEmail", () => {
    it("normalizes a valid institution email", () => {
      expect(normalizeInstitutionEmail("  Student+1@Students.Example.EDU  ")).toEqual({
        email: "student+1@students.example.edu",
        domain: "students.example.edu",
      });
    });

    it("rejects invalid email formats", () => {
      expect(normalizeInstitutionEmail("not-an-email")).toBeNull();
      expect(normalizeInstitutionEmail("double@@example.edu")).toBeNull();
      expect(normalizeInstitutionEmail("user@bad domain.edu")).toBeNull();
    });
  });

  describe("isEduDomain", () => {
    it("accepts .edu domains and subdomains", () => {
      expect(isEduDomain("example.edu")).toBe(true);
      expect(isEduDomain("students.example.edu")).toBe(true);
    });

    it("rejects non-edu domains", () => {
      expect(isEduDomain("example.com")).toBe(false);
      expect(isEduDomain("example.edu.uk")).toBe(false);
    });
  });

  describe("collectInstitutionDomainCandidates", () => {
    const rows = [
      {
        organization_id: "11111111-1111-4111-8111-111111111111",
        domain: "example.edu",
        allow_subdomains: true,
        organizations: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Example University",
          slug: "example-university",
        },
      },
      {
        organization_id: "22222222-2222-4222-8222-222222222222",
        domain: "students.example.edu",
        allow_subdomains: true,
        organizations: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Example Students",
          slug: "example-students",
        },
      },
      {
        organization_id: "33333333-3333-4333-8333-333333333333",
        domain: "other.edu",
        allow_subdomains: false,
        organizations: {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Other University",
          slug: "other-university",
        },
      },
    ];

    it("prefers exact domain matches over suffix matches", () => {
      const candidates = collectInstitutionDomainCandidates({
        emailDomain: "students.example.edu",
        rows,
      });

      expect(candidates).toHaveLength(2);
      expect(candidates[0].id).toBe("22222222-2222-4222-8222-222222222222");
      expect(candidates[0].matchType).toBe("exact");
      expect(candidates[1].matchType).toBe("suffix");
    });

    it("returns only suffix matches when exact match is absent", () => {
      const candidates = collectInstitutionDomainCandidates({
        emailDomain: "dept.example.edu",
        rows,
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe("11111111-1111-4111-8111-111111111111");
      expect(candidates[0].matchType).toBe("suffix");
    });

    it("returns no candidates when no domains match", () => {
      const candidates = collectInstitutionDomainCandidates({
        emailDomain: "school.unknown.edu",
        rows,
      });

      expect(candidates).toEqual([]);
    });
  });

  describe("resolveInstitutionCandidate", () => {
    const candidates = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Alpha University",
        slug: "alpha-university",
        domain: "alpha.edu",
        allowSubdomains: true,
        matchType: "exact" as const,
        specificity: 9,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Beta College",
        slug: "beta-college",
        domain: "beta.edu",
        allowSubdomains: true,
        matchType: "exact" as const,
        specificity: 8,
      },
    ];

    it("returns ambiguous when multiple candidates exist and none selected", () => {
      const result = resolveInstitutionCandidate({ candidates });
      expect(result.kind).toBe("ambiguous");
    });

    it("resolves selected organization when candidate id is provided", () => {
      const result = resolveInstitutionCandidate({
        candidates,
        selectedOrganizationId: "22222222-2222-4222-8222-222222222222",
      });

      expect(result.kind).toBe("resolved");
      if (result.kind === "resolved") {
        expect(result.organization.name).toBe("Beta College");
      }
    });

    it("returns no_match for empty candidate sets", () => {
      const result = resolveInstitutionCandidate({ candidates: [] });
      expect(result.kind).toBe("no_match");
    });
  });
});
