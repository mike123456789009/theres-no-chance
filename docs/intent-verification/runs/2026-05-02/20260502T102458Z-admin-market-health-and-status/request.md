# Verbatim Request

also do all of these: 2. Add Admin Market Health Snapshot
On /account/admin/market-maker, add a top summary panel like:

Open markets
Finalized markets
Markets pending review
Markets needing resolution
Last market scout run
Last proposal approved/rejected
Any automation failures
This would make the admin console immediately useful instead of feeling like a hidden backend surface.

3. Create A Public “Market Lifecycle” State Badge
Market cards currently show finalized, but users don’t get much context on what that means. Add richer lifecycle labels:

Open for trading
Closed, awaiting resolution
In community vote
Challenged
Finalized: YES / NO / VOID
The detail page already has the data shape for this; surfacing it on cards would make discovery much clearer.

4. Add Empty-State Recovery Actions
The status=open filter correctly shows “No markets found,” but it should give a next step:

“View finalized markets”
“Create a market”
“Log in to submit a proposal”
“Check back after the next market scan”
This is small, but it turns a dead end into product momentum.

5. Production Smoke Dashboard
Since this app depends on Supabase, Vercel, market data, auth, and gated routes, add a lightweight /status or admin-only “system check” page that verifies:

Supabase reachable
market count by status
auth config present
active deployment hash/date
last market automation run
last community resolution sync
That would make future production audits much faster and less manual.

6. Fix The Local Type/Build Drift
The live site works, but the local repo currently fails typecheck and build because a stale lib/markets/read-markets.ts shadow file appears to conflict with the canonical barrel. Before shipping new features, I’d clean that up so local confidence matches production reality again.
