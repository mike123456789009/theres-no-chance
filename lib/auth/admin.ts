function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

export function getAdminAllowlistEmails(): string[] {
  return parseAllowlist(process.env.ADMIN_ALLOWLIST_EMAILS);
}

export function isEmailAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = getAdminAllowlistEmails();
  return allowlist.includes(email.toLowerCase());
}

export function isAdminAllowlistConfigured(): boolean {
  return getAdminAllowlistEmails().length > 0;
}
