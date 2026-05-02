# Verbatim Request

PLEASE IMPLEMENT THIS PLAN:
# Current Market Maker + Auto-Retirement Upgrade Plan

## Summary

Use the existing market maker pipeline as the source of real production markets instead of adding a separate open-market demo lane. The product should generate/review/open real markets through the current admin setup, then automatically retire markets that close with no meaningful action.

Chosen defaults:
- No-action retirement outcome: `finalized` with `resolution_outcome = void`.
- Meaningful action: at least one `trade_fills` row or at least one `market_resolver_bonds` row.
- Status/health visibility: admin-only.
- Rollout: phased direct-to-`main` releases after first fixing local build/type drift.

## Key Changes

- Fix the local build drift first.
  - Remove or resolve the stale `lib/markets/read-markets.ts` shadow module so imports use the canonical `lib/markets/read-markets/index.ts`.
  - Re-run `npm run verify:public-barrels`, `npm run typecheck`, `npm test`, and `npm run build` before feature work.

- Strengthen the current market maker setup.
  - Keep `/account/admin/market-maker` as the operational entry point.
  - Add a top “Market operations health” panel showing review count, open count, closed/unresolved count, no-action retirement candidates, latest public/institution scan status, latest submitted-review count, and latest failures.
  - Keep existing admin actions: run scans, approve proposals into `open`, reject proposals, and halt open markets.

- Add automatic no-action retirement.
  - Add a Supabase RPC, e.g. `retire_no_action_closed_markets(p_actor_user_id uuid default null)`.
  - Candidate rule: `status = closed`, `close_time <= now()`, no `trade_fills`, no `market_resolver_bonds`, and not already finalized.
  - For each candidate, transition to resolved void with `void_reason = 'no_activity_at_close'`, then finalize through the same settlement/audit path used by `admin_finalize_market_v2` so accounting and logs are not bypassed.
  - Call this RPC from `/api/automation/community-resolution/sync` after `sync_market_close_state` and before/alongside due resolution/finalization sync.
  - Include counts in the cron response: `closedMarketsUpdated`, `noActionMarketsRetired`, `resolutionStatesProcessed`, `autoFinalizedMarkets`.

- Improve lifecycle display.
  - Extend market discovery DTOs to include `resolutionOutcome`, `finalizedAt`, and `voidReason`.
  - Replace plain status text like `finalized` with user-facing labels:
    - `Open for trading`
    - `Trading halted`
    - `Closed, awaiting resolution`
    - `In community vote`
    - `Resolved, awaiting finalization`
    - `Finalized: YES`
    - `Finalized: NO`
    - `Retired: no action`
    - `Finalized: VOID`
  - Apply labels on market cards and market detail header.

- Improve empty states.
  - For `status=open` returning no markets, show a helpful empty state instead of only “No markets found.”
  - CTAs:
    - `View all markets`
    - `Browse finalized markets`
    - `Create market` for authenticated users, `Create account` for guests
    - `Open market maker` for admins
  - Copy should explain that markets are generated through the market maker pipeline and may be retired automatically if no one trades or resolves them.

- Add admin-only production/system health.
  - Add a compact health section to `/account/admin/market-maker`, not a public `/status` page.
  - Include Supabase read health, service-role health, market counts by lifecycle status, automation run freshness, no-action retirement candidates, stale closed markets, and latest cron summary if available.
  - Do not expose secrets, env values, user emails beyond existing admin context, or raw signed/internal URLs.

## Public APIs / Interfaces / Types

- Extend `MarketCardDTO` with:
  - `resolutionOutcome: string | null`
  - `finalizedAt: string | null`
  - `voidReason: string | null`
  - optional derived `lifecycleLabel` if the formatting is server-side
- Add admin-only loader types for market operations health:
  - market counts by status
  - no-action retirement candidate count
  - stale closed/unresolved count
  - latest research run summaries
  - latest automation errors
- Update `/api/automation/community-resolution/sync` response summary to include `noActionMarketsRetired`.
- Add a Supabase migration for the retirement RPC. Do not add a new market status enum.

## Test Plan

- Unit tests:
  - lifecycle label formatting for all statuses and outcomes
  - no-action retirement candidate detection
  - discovery cards render `Retired: no action` for finalized void markets with `void_reason = no_activity_at_close`
  - empty-state CTAs for open-filter/no-results scenarios

- API/RPC tests:
  - no-action closed market with zero trades and zero resolver bonds becomes finalized void
  - closed market with trades is not auto-retired
  - closed market with resolver bonds is not auto-retired
  - already-finalized market is ignored
  - cron response includes retirement count

- Browser Use production QA after deploy:
  - `/markets?status=open` shows recovery CTAs when no open markets exist
  - `/markets` cards show richer lifecycle labels
  - sampled finalized void detail shows clear retired/void messaging
  - `/account/admin/market-maker` shows health panel for an admin account
  - community-resolution sync endpoint remains unauthorized without cron secret

- Required gates:
  - `npm run lint`
  - `npm run verify:public-barrels`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - Vercel deploy reaches `Ready`
  - Live behavior verified at `https://theres-no-chance.com`

## Assumptions

- We are not adding fake/demo open markets.
- Production market supply should come from the existing market maker scan/review/approve pipeline.
- A market with trades but no resolver bonds must not auto-retire; it needs resolution/moderation because user positions may require settlement.
- A market with no trades and no resolver bonds can safely finalize as void because there is no trading settlement exposure.
- Implementation should use the intent-verification gate before code changes because this affects product behavior, lifecycle semantics, admin operations, and production automation.
