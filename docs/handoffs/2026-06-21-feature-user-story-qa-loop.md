# 2026-06-21 Feature User Story QA Loop Handoff

## Current Objective

Continue the active goal:

- Go over every feature in the app.
- Create a user story and expected behavior from current code.
- Keep one canonical spreadsheet tracking feature status.
- Then test every user story, document all errors, fix logistical or UX errors, and retest.

## Canonical Tracker

- Canonical spreadsheet: `docs/qa/feature-user-stories.csv`
- Current inventory: 45 feature rows.
- Columns include feature id, area, feature, user story, expected behavior, implementation status, test status, code references, known errors/gaps, and next action.
- Keep all user-story status and test/error notes in this CSV. Do not create a second competing tracker.

## Current Findings

- First-pass inventory covers marketing, auth, onboarding, markets, trading, resolution, create-market, account, institutions, wallet, portfolio, withdrawals, admin, automation, theme, redirects, and payments.
- First targeted Vitest pass is green for 34 test files / 150 tests.
- Second targeted Vitest pass added auth/onboarding coverage: 2 test files / 9 tests.
- Several features have API coverage but still need UI/component/browser coverage.
- Two implementation-drift items are explicitly tracked:
  - `F044`: untracked Stripe/Coinbase payment routes and Coinbase webhook test contradict `docs/CURRENT_ARCHITECTURE.md`, which says Stripe/Coinbase runtime routes are retired and intentionally absent.
  - `F045`: untracked create-market split steps exist but are not wired into `WIZARD_STEPS` or `CreateMarketForm`.
- `F029` is API-only: withdrawals are implemented as `/api/withdrawals`, but no user-facing withdrawal form was found while landing copy mentions withdrawals.

## Files Changed This Session

- Added `docs/qa/feature-user-stories.csv`.
- Added `components/auth/auth-forms.test.tsx`.
- Added `components/onboarding/onboarding-form.test.tsx`.
- Updated `docs/qa/feature-user-stories.csv` rows `F004-F007` with auth/onboarding test evidence and residual gaps.
- Added this handoff packet.

Existing dirty files were already present and were not modified:

- `AGENTS.md`
- `docs/handoffs/2026-06-11-theres-no-chance-project-handoff.md`
- Untracked payment provider route files under `app/api/payments/coinbase`, `app/api/payments/stripe`, `app/api/webhooks`
- Untracked create-market step files under `components/markets/create-market/steps`

## Verification Evidence

- CSV shape validation:
  - `node -e "...csv column validator..."` -> 46 rows, 45 data rows, no malformed rows.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" docs/qa/feature-user-stories.csv` -> no non-ASCII matches.
- Targeted tests:
  - `npm test -- components/landing/marketing-page.test.tsx components/landing/hero-boot-fallback.test.tsx components/landing/engineering-proof.test.tsx components/markets/page-sections/markets-discovery-results-section.test.tsx components/markets/page-sections/market-detail-context-section.test.tsx components/markets/trade-interface.test.tsx components/wallet/deposit-panel.test.tsx components/admin/admin-institution-manager.test.tsx app/'(app)'/account/admin/users/page-data.test.ts app/api/account/institution-access/route.test.ts app/api/account/institution-email/start/route.test.ts app/api/account/institution-email/verify/route.test.ts app/api/markets/route.test.ts app/api/markets/'[marketId]'/trade/quote/route.test.ts app/api/markets/'[marketId]'/trade/execute/route.test.ts app/api/markets/'[marketId]'/resolve/bond/route.test.ts app/api/markets/'[marketId]'/resolve/prize-contribution/route.test.ts app/api/markets/'[marketId]'/evidence/route.test.ts app/api/markets/'[marketId]'/dispute/route.test.ts app/api/payments/venmo/intent/route.test.ts app/api/payments/venmo/reconcile/route.test.ts app/api/portfolio/route.test.ts app/api/withdrawals/route.test.ts app/api/automation/community-resolution/sync/route.test.ts app/api/webhooks/coinbase/route.test.ts lib/markets/create-market-client-validation.test.ts lib/admin/market-operations-health.test.ts lib/admin/review-queue.test.ts lib/admin/access.test.ts lib/institutions/access.test.ts lib/institutions/domain-resolution.test.ts lib/institutions/challenges.test.ts lib/theme/parse.test.ts lib/payments/venmo-fees.test.ts`
  - Result: 34 test files passed, 150 tests passed.
- Auth/onboarding targeted tests:
  - `npm test -- components/auth/auth-forms.test.tsx components/onboarding/onboarding-form.test.tsx`
  - Result: 2 test files passed, 9 tests passed.

## Remaining Next Actions

1. Run the next loop over untested UI-only stories:
   - Position/evidence/resolution/prize UI `F012-F016`
   - Account overview/settings/activity and ledger `F021-F028`
   - Admin action UIs `F031`, `F034-F037`
   - Theme toggle and redirects `F041-F042`
2. Expand residual auth/onboarding coverage when those surfaces are touched:
   - `F004`: password visibility toggle and page-level auth redirect.
   - `F005`: immediate-session redirect branch.
   - `F006`: invalid recovery, hash-token recovery, and password mismatch branches.
   - `F007`: protected onboarding page auth behavior.
3. Resolve product/logistical gaps:
   - Decide whether `F044` payment provider routes should be removed, documented and completed, or excluded from release.
   - Decide whether `F045` inactive create-market steps should be wired, consolidated, or removed.
   - Decide whether `F029` needs a wallet withdrawal UI or copy adjustment.
4. For any UX or logistical error fixed, update the CSV row, add/adjust focused tests, rerun the relevant gate, then mark the retest result in the same CSV.
5. Before any production push, stage only this session's files unless explicitly asked to include pre-existing dirty work.

## Permissions / Approvals

- Filesystem: unrestricted local filesystem access in this runtime.
- Network: enabled.
- Approval policy: `never`; do not request interactive command approvals.
- Deployment/push authority: project instructions allow direct push to `main` by default; every push to `main` is a production Vercel deployment trigger and must be verified as `Ready`.
- Outbound actions: no outbound messages, emails, payments, or production data mutations were performed in this QA inventory pass.
- Secrets: do not print tokens, API keys, private keys, or bearer secrets.

## Continuation Prompt

Continue in `/Users/michaelcallow/Desktop/theres-no-chance`. Start with `git status --short --untracked-files=all`, then open `docs/qa/feature-user-stories.csv`. Continue the active goal by selecting the next untested user-story cluster, writing focused tests or browser checks, documenting any failures in the CSV, fixing confirmed UX/logistical errors, and retesting. Preserve unrelated dirty files. If pushing, stage only the current session's files and verify the Vercel production deployment reaches `Ready`.
