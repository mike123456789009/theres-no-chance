import { AdminAccessPanel } from "@/components/admin/admin-access-panel";
import { guardAdminPageAccess } from "@/lib/admin/account-dashboard";

import { AdminUsersPageContent } from "./page-content";
import { loadAdminUsersPageData } from "./page-data";
import type { SearchParamsInput } from "./page-data";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: Readonly<{ searchParams?: SearchParamsInput }>) {
  const access = await guardAdminPageAccess();
  if (!access.ok) {
    return <AdminAccessPanel access={access} />;
  }

  const data = await loadAdminUsersPageData({ searchParams });

  return <AdminUsersPageContent data={data} />;
}
