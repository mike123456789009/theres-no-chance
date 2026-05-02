BEST ESTIMATE STATEMENT OF USER INTENT

Primary goal:
Complete the remaining admin/product polish around market operations: make the admin market maker console immediately useful, make public market lifecycle state clearer, add recovery actions when no open markets exist, add an admin-only production smoke/system check surface, and ensure local type/build confidence is clean before shipping.

Explicit requests:
1. Add a top admin market health snapshot on `/account/admin/market-maker`.
2. Include open markets, finalized markets, markets pending review, markets needing resolution, last market scout run, last proposal approved/rejected, and automation failures.
3. Add public lifecycle badges on market cards with labels including `Open for trading`, `Closed, awaiting resolution`, `In community vote`, `Challenged`, and `Finalized: YES / NO / VOID`.
4. Add empty-state recovery actions for the `status=open` no-results state: view finalized markets, create a market, log in to submit a proposal, and check back after the next market scan.
5. Add a lightweight production smoke dashboard as either `/status` or an admin-only system check page.
6. The smoke dashboard should verify Supabase reachability, market count by status, auth config presence, active deployment hash/date, last market automation run, and last community resolution sync.
7. Fix or verify the stale `lib/markets/read-markets.ts` shadow-file build drift before shipping.
8. Deploy and verify the live production site.

Implied constraints:
- Prefer admin-only operational visibility to avoid exposing internal system state publicly.
- Keep the existing market maker and lifecycle implementation rather than adding demo/open-market fakery.
- Do not expose secrets, raw env values, emails beyond existing admin context, or private internal URLs.
- Keep changes scoped and do not revert unrelated dirty worktree changes.
- Direct `main` push is the production release path for this repo.

Non-goals:
- Do not add a public status page if admin-only is sufficient and safer.
- Do not change market economics or settlement behavior beyond existing lifecycle labels/ops surfaces.
- Do not touch unrelated landing/payment/hero worktree changes.

Risk of misinterpretation:
- Phrase: "/status or admin-only system check"
  Chosen interpretation: implement admin-only system check under account admin to keep production internals gated.
- Phrase: "Challenged"
  Chosen interpretation: show `Challenged` when market card data indicates adjudication is required or there are open challenges.
- Phrase: "Fix local type/build drift"
  Chosen interpretation: verify the stale shadow module remains removed and rerun type/build gates before deploying.
