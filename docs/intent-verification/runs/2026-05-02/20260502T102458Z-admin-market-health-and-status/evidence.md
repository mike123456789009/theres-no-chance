# Evidence

## Changed Files

1. `app/(app)/account/admin/system-check/page.tsx`
2. `app/api/automation/community-resolution/sync/route.ts`
3. `app/api/automation/community-resolution/sync/route.test.ts`
4. `components/account/account-nav.tsx`
5. `components/admin/admin-market-operations-health.tsx`
6. `components/markets/page-sections/markets-discovery-results-section.tsx`
7. `components/markets/page-sections/markets-discovery-results-section.test.tsx`
8. `lib/admin/market-operations-health.ts`
9. `lib/markets/lifecycle.ts`
10. `lib/markets/lifecycle.test.ts`
11. `lib/markets/read-markets/discovery.ts`
12. `lib/markets/read-markets/query.test.ts`
13. `lib/markets/read-markets/types.ts`
14. `supabase/migrations/202605020002_community_resolution_sync_runs.sql`
15. `docs/intent-verification/runs/2026-05-02/20260502T102458Z-admin-market-health-and-status/*`

## Relevant Diffs

1. `lib/markets/lifecycle.ts` now returns `Challenged` for non-finalized markets with adjudication required or open challenge count above zero.
2. `lib/markets/read-markets/*` now includes adjudication-related DTO fields for market discovery cards.
3. `components/markets/page-sections/markets-discovery-results-section.tsx` now renders recovery CTAs for no-open-market discovery results.
4. `lib/admin/market-operations-health.ts` now composes market operations, automation, Supabase, auth, deployment, and community-sync health.
5. `components/admin/admin-market-operations-health.tsx` now renders the expanded health snapshot and system check content.
6. `app/(app)/account/admin/system-check/page.tsx` adds the admin-only production smoke dashboard.
7. `app/api/automation/community-resolution/sync/route.ts` records sync summaries into `community_resolution_sync_runs`.

## Commands Run

1. Command: `test ! -e lib/markets/read-markets.ts && echo 'stale shadow module absent'`
   Result: Passed; the stale shadow module is absent.
2. Command: `npx vitest run lib/markets/lifecycle.test.ts components/markets/page-sections/markets-discovery-results-section.test.tsx lib/admin/market-operations-health.test.ts app/api/automation/community-resolution/sync/route.test.ts`
   Result: Passed; 4 files, 10 tests.
3. Command: `npm run verify:public-barrels`
   Result: Passed.
4. Command: `npm run typecheck`
   Result: Passed.
5. Command: `npm run lint`
   Result: Passed with existing warnings and no errors.
6. Command: `npm test`
   Result: Passed; 45 files, 245 tests.
7. Command: `npm run build`
   Result: Passed; Next.js production build compiled and generated routes including `/account/admin/system-check`.
8. Command: `supabase projects list`
   Result: Passed; linked project is `ynuyfchtajpmnbcpbagb`.
9. Command: `npm run supabase:migration:list`
   Result: Passed; migration `202605020002` was local-only before push.
10. Command: `npm run supabase:db:push`
   Result: Passed; migration `202605020002_community_resolution_sync_runs.sql` applied.

## Test Results

1. Lifecycle label tests cover finalized outcomes plus challenged state.
2. Discovery empty-state tests cover authenticated/admin and guest recovery actions.
3. Admin health loader tests cover aggregation of market counts, retirement candidates, and automation errors.
4. Community-resolution sync route tests cover retirement count response and persisted run summaries.

## Visual QA

1. Pre-deploy browser verification is pending until the committed release is live on production.
2. Post-deploy browser verification will cover `/markets?status=open`, `/markets`, `/account/admin/market-maker`, `/account/admin/system-check`, and unauthorized cron access.

## Deployment Verification

1. Pre-deploy local build passed.
2. Supabase production migration applied before code deployment.
3. Vercel production deployment readiness will be checked after `git push origin main`.

## Behavior Evidence

1. Public discovery DTOs now expose `adjudicationRequired` and `openChallengeCount` fields.
2. `status=open` empty state now includes `Browse finalized markets`, account-aware proposal/create action, next-scan recovery copy, and admin market maker action when applicable.
3. Admin health loader can report latest community-resolution sync from persisted run summaries.
4. Admin system check route is protected by the same admin guard used by other admin pages.

## Known Limitations

1. The system check shows deployment commit/ref/environment and current check time, not the exact Vercel deployment creation timestamp.
2. Latest community-resolution sync will show no recorded sync until the automation endpoint runs after this migration.

## Intentionally Not Checked

1. Unrelated dirty worktree files under landing, payments, webhooks, and institution/account helper areas were not changed or staged.
