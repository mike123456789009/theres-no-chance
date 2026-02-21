export type InstitutionDomainSummary = {
  id: string;
  organizationId: string;
  domain: string;
  allowSubdomains: boolean;
};

export type InstitutionSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  domains: InstitutionDomainSummary[];
  counts: {
    activeMembers: number;
    totalMembers: number;
    verifiedEmails: number;
    pendingEmails: number;
  };
};

export type InstitutionEmailIdentity = {
  id: string;
  userId: string;
  email: string;
  domain: string;
  organizationId: string;
  status: "pending_verification" | "verified" | "revoked";
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StatusMessage = {
  kind: "success" | "error";
  text: string;
} | null;

export type DomainDraft = {
  domain: string;
  allowSubdomains: boolean;
  organizationId: string;
};

export type EmailDraft = {
  email: string;
  organizationId: string;
  status: InstitutionEmailIdentity["status"];
};

export type AdminInstitutionTab = "overview" | "domains" | "emails" | "merge";

export const MERGE_CONFIRM_PHRASE = "MERGE INSTITUTIONS";
