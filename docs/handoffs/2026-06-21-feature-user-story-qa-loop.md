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
- Third targeted Vitest pass added position/resolution/evidence/prize UI coverage: 4 test files / 20 tests.
- Fourth targeted Vitest pass added account/wallet/institution/portfolio/activity UI coverage: 5 test files / 19 tests.
- Fifth targeted Vitest pass added admin action UI coverage: 6 test files / 17 tests.
- Sixth targeted Vitest pass added theme and legacy redirect coverage: 2 test files / 6 tests.
- Seventh targeted Vitest pass added grant-platform-admin route coverage: 1 test file / 15 tests.
- Eighth targeted Vitest pass added admin Venmo manual match/ignore route coverage: 2 test files / 14 tests.
- Ninth targeted Vitest pass added admin market approve/reject/halt route and service coverage: 4 test files / 16 tests.
- Tenth targeted Vitest pass added admin market-research manual-run route coverage: 1 test file / 7 tests.
- Eleventh targeted Vitest pass added admin finalization/resolution/adjudication route coverage: 3 test files / 18 tests.
- Twelfth targeted Vitest pass added create-market AI criteria suggestion route and wizard coverage: 2 test files / 8 tests.
- Thirteenth targeted Vitest pass added authenticated create-market page coverage: 1 test file / 3 tests.
- Fourteenth targeted Vitest pass fixed the public withdrawal-copy mismatch and added landing payments/FAQ regression coverage: 1 test file / 2 tests.
- Fifteenth targeted Vitest pass fixed the Community Resolve final-stage scroll mismatch and added `/community-resolve` render plus page-bottom Settlement activation coverage: 1 test file / 2 tests.
- `F014` UX gap fixed: challenge copy now shows the exact additional stake from the viewer resolver bond instead of vague double-down copy.
- `F002`/`F029` UX/logistical gap fixed: landing payment/FAQ copy now states withdrawals are API/admin-assisted until self-serve cashouts ship instead of implying an account-page withdrawal UI exists.
- `F003` UX gap fixed and deployed: production visual QA found the final Settlement card could be visible while the sticky rail and active visual stayed on Human Adjudication; the scroll logic now activates the last visible stage at true page bottom, and post-deploy desktop/mobile CDP checks confirmed Settlement as the active stage.
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
- Added `components/markets/page-sections/market-detail-position-panel.test.tsx`.
- Added `components/markets/community-resolve-panel.test.tsx`.
- Added `components/markets/evidence-submission-card.test.tsx`.
- Added `components/markets/resolver-prize-boost-card.test.tsx`.
- Updated `components/markets/community-resolve-panel.tsx` to show the exact challenge stake in the challenge form.
- Updated `docs/qa/feature-user-stories.csv` rows `F012-F016` with position/resolution/evidence/prize UI test evidence and residual browser gaps.
- Added `components/account/account-nav.test.tsx`.
- Added `app/(app)/account/account-pages.test.tsx`.
- Added `components/account/profile-editor.test.tsx`.
- Added `components/account/institution-access-panel.test.tsx`.
- Added `components/wallet/ledger-table.test.tsx`.
- Updated `docs/qa/feature-user-stories.csv` rows `F021-F024` and `F026-F028` with account/wallet/institution/portfolio/activity UI test evidence and residual browser gaps.
- Added `components/admin/admin-review-queue.test.tsx`.
- Added `components/admin/admin-research-run-controls.test.tsx`.
- Added `components/admin/admin-resolution-queue.test.tsx`.
- Added `components/admin/admin-venmo-reconcile-queue.test.tsx`.
- Added `components/admin/admin-grant-control.test.tsx`.
- Added `app/(app)/account/admin/users/page-content.test.tsx`.
- Updated `docs/qa/feature-user-stories.csv` rows `F031-F032` and `F034-F037` with admin action UI test evidence and remaining route/browser gaps.
- Added `components/theme/ui-style-sync.test.tsx`.
- Added `app/(app)/legacy-redirects.test.ts`.
- Updated `docs/qa/feature-user-stories.csv` rows `F041-F042` with UI style sync/toggle and legacy redirect test evidence plus remaining browser/live-smoke gaps.
- Added `app/api/admin/users/[userId]/grant-platform-admin/route.test.ts`.
- Updated `docs/qa/feature-user-stories.csv` row `F037` with grant-platform-admin route test evidence and remaining browser-only gap.
- Added `app/api/admin/payments/venmo/match/route.test.ts`.
- Added `app/api/admin/payments/venmo/ignore/route.test.ts`.
- Updated `docs/qa/feature-user-stories.csv` row `F035` with manual Venmo match/ignore route test evidence and remaining browser-only gap.
- Added `lib/markets/admin-actions.test.ts`.
- Added `app/api/admin/markets/[marketId]/approve/route.test.ts`.
- Added `app/api/admin/markets/[marketId]/reject/route.test.ts`.
- Added `app/api/admin/markets/[marketId]/halt/route.test.ts`.
- Updated `docs/qa/feature-user-stories.csv` row `F031` with approve/reject/halt route and service test evidence plus the remaining browser-only gap.
- Added `app/api/admin/automation/market-research/run/route.test.ts`.
- Updated `docs/qa/feature-user-stories.csv` row `F032` with manual market-research run route test evidence and remaining browser/live-run gaps.
- Added `app/api/admin/markets/[marketId]/finalize/route.test.ts`.
- Added `app/api/admin/markets/[marketId]/resolve/route.test.ts`.
- Added `app/api/admin/markets/[marketId]/challenges/[challengeId]/adjudicate/route.test.ts`.
- Updated `docs/qa/feature-user-stories.csv` row `F034` with finalize/resolve/adjudicate route test evidence and the remaining browser-only gap.
- Added `app/api/markets/criteria-suggestion/route.test.ts`.
- Added `components/markets/create-market-form.test.tsx`.
- Updated `docs/qa/feature-user-stories.csv` row `F019` with criteria-suggestion API and wizard generate test evidence plus the remaining browser-only gap.
- Added `app/(app)/create/page.test.tsx`.
- Updated `docs/qa/feature-user-stories.csv` row `F017` with create-page env/auth/render test evidence plus the remaining browser-only gap.
- Updated `app/(marketing)/page.tsx` withdrawal payment/FAQ copy to avoid implying a self-serve account withdrawal UI exists.
- Updated `components/landing/marketing-page.test.tsx` with a payments/FAQ copy regression assertion.
- Updated `docs/qa/feature-user-stories.csv` rows `F002` and `F029` with the public-copy fix evidence plus the remaining withdrawal product decision.
- Updated `app/(marketing)/community-resolve/page.tsx` so the final visible stage becomes active at page bottom.
- Added `app/(marketing)/community-resolve/page.test.tsx`.
- Updated `docs/qa/feature-user-stories.csv` row `F003` with production pre-fix visual QA evidence, the shipped fix, and post-deploy production retest evidence.
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
- Position/resolution/evidence/prize UI targeted tests:
  - `npm test -- components/markets/page-sections/market-detail-position-panel.test.tsx components/markets/community-resolve-panel.test.tsx components/markets/evidence-submission-card.test.tsx components/markets/resolver-prize-boost-card.test.tsx`
  - Result: 4 test files passed, 20 tests passed.
- Account/wallet/institution/portfolio/activity UI targeted tests:
  - `npm test -- components/account/account-nav.test.tsx app/'(app)'/account/account-pages.test.tsx components/account/profile-editor.test.tsx components/account/institution-access-panel.test.tsx components/wallet/ledger-table.test.tsx`
  - Result: 5 test files passed, 19 tests passed.
- Account/wallet/institution/portfolio/activity static gates:
  - `npx eslint components/account/account-nav.test.tsx app/'(app)'/account/account-pages.test.tsx components/account/profile-editor.test.tsx components/account/institution-access-panel.test.tsx components/wallet/ledger-table.test.tsx` -> passed.
  - Standalone tracked-files TypeScript gate including the five new QA files (`npx tsc --noEmit --project /tmp/tnc-tsconfig-account-*.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Admin action UI targeted tests:
  - `npm test -- components/admin/admin-review-queue.test.tsx components/admin/admin-research-run-controls.test.tsx components/admin/admin-resolution-queue.test.tsx components/admin/admin-venmo-reconcile-queue.test.tsx components/admin/admin-grant-control.test.tsx app/'(app)'/account/admin/users/page-content.test.tsx`
  - Result: 6 test files passed, 17 tests passed.
- Admin action UI static gates:
  - `npx eslint components/admin/admin-review-queue.test.tsx components/admin/admin-research-run-controls.test.tsx components/admin/admin-resolution-queue.test.tsx components/admin/admin-venmo-reconcile-queue.test.tsx components/admin/admin-grant-control.test.tsx app/'(app)'/account/admin/users/page-content.test.tsx` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" ...admin QA files... docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> no matches.
  - `git diff --check -- ...admin QA files... docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> passed.
  - Standalone tracked-files TypeScript gate including the six new admin QA files (`npx tsc --noEmit --project /tmp/tnc-tsconfig-admin-*.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files after clearing generated `.next/types/* 2.ts` duplicates: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Theme/redirect targeted tests:
  - `npm test -- components/theme/ui-style-sync.test.tsx app/'(app)'/legacy-redirects.test.ts`
  - Result: 2 test files passed, 6 tests passed.
- Theme/redirect static gates:
  - `npx eslint components/theme/ui-style-sync.test.tsx app/'(app)'/legacy-redirects.test.ts` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md components/theme/ui-style-sync.test.tsx app/'(app)'/legacy-redirects.test.ts` -> no matches.
  - `git diff --check -- docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md components/theme/ui-style-sync.test.tsx app/'(app)'/legacy-redirects.test.ts` -> passed.
  - Standalone tracked-files TypeScript gate including the two new theme/redirect QA files (`npx tsc --noEmit --project /tmp/tnc-tsconfig-theme-*.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Production deployment evidence for commit `eacf09c`:
  - Vercel deployment `dpl_421obKynmoFhAJiR7FPdfA2a2iVT` (`https://theres-no-chance-96f1hf2ox-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live smoke: `/` -> `200`.
  - Live redirect smoke: `/wallet?status=success&invoice=TNC-123` -> `307` to `/account/wallet?status=success&invoice=TNC-123`; `/wallet` -> `/account/wallet`; `/portfolio` -> `/account/portfolio`; `/admin` and `/account/admin` -> `/account/admin/market-maker`; `/account` -> `/account/overview`.
- Grant-platform-admin route tests:
  - `npm test -- app/api/admin/users/'[userId]'/grant-platform-admin/route.test.ts`
  - Result: 1 test file passed, 15 tests passed.
- Grant-platform-admin route static gates:
  - `npx eslint app/api/admin/users/'[userId]'/grant-platform-admin/route.test.ts` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/users/'[userId]'/grant-platform-admin/route.test.ts` -> no matches.
  - `git diff --check -- docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/users/'[userId]'/grant-platform-admin/route.test.ts` -> passed.
  - Standalone tracked-files TypeScript gate including the new grant-admin route test (`npx tsc --noEmit --project /tmp/tnc-tsconfig-grant-admin-*.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files after clearing generated `.next/types/* 2.ts` duplicates: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Production deployment evidence for commit `f6ac85e`:
  - Vercel deployment `dpl_8sAxkPNocSTremxCcXRz4McXDFQ7` (`https://theres-no-chance-j7rqbqg2c-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live smoke: `/` -> `200`; `/account/admin/users` -> `200`.
  - Live grant route auth smoke: unauthenticated `POST /api/admin/users/11111111-1111-4111-8111-111111111111/grant-platform-admin` -> `401` with `{"error":"Unauthorized."}`.
- Admin Venmo match/ignore route tests:
  - `npm test -- app/api/admin/payments/venmo/match/route.test.ts app/api/admin/payments/venmo/ignore/route.test.ts`
  - Result: 2 test files passed, 14 tests passed.
- Admin Venmo match/ignore route static gates:
  - `npx eslint app/api/admin/payments/venmo/match/route.test.ts app/api/admin/payments/venmo/ignore/route.test.ts` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/payments/venmo/match/route.test.ts app/api/admin/payments/venmo/ignore/route.test.ts` -> no matches.
  - `git diff --check -- docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/payments/venmo/match/route.test.ts app/api/admin/payments/venmo/ignore/route.test.ts` -> passed.
  - Standalone tracked-files TypeScript gate including the two new admin Venmo route tests (`npx tsc --noEmit --project /tmp/tnc-tsconfig-venmo-admin.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Production deployment evidence for commit `7fe91db`:
  - Vercel deployment `dpl_DP8dPaMwFsfT4Au4LA94EGv7rcuY` (`https://theres-no-chance-gkctqbh15-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live smoke: `/` -> `200`.
  - Live Venmo match route auth smoke: unauthenticated `POST /api/admin/payments/venmo/match` -> `401` with `{"error":"Unauthorized."}`.
  - Live Venmo ignore route auth smoke: unauthenticated `POST /api/admin/payments/venmo/ignore` -> `401` with `{"error":"Unauthorized."}`.
- Admin market approve/reject/halt route and service tests:
  - `npm test -- lib/markets/admin-actions.test.ts app/api/admin/markets/'[marketId]'/approve/route.test.ts app/api/admin/markets/'[marketId]'/reject/route.test.ts app/api/admin/markets/'[marketId]'/halt/route.test.ts`
  - Result: 4 test files passed, 16 tests passed.
- Admin market approve/reject/halt static gates:
  - `npx eslint lib/markets/admin-actions.test.ts app/api/admin/markets/'[marketId]'/approve/route.test.ts app/api/admin/markets/'[marketId]'/reject/route.test.ts app/api/admin/markets/'[marketId]'/halt/route.test.ts` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md lib/markets/admin-actions.test.ts app/api/admin/markets/'[marketId]'/approve/route.test.ts app/api/admin/markets/'[marketId]'/reject/route.test.ts app/api/admin/markets/'[marketId]'/halt/route.test.ts` -> no matches.
  - `git diff --check -- docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md lib/markets/admin-actions.test.ts app/api/admin/markets/'[marketId]'/approve/route.test.ts app/api/admin/markets/'[marketId]'/reject/route.test.ts app/api/admin/markets/'[marketId]'/halt/route.test.ts` -> passed.
  - Standalone tracked-files TypeScript gate including the four new admin market action tests (`npx tsc --noEmit --project /tmp/tnc-tsconfig-admin-market-actions.json`) -> passed after tightening the missing-env mock return type.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files after clearing generated `.next/types/* 2.ts` duplicates: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Production deployment evidence for commit `1cd97f4`:
  - Vercel deployment `dpl_4xFwZzPp5QKVQk7uLr4CDFUP9CfH` (`https://theres-no-chance-c8x3n3nr2-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live smoke: `/` -> `200`.
  - Live approve route auth smoke: unauthenticated `POST /api/admin/markets/test-market/approve` -> `401` with `{"error":"Unauthorized."}`.
  - Live reject route auth smoke: unauthenticated `POST /api/admin/markets/test-market/reject` -> `401` with `{"error":"Unauthorized."}`.
  - Live halt route auth smoke: unauthenticated `POST /api/admin/markets/test-market/halt` -> `401` with `{"error":"Unauthorized."}`.
- Admin market-research manual-run route tests:
  - `npm test -- app/api/admin/automation/market-research/run/route.test.ts`
  - Result: 1 test file passed, 7 tests passed.
- Admin market-research manual-run route static gates:
  - `npx eslint app/api/admin/automation/market-research/run/route.test.ts` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/automation/market-research/run/route.test.ts` -> no matches.
  - `git diff --check -- docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/automation/market-research/run/route.test.ts` -> passed.
  - Standalone tracked-files TypeScript gate including the new admin market-research route test (`npx tsc --noEmit --project /tmp/tnc-tsconfig-admin-market-research-run.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Admin market-research manual-run production deployment:
  - Commit `70a4ede` pushed to `main`.
  - Vercel deployment `dpl_CzVM3GTChExpC4wSm421hmhhECSu` reached `Ready` for `https://theres-no-chance.com`.
  - Live root smoke: `GET https://theres-no-chance.com/` -> `200`.
  - Live route auth smoke: unauthenticated `POST /api/admin/automation/market-research/run` with `{"scope":"public"}` -> `401` with `{"error":"Unauthorized."}`.
- Admin finalization/resolution/adjudication route tests:
  - `npm test -- app/api/admin/markets/'[marketId]'/finalize/route.test.ts app/api/admin/markets/'[marketId]'/resolve/route.test.ts app/api/admin/markets/'[marketId]'/challenges/'[challengeId]'/adjudicate/route.test.ts`
  - Result: 3 test files passed, 18 tests passed.
- Admin finalization/resolution/adjudication route static gates:
  - `npx eslint app/api/admin/markets/'[marketId]'/finalize/route.test.ts app/api/admin/markets/'[marketId]'/resolve/route.test.ts app/api/admin/markets/'[marketId]'/challenges/'[challengeId]'/adjudicate/route.test.ts` -> passed with no warnings after replacing loose service-client casts.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/markets/'[marketId]'/finalize/route.test.ts app/api/admin/markets/'[marketId]'/resolve/route.test.ts app/api/admin/markets/'[marketId]'/challenges/'[challengeId]'/adjudicate/route.test.ts` -> no matches.
  - `git diff --check -- docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md app/api/admin/markets/'[marketId]'/finalize/route.test.ts app/api/admin/markets/'[marketId]'/resolve/route.test.ts app/api/admin/markets/'[marketId]'/challenges/'[challengeId]'/adjudicate/route.test.ts` -> passed.
  - Standalone tracked-files TypeScript gate including the three new admin moderation route tests (`npx tsc --noEmit --project /tmp/tnc-tsconfig-admin-resolution-routes.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Admin finalization/resolution/adjudication production deployment:
  - Commit `3b97526` pushed to `main`.
  - Vercel deployment `dpl_4wrVkRcQV7MJt8J2H2G3z74sDkou` reached `Ready` for `https://theres-no-chance.com`.
  - Live root smoke: `GET https://theres-no-chance.com/` -> `200`.
  - Live finalize route auth smoke: unauthenticated `POST /api/admin/markets/test-market/finalize` -> `401` with `{"error":"Unauthorized."}`.
  - Live resolve route auth smoke: unauthenticated `POST /api/admin/markets/test-market/resolve` -> `401` with `{"error":"Unauthorized."}`.
  - Live adjudicate route auth smoke: unauthenticated `POST /api/admin/markets/test-market/challenges/test-challenge/adjudicate` -> `401` with `{"error":"Unauthorized."}`.
- Create-market AI criteria suggestion tests:
  - `npm test -- app/api/markets/criteria-suggestion/route.test.ts components/markets/create-market-form.test.tsx`
  - Result: 2 test files passed, 8 tests passed.
- Create-market AI criteria suggestion static gates:
  - `npx eslint app/api/markets/criteria-suggestion/route.test.ts components/markets/create-market-form.test.tsx` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" app/api/markets/criteria-suggestion/route.test.ts components/markets/create-market-form.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-11-theres-no-chance-project-handoff.md docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> no matches.
  - `git diff --check -- app/api/markets/criteria-suggestion/route.test.ts components/markets/create-market-form.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-11-theres-no-chance-project-handoff.md docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> passed.
  - Standalone tracked-files TypeScript gate including the new criteria route and wizard tests (`npx tsc --noEmit --project /tmp/tnc-tsconfig-criteria-suggestion.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files: `app/api/payments/coinbase/charge/route.ts`, `app/api/webhooks/coinbase/route.ts`, and `app/api/webhooks/coinbase/route.test.ts` import missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Create-market AI criteria suggestion production deployment:
  - Commit `ff3fa24` pushed to `main`.
  - Vercel deployment `dpl_3vJNqys2X7pQ7mxWsTv7UZtsSc2C` (`https://theres-no-chance-r2rmc9wd5-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live root smoke: `GET https://theres-no-chance.com/` -> `200`.
  - Live validation smoke: unauthenticated `POST /api/markets/criteria-suggestion` with too-short basics and invalid close time -> `400` with validation details for `question`, `description`, and `closeTime`, avoiding OpenAI invocation.
- Authenticated create-market page tests:
  - `npm test -- app/'(app)'/create/page.test.tsx`
  - Result: 1 test file passed, 3 tests passed.
- Authenticated create-market page static gates:
  - `npx eslint app/'(app)'/create/page.test.tsx` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" app/'(app)'/create/page.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> no matches.
  - `git diff --check -- app/'(app)'/create/page.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> passed.
  - Standalone tracked-files TypeScript gate including the `/create` page and page test (`npx tsc --noEmit --project /tmp/tnc-tsconfig-create-page.json`) -> passed.
  - First `npm run typecheck` hit generated `.next/types/routes.d 2.ts` / validator duplicate files plus unrelated untracked Coinbase imports; after deleting only generated duplicate type files and rerunning, `npm run typecheck` remained blocked only by untracked Coinbase files importing missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Authenticated create-market page production deployment:
  - Commit `c1d1e33` pushed to `main`.
  - Vercel deployment `dpl_44VXfCyVoqgW96y55mFe9sRG1TyH` (`https://theres-no-chance-7hkbuoadl-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live root smoke: `GET https://theres-no-chance.com/` -> `200`.
  - Live create-page auth smoke: unauthenticated `GET https://theres-no-chance.com/create` -> `307` to `/login`.
- Landing payments/FAQ withdrawal-copy tests:
  - `npm test -- components/landing/marketing-page.test.tsx`
  - Result: 1 test file passed, 2 tests passed.
- Landing payments/FAQ withdrawal-copy static gates:
  - `npm test -- components/landing/marketing-page.test.tsx components/landing/hero-boot-fallback.test.tsx components/landing/engineering-proof.test.tsx`
  - Result: 3 test files passed, 4 tests passed.
  - `npx eslint app/'(marketing)'/page.tsx components/landing/marketing-page.test.tsx` -> passed.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" app/'(marketing)'/page.tsx components/landing/marketing-page.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> no matches after replacing the existing scroll-arrow glyph with `&darr;`.
  - `git diff --check -- app/'(marketing)'/page.tsx components/landing/marketing-page.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> passed.
  - Standalone tracked-files TypeScript gate including the marketing page and landing test (`npx tsc --noEmit --project /tmp/tnc-tsconfig-marketing-copy.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files importing missing `@/lib/payments/coinbase` / `coinbase-webhook`.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Landing payments/FAQ withdrawal-copy production deployment:
  - Commit `bf53c73` pushed to `main`.
  - Vercel deployment `dpl_JAjUhKjgimYHByCGeEEj4abzZGWQ` (`https://theres-no-chance-28obnwn9g-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live root smoke: `GET https://theres-no-chance.com/` -> `200`.
  - Live copy smoke found `self-serve cashouts are not exposed yet`, `Withdrawal requests run through eligibility checks and admin or API workflows`, and `Withdrawals are not a self-serve account-page flow yet`.
  - Production visual QA screenshots captured:
    - `output/playwright/tnc-withdrawal-copy-desktop.png`
    - `output/playwright/tnc-withdrawal-copy-mobile.png`
  - Desktop and mobile screenshots showed the updated payment-copy text wrapped inside the payment cards with no visible overlap or horizontal clipping; FAQ text was verified in live HTML because the FAQ is collapsed by default.
- Community Resolve production pre-fix visual QA:
  - `GET https://theres-no-chance.com/community-resolve` -> `200`.
  - Desktop full-page screenshot showed the 8-stage timeline, sticky rail, active visual, and links with no visible overlap: `output/playwright/tnc-community-resolve-desktop-full.png`.
  - Mobile full-page screenshot showed responsive single-column layout with no visible horizontal overflow: `output/playwright/tnc-community-resolve-mobile-full.png`.
  - Bottom-scroll screenshots showed a real F003 bug before the code fix: the Settlement card and `settlement-payouts.svg` were visible, but the sticky rail and active visual stayed on Human Adjudication:
    - `output/playwright/tnc-community-resolve-desktop-final-label.png`
    - `output/playwright/tnc-community-resolve-desktop-settlement-copy.png`
    - `output/playwright/tnc-community-resolve-desktop-settlement-bottom.png`
  - Direct asset smoke for `public/assets/community-resolve/settlement-payouts.svg` returned `200`; the blank offscreen final image in one mobile full-page capture was a lazy-loading screenshot artifact, not a confirmed app bug.
- Community Resolve local regression test:
  - `npm test -- app/'(marketing)'/community-resolve/page.test.tsx`
  - Result: 1 test file passed, 2 tests passed.
- Community Resolve static gates:
  - `npm test -- app/'(marketing)'/community-resolve/page.test.tsx components/landing/engineering-proof.test.tsx` -> 2 test files passed, 3 tests passed.
  - `npx eslint app/'(marketing)'/community-resolve/page.tsx app/'(marketing)'/community-resolve/page.test.tsx` -> passed with no warnings.
  - CSV validator -> 45 feature rows, 11 columns, unique IDs.
  - `LC_ALL=C rg -n "[^\\x00-\\x7F]" app/'(marketing)'/community-resolve/page.tsx app/'(marketing)'/community-resolve/page.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> no matches.
  - `git diff --check -- app/'(marketing)'/community-resolve/page.tsx app/'(marketing)'/community-resolve/page.test.tsx docs/qa/feature-user-stories.csv docs/handoffs/2026-06-21-feature-user-story-qa-loop.md` -> passed.
  - Standalone tracked-files TypeScript gate for the Community Resolve page and test (`npx tsc --noEmit --project /tmp/tnc-tsconfig-community-resolve.json`) -> passed.
  - `npm run typecheck` -> blocked by unrelated untracked Coinbase files importing missing `@/lib/payments/coinbase` / `@/lib/payments/coinbase-webhook` after clearing duplicate generated `.next/types/* 2.ts` artifacts.
  - `npm run build` -> blocked by the same unrelated untracked Coinbase route imports.
- Community Resolve production deployment and post-fix visual QA:
  - Commit `5ebf693` pushed to `main`.
  - Vercel deployment `dpl_CFCKaYYtXc8eJNheR3gXMBhgf1zh` (`https://theres-no-chance-puxwtb2am-mike123456789009s-projects.vercel.app`) reached `Ready` and was aliased to `https://theres-no-chance.com`.
  - Live route smoke: `GET https://theres-no-chance.com/community-resolve` -> `200`.
  - Live CDP page-bottom retest at desktop `1440x1000`: active rail `Settlement`, active caption `Final payouts and treasury split`, active image `/assets/community-resolve/settlement-payouts.svg`, settlement card active, no horizontal overflow, `scrollY=2102`.
  - Live CDP page-bottom retest at mobile `390x844`: active rail `Settlement`, active caption `Final payouts and treasury split`, active image `/assets/community-resolve/settlement-payouts.svg`, settlement card active, no horizontal overflow, `scrollY=3682`.
  - Production visual QA screenshots captured:
    - `output/playwright/tnc-community-resolve-fixed-cdp-desktop-default.png`
    - `output/playwright/tnc-community-resolve-fixed-cdp-desktop-bottom.png`
    - `output/playwright/tnc-community-resolve-fixed-cdp-desktop-link-states.png`
    - `output/playwright/tnc-community-resolve-fixed-cdp-mobile-default.png`
    - `output/playwright/tnc-community-resolve-fixed-cdp-mobile-bottom.png`
  - Desktop default, desktop link focus/hover, desktop bottom active state, mobile default, and mobile bottom screenshots showed coherent spacing, readable text, expected active highlighting, responsive wrapping, and no visible overlap or horizontal clipping.

## Remaining Next Actions

1. Run remaining browser QA for covered-but-not-live-visual stories:
   - `F017`: `/create` signed-in wizard rendering with a real browser/session.
   - `F019`: create-market wizard criteria generation loading, success, error, focus, and responsive states with an authenticated session.
   - `F012-F016`: detail-page composition with real/seeded positions, out-voted resolver challenge state, evidence feed layout, and contribution feed/wallet failure state.
   - `F021-F028`: account shell/theme toggle, overview responsive grid, profile avatar focus states, institution verification loading/focus states, wallet deposit copy/QR/status banner, portfolio empty states, and activity empty states.
   - `F031-F037`: admin review, research-run, moderation, Venmo reconciliation, users directory, and grant-admin pages with a signed-in admin session.
   - `F041`: landing, markets, and account surfaces in retro and modern modes, including palette switching.
2. Continue route-level tests for any future admin mutation handlers added after this handoff.
4. Expand residual auth/onboarding coverage when those surfaces are touched:
   - `F004`: password visibility toggle and page-level auth redirect.
   - `F005`: immediate-session redirect branch.
   - `F006`: invalid recovery, hash-token recovery, and password mismatch branches.
   - `F007`: protected onboarding page auth behavior.
5. Resolve product/logistical gaps:
   - Decide whether `F044` payment provider routes should be removed, documented and completed, or excluded from release.
   - Decide whether `F045` inactive create-market steps should be wired, consolidated, or removed.
   - Decide whether `F029` should stay API/admin-assisted or get a self-serve wallet withdrawal UI.
6. For any UX or logistical error fixed, update the CSV row, add/adjust focused tests, rerun the relevant gate, then mark the retest result in the same CSV.
7. Before any production push, stage only this session's files unless explicitly asked to include pre-existing dirty work.

## Permissions / Approvals

- Filesystem: unrestricted local filesystem access in this runtime.
- Network: enabled.
- Approval policy: `never`; do not request interactive command approvals.
- Deployment/push authority: project instructions allow direct push to `main` by default; every push to `main` is a production Vercel deployment trigger and must be verified as `Ready`.
- Outbound actions: no outbound messages, emails, payments, or production data mutations were performed in this QA inventory pass.
- Secrets: do not print tokens, API keys, private keys, or bearer secrets.

## Continuation Prompt

Continue in `/Users/michaelcallow/Desktop/theres-no-chance`. Start with `git status --short --untracked-files=all`, then open `docs/qa/feature-user-stories.csv`. Continue the active goal by selecting the next untested user-story cluster, writing focused tests or browser checks, documenting any failures in the CSV, fixing confirmed UX/logistical errors, and retesting. Preserve unrelated dirty files. If pushing, stage only the current session's files and verify the Vercel production deployment reaches `Ready`.
