// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminInstitutionManager } from "./admin-institution-manager";

const routerRefreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

type MockRequest = {
  url: string;
  method: string;
  body: unknown;
};

type MockStore = {
  institutions: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    domains: Array<{
      id: string;
      organizationId: string;
      domain: string;
      allowSubdomains: boolean;
    }>;
    counts: {
      activeMembers: number;
      totalMembers: number;
      verifiedEmails: number;
      pendingEmails: number;
    };
  }>;
  identitiesByOrg: Record<
    string,
    Array<{
      id: string;
      userId: string;
      email: string;
      domain: string;
      organizationId: string;
      status: "pending_verification" | "verified" | "revoked";
      verifiedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  >;
};

function createResponse(ok: boolean, payload: unknown): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMockStore(): MockStore {
  return {
    institutions: [
      {
        id: "inst-1",
        name: "Alpha College",
        slug: "alpha",
        createdAt: "2026-02-01T12:00:00.000Z",
        domains: [
          {
            id: "domain-1",
            organizationId: "inst-1",
            domain: "alpha.edu",
            allowSubdomains: true,
          },
        ],
        counts: {
          activeMembers: 12,
          totalMembers: 18,
          verifiedEmails: 8,
          pendingEmails: 2,
        },
      },
      {
        id: "inst-2",
        name: "Beta University",
        slug: "beta",
        createdAt: "2026-02-02T12:00:00.000Z",
        domains: [
          {
            id: "domain-2",
            organizationId: "inst-2",
            domain: "beta.edu",
            allowSubdomains: true,
          },
        ],
        counts: {
          activeMembers: 9,
          totalMembers: 13,
          verifiedEmails: 6,
          pendingEmails: 1,
        },
      },
    ],
    identitiesByOrg: {
      "inst-1": [
        {
          id: "identity-1",
          userId: "user-1-aaaaaaaa",
          email: "member@alpha.edu",
          domain: "alpha.edu",
          organizationId: "inst-1",
          status: "verified",
          verifiedAt: "2026-02-05T12:00:00.000Z",
          createdAt: "2026-02-03T12:00:00.000Z",
          updatedAt: "2026-02-04T12:00:00.000Z",
        },
      ],
      "inst-2": [],
    },
  };
}

function createFetchMock(store: MockStore, requests: MockRequest[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ?? null;

    requests.push({
      url,
      method,
      body,
    });

    if (url === "/api/admin/institutions" && method === "GET") {
      return createResponse(true, { institutions: clone(store.institutions) });
    }

    const emailListMatch = url.match(/^\/api\/admin\/institutions\/([^/]+)\/emails\?limit=250$/);
    if (emailListMatch && method === "GET") {
      return createResponse(true, {
        identities: clone(store.identitiesByOrg[emailListMatch[1]] ?? []),
      });
    }

    const renameMatch = url.match(/^\/api\/admin\/institutions\/([^/]+)$/);
    if (renameMatch && method === "PATCH") {
      const institution = store.institutions.find((item) => item.id === renameMatch[1]);
      if (institution && body && typeof body === "object" && "name" in body) {
        institution.name = String(body.name);
      }
      return createResponse(true, { message: "Institution renamed." });
    }

    const addDomainMatch = url.match(/^\/api\/admin\/institutions\/([^/]+)\/domains$/);
    if (addDomainMatch && method === "POST") {
      const institution = store.institutions.find((item) => item.id === addDomainMatch[1]);
      if (institution && body && typeof body === "object" && "domain" in body && "allowSubdomains" in body) {
        institution.domains.push({
          id: `domain-${institution.domains.length + 10}`,
          organizationId: institution.id,
          domain: String(body.domain),
          allowSubdomains: Boolean(body.allowSubdomains),
        });
      }
      return createResponse(true, { message: "Institution domain added." });
    }

    const saveDomainMatch = url.match(/^\/api\/admin\/institutions\/domains\/([^/]+)$/);
    if (saveDomainMatch && method === "PATCH") {
      const domainId = saveDomainMatch[1];
      for (const institution of store.institutions) {
        const domain = institution.domains.find((item) => item.id === domainId);
        if (domain && body && typeof body === "object") {
          if ("domain" in body) domain.domain = String(body.domain);
          if ("allowSubdomains" in body) domain.allowSubdomains = Boolean(body.allowSubdomains);
          if ("organizationId" in body && typeof body.organizationId === "string") {
            domain.organizationId = body.organizationId;
          }
        }
      }
      return createResponse(true, { message: "Institution domain updated." });
    }

    const saveEmailMatch = url.match(/^\/api\/admin\/institutions\/emails\/([^/]+)$/);
    if (saveEmailMatch && method === "PATCH") {
      const identityId = saveEmailMatch[1];
      let matchedIdentity: MockStore["identitiesByOrg"][string][number] | null = null;
      let matchedOrgId: string | null = null;

      for (const [orgId, identities] of Object.entries(store.identitiesByOrg)) {
        const candidate = identities.find((identity) => identity.id === identityId);
        if (candidate) {
          matchedIdentity = candidate;
          matchedOrgId = orgId;
          break;
        }
      }

      if (matchedIdentity && matchedOrgId && body && typeof body === "object") {
        const nextOrgId = "organizationId" in body ? String(body.organizationId) : matchedIdentity.organizationId;
        matchedIdentity.email = "email" in body ? String(body.email) : matchedIdentity.email;
        matchedIdentity.status = "status" in body ? (String(body.status) as typeof matchedIdentity.status) : matchedIdentity.status;
        matchedIdentity.organizationId = nextOrgId;
        matchedIdentity.updatedAt = "2026-02-21T00:00:00.000Z";

        if (nextOrgId !== matchedOrgId) {
          store.identitiesByOrg[matchedOrgId] = store.identitiesByOrg[matchedOrgId].filter((identity) => identity.id !== identityId);
          const nextOrgIdentities = store.identitiesByOrg[nextOrgId] ?? [];
          store.identitiesByOrg[nextOrgId] = [...nextOrgIdentities, matchedIdentity];
        }
      }

      return createResponse(true, { message: "Institution email identity updated." });
    }

    if (url === "/api/admin/institutions/merge" && method === "POST") {
      if (body && typeof body === "object" && "sourceOrganizationId" in body && "targetOrganizationId" in body) {
        const sourceId = String(body.sourceOrganizationId);
        const targetId = String(body.targetOrganizationId);
        const deleteSource = "deleteSource" in body ? Boolean(body.deleteSource) : true;

        if (deleteSource) {
          store.institutions = store.institutions.filter((institution) => institution.id !== sourceId);
        }

        const sourceIdentities = store.identitiesByOrg[sourceId] ?? [];
        const targetIdentities = store.identitiesByOrg[targetId] ?? [];
        store.identitiesByOrg[targetId] = [...targetIdentities, ...sourceIdentities.map((identity) => ({ ...identity, organizationId: targetId }))];
        if (deleteSource) {
          store.identitiesByOrg[sourceId] = [];
        }
      }
      return createResponse(true, { message: "Institution merge completed." });
    }

    return createResponse(false, { error: `Unhandled request ${method} ${url}` });
  });
}

function findRequest(requests: MockRequest[], method: string, url: string): MockRequest | undefined {
  return [...requests].reverse().find((request) => request.method === method && request.url === url);
}

describe("AdminInstitutionManager interactions", () => {
  let store: MockStore;
  let requests: MockRequest[];

  beforeEach(() => {
    store = createMockStore();
    requests = [];
    routerRefreshMock.mockReset();
    vi.stubGlobal("fetch", createFetchMock(store, requests));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("submits the rename flow with normalized name", async () => {
    const user = userEvent.setup();
    render(<AdminInstitutionManager />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save institution name" })).toBeInTheDocument();
    });

    const renameInput = screen.getByLabelText("Institution name");
    await user.clear(renameInput);
    await user.type(renameInput, "  Alpha   College Updated  ");
    await user.click(screen.getByRole("button", { name: "Save institution name" }));

    await waitFor(() => {
      const request = findRequest(requests, "PATCH", "/api/admin/institutions/inst-1");
      expect(request).toBeDefined();
      expect(request?.body).toEqual({ name: "Alpha College Updated" });
    });

    await waitFor(() => {
      expect(screen.getByText("Institution renamed.")).toBeInTheDocument();
    });
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("submits the domain mapping flow with normalized domain", async () => {
    const user = userEvent.setup();
    render(<AdminInstitutionManager />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Domain mappings" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Domain mappings" }));

    const domainInput = await screen.findByDisplayValue("alpha.edu");
    await user.clear(domainInput);
    await user.type(domainInput, "Students.Alpha.edu");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const request = findRequest(requests, "PATCH", "/api/admin/institutions/domains/domain-1");
      expect(request).toBeDefined();
      expect(request?.body).toEqual({
        domain: "students.alpha.edu",
        allowSubdomains: true,
        organizationId: "inst-1",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Institution domain updated.")).toBeInTheDocument();
    });
  });

  it("submits the email identity flow with lowercased email and reassigned institution", async () => {
    const user = userEvent.setup();
    render(<AdminInstitutionManager />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Email identities" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Email identities" }));

    const emailInput = await screen.findByDisplayValue("member@alpha.edu");
    const row = emailInput.closest("tr");
    expect(row).toBeTruthy();
    if (!row) return;

    await user.clear(emailInput);
    await user.type(emailInput, "NEW@ALPHA.EDU");

    const statusSelect = within(row).getByDisplayValue("verified");
    await user.selectOptions(statusSelect, "revoked");

    const institutionSelect = within(row).getByDisplayValue("Alpha College");
    await user.selectOptions(institutionSelect, "inst-2");

    await user.click(within(row).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const request = findRequest(requests, "PATCH", "/api/admin/institutions/emails/identity-1");
      expect(request).toBeDefined();
      expect(request?.body).toEqual({
        email: "new@alpha.edu",
        organizationId: "inst-2",
        status: "revoked",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Institution email identity updated.")).toBeInTheDocument();
    });
  });

  it("submits the merge flow with the required confirmation phrase", async () => {
    const user = userEvent.setup();
    render(<AdminInstitutionManager />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Merge institutions" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Merge institutions" }));

    const confirmationInput = await screen.findByPlaceholderText("MERGE INSTITUTIONS");
    await user.type(confirmationInput, "MERGE INSTITUTIONS");
    await user.click(screen.getByRole("button", { name: "Merge institutions" }));

    await waitFor(() => {
      const request = findRequest(requests, "POST", "/api/admin/institutions/merge");
      expect(request).toBeDefined();
      expect(request?.body).toEqual({
        sourceOrganizationId: "inst-1",
        targetOrganizationId: "inst-2",
        deleteSource: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Institution merge completed.")).toBeInTheDocument();
    });
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });
});
