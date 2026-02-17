# Theres No Chance — Full Product Build Plan (Decision-Complete)

## Summary
We will evolve the current static landing page into a full prediction market application in **small, isolated production deployments** (one feature per deploy), keeping the current landing visual style intact.

Locked decisions:
- Keep current landing as canonical marketing page (`/`).
- Build app on **Next.js (App Router + TypeScript)** for routing, auth guards, admin tools, and payment webhooks.
- Use **Supabase** for auth, Postgres, RLS, and storage.
- Use **AMM binary pricing model** for v1 (Yes/No contracts where implied prices sum to 1; winning share settles to 1 unit).
- Use **Stripe** for fiat purchases/subscriptions and **Stripe Identity** for KYC eligibility signals.
- Use **Coinbase Commerce** for USDC payments, with **Base** as the primary network path.
- Resolution authority in v1: **Platform Admin Final**.
- Market creation flow in v1: **Approval Required** before open trading.
- Private/institution gating in v1: **email-signup + verified institution domain rules** (e.g., `@college.edu`, `@students.college.edu`).
- Discovery access model in v1: **guests can view public markets**, **institution/restricted markets require login**, and **all market actions require account authentication**.
- Community/crowd resolution is explicitly postponed.

## Architecture & App Structure

## Frontend
- Framework: `Next.js` + `TypeScript`.
- Keep current landing animation/visual language by porting existing HTML/CSS/JS behavior into:
  - `app/(marketing)/page.tsx` (landing)
  - `components/landing/*` (hero, token economy, auth row, FAQ expansion).
- App shell routes:
  - `app/(auth)/login`
  - `app/(auth)/signup`
  - `app/(auth)/reset`
  - `app/(app)/markets`
  - `app/(app)/markets/[marketId]`
  - `app/(app)/portfolio`
  - `app/(app)/wallet`
  - `app/(app)/create`
  - `app/(app)/admin` (+ moderation/resolution subpages)

## Backend
- Use Next route handlers + Supabase client libraries.
- Server-only operations with service role key in secure route handlers.
- All money/token balance mutations through a single **ledger service** with idempotency keys.

## Data store
- Supabase project (already created): `ynuyfchtajpmnbcpbagb`.

## Core Data Model (must-exist objects)

## Enums
- `market_status`: `draft | review | open | trading_halted | closed | pending_resolution | resolved | finalized`
- `market_visibility`: `public | unlisted | private`
- `resolution_outcome`: `yes | no | void`
- `user_role`: `user | creator | moderator | institution_admin | platform_admin`
- `kyc_status`: `not_started | pending | verified | rejected`
- `ledger_entry_type`: `deposit | subscription_grant | pack_purchase | trade_debit | trade_credit | fee | settlement_payout | withdrawal_request | withdrawal_complete | withdrawal_failed | refund | chargeback`
- `dispute_status`: `open | under_review | upheld | rejected | expired`

## Tables
- `profiles`
  - `id` (auth user id), display fields, local area, notification prefs, privacy prefs, `kyc_status`.
- `user_roles`
  - `(user_id, role, organization_id nullable)`.
- `organizations`
  - institution/group entities.
- `organization_domains`
  - allowlisted domains, supports subdomains.
- `organization_memberships`
  - user ↔ org membership + role.
- `markets`
  - question, description, yes/no definitions, close time, expected resolution window, evidence rules, dispute rules, fee config, lifecycle status, visibility, access rules, tags, risk flags, creator, review/resolution metadata.
- `market_sources`
  - allowed/official source definitions.
- `market_evidence`
  - resolver/mod evidence links and notes.
- `market_disputes`
  - dispute creation, expiration, adjudication metadata.
- `market_amm_state`
  - `market_id`, liquidity parameter, yes/no quantity state, last price snapshot.
- `positions`
  - per-user per-market share balances and average entry metrics.
- `trade_fills`
  - immutable executed trade records with fees and before/after price.
- `wallet_accounts`
  - available vs reserved balances.
- `ledger_entries`
  - immutable money/token ledger with idempotency keys (single source of truth).
- `subscription_plans`, `user_subscriptions`, `token_grants`
- `token_pack_purchases`
- `withdrawal_requests`
- `webhook_events`
  - webhook payload + idempotency/processing status for Stripe/Coinbase.
- `admin_action_log`
  - approve/reject/halt/resolve/finalize audit trail.

## Market Execution Model (v1)
- Binary AMM with probability pricing:
  - `price_yes + price_no = 1`.
  - Settlement payout:
    - `YES` share pays `1` if outcome yes, else `0`.
    - `NO` share pays `1` if outcome no, else `0`.
- Quote endpoint returns:
  - estimated shares/cost, fees, slippage, post-trade probability.
- Execute endpoint:
  - validates market status (`open` only),
  - applies fee policy,
  - writes `trade_fills`, updates `positions`,
  - appends ledger entries atomically.

## Payments & Billing Design

## Stripe (fiat)
- Use Checkout Sessions for:
  - one-time token packs,
  - subscription tiers.
- Webhooks:
  - `checkout.session.completed`,
  - subscription lifecycle events,
  - refunds/chargebacks.
- On success: write ledger credit + receipt record.

## Coinbase Commerce (USDC on Base)
- Create hosted charge from server route.
- Only expose publishable client flow; API key server-side.
- Webhook verifies signatures and idempotently credits ledger.
- Payment metadata links charge to user and funding intent.
- **Security note**: rotate the Coinbase key that was shared in chat, then store new key in env.

## Withdrawals
- Auto payout mode enabled, but still gated by:
  - KYC verified,
  - risk checks,
  - minimum amount,
  - limits.
- Status states: `pending | completed | failed` with reason codes.
- Ledger writes on request and completion/failure transitions.

## Admin & Resolution (v1)
- Admin bootstrap via env allowlist:
  - `ADMIN_ALLOWLIST_EMAILS`.
- Admin console capabilities:
  - review queue approve/reject markets,
  - trading halt/resume,
  - resolve market yes/no/void,
  - upload/link evidence,
  - finalize after dispute window.
- Resolution pipeline:
  - `closed -> pending_resolution -> resolved -> finalized`.
- Disputes:
  - configurable window (default 48h),
  - who can dispute,
  - escalation log,
  - immutable post-finalization ledger.

## Public Product Surface

## Landing (`/`)
- Preserve current hero + animation system.
- Add **FAQ expansion below email signup**:
  - trigger text only (no box): `+ FAQ` style.
  - `+` in gold, `FAQ` in red.
  - collapsed by default, expands into Q&A list.
- FAQ starter items:
  - How markets resolve,
  - Dispute process/timing,
  - Fees,
  - Withdrawals,
  - Private/institution markets.
- Footer additions:
  - Terms, Privacy, Risk Disclosure, Contact, Status.

## Auth
- Email/password sign up/login.
- Password reset.
- Optional magic link can be enabled after core auth.

## Onboarding
- local city/region, interests.
- institution join through verified email-domain logic.

## Market discovery
- search + filters + sorting + watchlist.
- market cards: probability, volume, time to close, access badge.
- guest viewers can browse public markets without login.
- institution/restricted market detail requires login before full render.
- action modules (trade/withdraw/create market interactions) require authenticated accounts.

## Market detail page (from your sketch)
- top layout:
  - left mini Yes/No stats strip,
  - center price/volume chart with time axis,
  - right buy/sell module.
- middle:
  - market context description + metadata (date created, volume, close date).
- bottom:
  - resolution details (`resolves yes if`, `resolves no if`, resolver authority, expected resolution timing).
- personal position panel integrated in right rail or below on mobile.

## Portfolio
- open positions, realized/unrealized P&L, filters, CSV export, history.

## Important Public APIs / Interfaces / Types

## Route handlers
- `POST /api/markets` (create draft/review)
- `GET /api/markets` (discovery with filters/sorts/search)
- `GET /api/markets/:id` (detail + state)
- `POST /api/markets/:id/trade/quote`
- `POST /api/markets/:id/trade/execute`
- `POST /api/markets/:id/dispute`
- `POST /api/admin/markets/:id/approve`
- `POST /api/admin/markets/:id/reject`
- `POST /api/admin/markets/:id/halt`
- `POST /api/admin/markets/:id/resolve`
- `POST /api/admin/markets/:id/finalize`
- `POST /api/payments/stripe/checkout`
- `POST /api/payments/coinbase/charge`
- `POST /api/webhooks/stripe`
- `POST /api/webhooks/coinbase`
- `POST /api/withdrawals`

## Client contracts
- `MarketCardDTO`, `MarketDetailDTO`, `QuoteDTO`, `ExecuteTradeResultDTO`, `PositionDTO`, `LedgerEntryDTO`, `AdminQueueItemDTO`.

## Env vars (required)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_*` (tiers/packs)
- `COINBASE_COMMERCE_API_KEY`
- `COINBASE_COMMERCE_WEBHOOK_SECRET`
- `ADMIN_ALLOWLIST_EMAILS`
- `APP_BASE_URL`
- `OPENAI_API_KEY`
- `MARKET_RESEARCH_BOT_USER_ID`
- `MARKET_RESEARCH_ENABLED`
- `MARKET_RESEARCH_MODEL` (optional override, default `gpt-5`)
- `MARKET_RESEARCH_PUBLIC_MAX` (optional)
- `MARKET_RESEARCH_INSTITUTION_MAX_PER_ORG` (optional)

## Deployment Plan (isolated, one-feature-per-deploy)

1. **Foundation migration**: bootstrap Next.js + Supabase client + preserve current landing visuals at `/`.
2. **Landing FAQ expansion**: add `+ FAQ` toggle (gold plus, red FAQ), Q&A accordion under email row.
3. **Auth pages**: signup/login/reset with Supabase Auth.
4. **Onboarding**: local area + interests + institution domain verification entry.
5. **Core schema migration**: create all enums/tables + base RLS policies.
6. **Admin bootstrap + guardrails**: allowlist-based admin access control.
7. **Market creation wizard v1**: draft/review flow with validation + tags + source rules.
8. **Admin review queue**: approve/reject/halt actions and audit log.
9. **Discovery page + guest/public guardrails**: search, filters, sort, cards, watchlist, with guest access to public markets and login-required institution visibility.
10. **Market detail**: implement sketch layout with metadata/resolution panels.
11. **AMM quote/execute engine**: pricing, slippage, fee calc, trade execution + ledger.
12. **Position panel + portfolio**: holdings, P&L, history.
13. **Stripe token store**: subscriptions + packs + webhook ledger credits.
14. **Coinbase Commerce USDC (Base)**: charge creation + webhook crediting.
15. **Withdrawal pipeline**: eligibility checks + auto payout states.
16. **Resolution/dispute pipeline**: pending/resolved/finalized with dispute window.
17. **Private/institution markets**: group/domain-gated visibility and membership checks.
18. **Notifications v1**: close soon, resolve, payout, dispute, billing events.
19. **AI Market Scout Automation**: recurring public + institution research scans that generate full proposals, dedupe via fingerprint, and auto-submit valid markets into review status with admin observability.

Each step is one commit + one deploy + deployment note in commit message, matching your AGENTS rules.

## Test Cases & Scenarios

## Unit tests
- AMM math invariants (`yes + no = 1`, monotonic price impact).
- Fee and payout calculations.
- Ledger balancing/integrity + idempotency.
- Status transition guardrails (invalid transitions rejected).

## Integration tests
- Auth + role-based route protection.
- Market create -> review -> open flow.
- Admin approve/reject/halt/resolve/finalize.
- Stripe webhook idempotency and ledger credit.
- Coinbase webhook verification and duplicate-event handling.
- Withdrawal lifecycle transitions and failure paths.
- Domain-gated market visibility rules.

## E2E tests
- New user onboarding + institution domain verification.
- Buy Yes/No, see position and P&L update.
- Market closes and resolves, payout posted.
- Dispute opened in window and adjudicated.
- Portfolio export and billing history display.
- Landing FAQ toggle behavior on mobile and desktop.

## Operational checks
- Webhook dead-letter retry queue.
- Admin action audit completeness.
- Error/latency monitoring for trading and payment endpoints.
- RLS penetration tests for private market leakage.

## Assumptions & Defaults Chosen
- Current landing design remains the canonical marketing page.
- Framework migration to Next.js is acceptable if UI is visually preserved.
- v1 trading uses AMM (not order book).
- USDC provider is Coinbase Commerce; primary network target is Base.
- Stripe handles non-crypto payments and KYC provider integration (Stripe Identity).
- Market review is mandatory before open trading.
- Resolution authority is platform admin final in v1.
- AI market proposals are generated and submitted by a single dedicated bot user.
- Community/crowd resolution is intentionally out of scope for this cycle.
- Admin accounts are bootstrapped through allowlisted emails from environment configuration.
