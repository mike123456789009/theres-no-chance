export type InstitutionAccessSnapshot = {
  activeMembership: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  } | null;
  verifiedInstitutionEmails: Array<{
    id: string;
    email: string;
    domain: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  }>;
  pendingChallenge: {
    challengeId: string;
    institutionEmailId: string;
    email: string;
    domain?: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    expiresAt: string;
    attemptCount?: number;
    maxAttempts: number;
    resendAvailableAt: string;
  } | null;
  canCreateInstitutionMarkets: boolean;
};

export type InstitutionCandidate = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  matchedDomain: string;
  allowSubdomains: boolean;
  matchType: "exact" | "suffix";
};
