CHANGE MANIFEST

Changed:
1. Removed the stale untracked `lib/markets/read-markets.ts` shadow module so imports resolve to the canonical `lib/markets/read-markets/index.ts` barrel.
2. Extended market discovery rows and `MarketCardDTO` with `resolutionOutcome`, `finalizedAt`, and `voidReason`.
3. Replaced plain discovery/detail status labels with lifecycle-aware labels, including `Retired: no action` for finalized void markets retired at close.
4. Replaced the bare open-filter empty state with explanatory copy and CTAs for all markets, finalized markets, market creation/account creation, and the admin market maker when applicable.
5. Added an admin-only market operations health panel to `/account/admin/market-maker`.
6. Updated `/api/automation/community-resolution/sync` to run close sync, no-action retirement, resolution sync, and finalization sync sequentially and return `noActionMarketsRetired`.
7. Added a Supabase RPC migration for `retire_no_action_closed_markets(p_actor_user_id uuid default null)`.
8. Followed live Browser Use QA feedback by tightening empty-state/admin-health CSS so the new controls render correctly in both retro and modern UI modes.

Removed:
1. Removed the stale local shadow file `lib/markets/read-markets.ts`.
2. Removed the public UI dependency on raw status strings for market cards and the market detail header.

Intentionally unchanged:
1. The current market maker page remains the operational entry point.
2. Existing admin actions for scans, approval, rejection, and halting remain in place.
3. No fake/demo market lane was added.
4. No new market status enum was added.
5. Health data remains admin-only; no public status page was added.

Added but not explicitly requested:
1. Shared lifecycle formatting helper in `lib/markets/lifecycle.ts`.
   Reason: Keeps discovery and detail labels consistent and testable.
2. Pure admin health candidate-count helper.
   Reason: Allows no-action candidate detection to be unit tested without live Supabase state.

Scope changes or deviations:
1. The health panel displays `Latest cron summary: Not persisted yet`.
   Reason: The app does not currently persist community-resolution cron summaries.
   Risk: Admins can see the fresh scan/run status and candidate counts, but not historical community cron payloads until a future persistence table is added.

Unavoidable deviations:
1. RPC behavior is covered by the migration logic plus candidate detection and cron route tests, not a live database integration test that creates production-like market rows.
   Reason: The current test suite does not run isolated Supabase integration tests.
   Smallest follow-up: Add a local Supabase test harness or SQL pgTAP-style migration test for `retire_no_action_closed_markets`.

Files changed:
1. `app/(app)/account/admin/market-maker/page.tsx`
2. `app/(app)/markets/page.tsx`
3. `app/api/automation/community-resolution/sync/route.ts`
4. `app/api/automation/community-resolution/sync/route.test.ts`
5. `app/styles/create.css`
6. `app/styles/markets.css`
7. `components/admin/admin-market-operations-health.tsx`
8. `components/markets/page-sections/market-detail-main-section.tsx`
9. `components/markets/page-sections/markets-discovery-results-section.tsx`
10. `components/markets/page-sections/markets-discovery-results-section.test.tsx`
11. `lib/admin/market-operations-health.ts`
12. `lib/admin/market-operations-health.test.ts`
13. `lib/markets/lifecycle.ts`
14. `lib/markets/lifecycle.test.ts`
15. `lib/markets/read-markets/discovery.ts`
16. `lib/markets/read-markets/query.test.ts`
17. `lib/markets/read-markets/types.ts`
18. `lib/markets/view-models/detail.ts`
19. `lib/markets/view-models/detail.test.ts`
20. `lib/markets/view-models/discovery.ts`
21. `lib/markets/view-models/discovery.test.ts`
22. `supabase/migrations/202605020001_no_action_market_retirement.sql`
23. `next-env.d.ts`
24. `docs/intent-verification/runs/2026-05-02/20260502T100238Z-market-maker-auto-retirement/*`

Evidence summary:
1. Local gates passed: lint, public barrel verification, typecheck, full test suite, and production build.
2. Supabase access was verified and the no-action retirement migration was pushed to the linked production project.
3. Production deployments for commits `4af2a9f` and `b4a35b0` reached Vercel `Ready`; the latest production alias is `https://theres-no-chance.com`.
