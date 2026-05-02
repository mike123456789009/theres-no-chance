CHANGE MANIFEST

Changed:
1. Extended market lifecycle labeling so market cards can surface `Challenged` when adjudication or open challenge data is present.
2. Expanded the `/markets?status=open` empty state with recovery actions for finalized markets, market creation, login/proposal flow, next scan copy, and admin market maker access.
3. Expanded the admin market maker health loader and panel with open/finalized/review/resolution counts, market scout run summaries, latest proposal approval/rejection, community resolution sync status, automation failures, Supabase reachability, auth configuration status, and deployment metadata.
4. Updated `/api/automation/community-resolution/sync` to persist completed or failed run summaries for later admin health display.

Removed:
1. No product surface was removed.
2. No market status enum values were removed or changed.

Intentionally unchanged:
1. No public `/status` page was added; internal system signals remain behind admin access.
2. No fake or demo open-market lane was added.
3. Existing market maker scan, review, approve, reject, and halt workflows remain the operational entry point.
4. Existing unrelated dirty worktree changes were left untouched.

Added but not explicitly requested:
1. Admin-only `/account/admin/system-check`
   Reason: The user allowed either `/status` or an admin-only system check; this keeps production health data private while making future audits faster.
2. `community_resolution_sync_runs` table
   Reason: Last community-resolution sync cannot be shown reliably without a persisted run summary.
3. `adjudicationRequired` and `openChallengeCount` fields on market discovery DTOs
   Reason: Public cards need enough lifecycle data to display `Challenged` without adding a new status enum.

Scope changes or deviations:
1. Active deployment date is represented by current check time plus deployment commit/ref/environment metadata.
   Reason: Runtime Vercel env exposes commit/ref/environment and URL presence, but not a reliable deploy-created timestamp.
   Risk: The system check gives deployment identity but not exact deployment age until a future Vercel API-backed loader is added.

Unavoidable deviations:
1. Authenticated admin visual QA may depend on the in-app browser session state after deployment.
   Reason: The browser can only verify the logged-in admin panel if the current browser has an admin session.
   Smallest follow-up: Log into an admin account in the in-app browser and revisit `/account/admin/market-maker` and `/account/admin/system-check`.

Files changed:
1. app/(app)/account/admin/system-check/page.tsx
2. app/api/automation/community-resolution/sync/route.ts
3. app/api/automation/community-resolution/sync/route.test.ts
4. components/account/account-nav.tsx
5. components/admin/admin-market-operations-health.tsx
6. components/markets/page-sections/markets-discovery-results-section.tsx
7. components/markets/page-sections/markets-discovery-results-section.test.tsx
8. lib/admin/market-operations-health.ts
9. lib/markets/lifecycle.ts
10. lib/markets/lifecycle.test.ts
11. lib/markets/read-markets/discovery.ts
12. lib/markets/read-markets/query.test.ts
13. lib/markets/read-markets/types.ts
14. supabase/migrations/202605020002_community_resolution_sync_runs.sql
15. docs/intent-verification/runs/2026-05-02/20260502T102458Z-admin-market-health-and-status/*

Evidence summary:
1. Focused lifecycle, empty-state, admin-health, and cron route tests passed.
2. `npm run verify:public-barrels`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed.
3. Supabase migration `202605020002_community_resolution_sync_runs.sql` was pushed to the linked production project.
