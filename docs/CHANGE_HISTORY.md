# Change History

## 2026-02-20 - Venmo Fee-Aware Deposits + Reconciliation Queue
Status: completed

Short description:
- Replaced Stripe wallet funding with a Venmo-first manual flow that requires invoice codes in payment notes.
- Added net-of-fee Venmo crediting using configurable fee formula (`VENMO_FEE_PERCENT`, `VENMO_FEE_FIXED_USD`).
- Converted Coinbase funding to amount-based USD deposits and ledger `deposit` credits.
- Added secure Venmo reconcile API for Gmail parser ingestion and automatic exact matching by invoice code + gross amount.
- Added admin payments page for review-required rows with manual `match + credit` and `ignore` actions.
- Added normalized deposit receipt/audit tables and fee-aware funding intent fields in Supabase schema.

Files/areas touched:
- Migrations: `supabase/migrations/202602200003_step19_venmo_dollar_deposits.sql`
- New payment modules/routes:
  - `lib/payments/venmo-fees.ts`
  - `lib/payments/venmo.ts`
  - `lib/payments/deposit-config.ts`
  - `app/api/payments/venmo/intent/route.ts`
  - `app/api/payments/venmo/reconcile/route.ts`
- Updated payment/webhook routes:
  - `app/api/payments/coinbase/charge/route.ts`
  - `lib/payments/coinbase.ts`
  - `lib/payments/coinbase-webhook.ts`
  - `app/api/payments/stripe/checkout/route.ts`
  - `app/api/webhooks/stripe/route.ts`
- Wallet/admin UI:
  - `components/wallet/deposit-panel.tsx`
  - `components/wallet/ledger-table.tsx`
  - `app/(app)/account/wallet/page.tsx`
  - `components/account/account-nav.tsx`
  - `components/admin/admin-venmo-reconcile-queue.tsx`
  - `app/(app)/account/admin/payments/page.tsx`
  - `lib/admin/account-dashboard.ts`
  - `app/styles/account.css`
- Marketing copy: `app/(marketing)/page.tsx`
- Runbooks:
  - `docs/VENMO_GMAIL_PARSER_APPS_SCRIPT.md`
  - `docs/VENMO_PAYMENTS_RUNBOOK.md`

User-visible change:
- Wallet now supports Venmo + Coinbase USD deposits, shows gross/fee/net breakdown for Venmo, and requires a generated invoice code in Venmo notes for trackable reconciliation.

## 2026-02-20 - Expanded Modern Palette Library
Status: completed

Short description:
- Expanded the modern demo palette system from 3 options to 9 options for faster visual exploration during demos.
- Added diverse cool and radical colorways (`glacier`, `tide`, `cosmos`, `volt`, `ember`, `aurora`) in addition to existing sets.
- Upgraded the toggle UI from single-cycle-only behavior to include direct colorway selection plus a `Next` button for back-to-back walkthroughs.

Files/areas touched:
- Theme runtime + hydration: `app/layout.tsx`, `components/theme/ui-style-sync.tsx`, `components/theme/style-toggle.tsx`
- Theme model/parsing: `lib/theme/types.ts`, `lib/theme/constants.ts`, `lib/theme/parse.ts`
- Theme styling: `app/styles/theme-modern.css`, `app/styles/tokens.css`
- Tests: `lib/theme/parse.test.ts`

User-visible change:
- In modern mode, demos can now switch among a larger, more diverse set of colorways instantly without code edits or git workflow steps.

## 2026-02-20 - Modern Palette Demo Switcher
Status: completed

Short description:
- Added a modern colorway demo switcher that cycles through multiple palettes (`hearth`, `sand`, `onyx`) without changing layout or behavior.
- Extended theme runtime sync to persist palette selection via cookie/local storage and apply it instantly via `data-ui-palette`.
- Added SSR + hydration support for palette initialization, including optional `?palette=` URL override for quick demos.

Files/areas touched:
- Theme runtime: `app/layout.tsx`, `components/theme/ui-style-sync.tsx`, `components/theme/style-toggle.tsx`
- Theme model/parsing: `lib/theme/types.ts`, `lib/theme/constants.ts`, `lib/theme/parse.ts`, `lib/theme/server.ts`
- Tests: `lib/theme/parse.test.ts`
- Styling tokens: `app/styles/theme-modern.css`, `app/styles/tokens.css`

User-visible change:
- In modern mode, you can now cycle colorways directly from the existing style control and demo multiple visual variants back-to-back without code changes or branching workflows.

## 2026-02-20 - Pre-Refactor Baseline Guardrail
Status: noted

Known baseline failures before the UI style-system refactor:
- `npm run typecheck` currently fails in existing trade route test typing due `MarketDetailDTO` fixture drift.
- `npm test` currently has one existing failing assertion in `lib/markets/trade-engine.test.ts`.

Note:
- These failures predate the style-toggle/theme work and should not be treated as regressions from this deployment scope.

## 2026-02-20 - Dual Style System + Toggle (Landing, Markets, Account)
Status: in progress

Short description:
- Added a two-style UI system (`retro` and `modern`) with SSR + client synchronization.
- Added account-synced style persistence via `profiles.ui_style` with cookie/local guest fallback.
- Added reusable style toggle controls to landing (top-right), market discovery header, and account layout.
- Split global styling into layered files and added Mercury-leaning modern overrides for landing, markets, and account surfaces.
- Refactored style-heavy account/wallet/admin tables/panels from inline styles to semantic CSS classes.

Files/areas touched:
- Theme runtime and model: `app/layout.tsx`, `lib/theme/*`, `components/theme/*`
- DB migration: `supabase/migrations/202602200001_step18_ui_style_preference.sql`
- Routes with new toggle placement:
  - `app/(marketing)/page.tsx`
  - `app/(app)/markets/page.tsx`
  - `app/(app)/account/layout.tsx`
- Styling split:
  - `app/globals.css`
  - `app/styles/base.css`
  - `app/styles/tokens.css`
  - `app/styles/theme-retro.css`
  - `app/styles/theme-modern.css`
  - `app/styles/landing.css`
  - `app/styles/markets.css`
  - `app/styles/account.css`
- Account/wallet/admin styling cleanup:
  - `app/(app)/account/portfolio/page.tsx`
  - `app/(app)/account/activity/page.tsx`
  - `app/(app)/account/wallet/page.tsx`
  - `app/(app)/account/settings/page.tsx`
  - `app/(app)/account/admin/moderation/page.tsx`
  - `app/(app)/account/admin/market-maker/page.tsx`
  - `app/(app)/account/admin/users/page.tsx`
  - `components/wallet/deposit-panel.tsx`
  - `components/wallet/deposit-status-banner.tsx`
  - `components/wallet/ledger-table.tsx`

User-visible change:
- Users can now toggle between retro and modern UI styles on landing, market discovery, and account pages, with preference persistence across sessions.

## 2026-02-17 - Foundation Migration (Step 1)
Status: completed

Short description:
- Bootstrapped a TypeScript Next.js App Router project in-place.
- Preserved the existing landing visuals/animation behavior by reusing current CSS and 3D script assets.
- Added baseline Supabase browser/server client helpers for upcoming auth and API work.
- Added planning and deployment tracking docs to support isolated releases.

Files/areas touched:
- App shell and route: `app/layout.tsx`, `app/(marketing)/page.tsx`, `app/globals.css`
- Runtime assets: `public/script.js`, `public/assets/favicon.svg`, `public/assets/fonts/Bungee-Regular.ttf`
- Supabase foundation: `lib/env.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`
- Project config: `package.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.mjs`, `.gitignore`
- Planning docs: `docs/BUILD_PLAN.md`, `docs/DEPLOYMENT_WORKFLOW.md`, `docs/CHANGE_HISTORY.md`

User-visible change:
- `/` is now served through Next.js while maintaining the same hero, animation, and marketing content structure.

## 2026-02-17 - Deployment Config Fix (Step 1 follow-up)
Status: completed

Short description:
- Fixed Vercel framework detection so production serves the Next.js app output instead of `public/` static output fallback.

Files/areas touched:
- Deployment config: `vercel.json`

User-visible change:
- Resolves production `404 NOT_FOUND` on `https://theres-no-chance.com` caused by framework misconfiguration.

## 2026-02-17 - Landing FAQ Expansion (Step 2)
Status: completed

Short description:
- Added a collapsed FAQ expansion directly below the email signup row on the landing page.
- Implemented the requested trigger style with a gold `+` and red `FAQ` text.

Files/areas touched:
- Landing markup: `app/(marketing)/page.tsx`
- Landing styles: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Visitors can expand/collapse a starter FAQ block covering market resolution, disputes, fees, withdrawals, and private/institution markets.

## 2026-02-17 - Auth Pages (Step 3)
Status: completed

Short description:
- Added dedicated auth routes for login, signup, and password reset.
- Implemented Supabase email/password flows for sign in, account creation, reset-link requests, and password update attempts.
- Added a shared auth shell and styling for consistent UX across auth pages.

Files/areas touched:
- Routes: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/reset/page.tsx`
- UI components: `components/auth/auth-shell.tsx`, `components/auth/login-form.tsx`, `components/auth/signup-form.tsx`, `components/auth/reset-form.tsx`
- Styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Users can now access `/login`, `/signup`, and `/reset` and interact with core account auth forms.

## 2026-02-17 - Onboarding Flow (Step 4)
Status: completed

Short description:
- Added an onboarding page to collect city/region, user interests, and optional institution email.
- Implemented institution-domain eligibility checks for education domains (including subdomains ending in `.edu`).
- Stored onboarding payload in Supabase user metadata through auth update calls.

Files/areas touched:
- Route: `app/(app)/onboarding/page.tsx`
- UI component: `components/onboarding/onboarding-form.tsx`
- Styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Users can complete initial onboarding at `/onboarding` with local context and institution verification inputs.

## 2026-02-17 - Core Schema Migration (Step 5)
Status: completed

Short description:
- Added a comprehensive Supabase SQL migration with all required enums and core product tables.
- Added baseline indexes, `updated_at` triggers, admin-role helper function, and base RLS policies across the schema.
- Included billing, ledger, webhook, trading, and moderation objects required for subsequent backend features.

Files/areas touched:
- Migration: `supabase/migrations/202602170001_step5_core_schema.sql`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- No immediate UI change; this deploy establishes the backend schema and access-control foundation for auth, trading, billing, and admin flows.

## 2026-02-17 - Admin Bootstrap Guardrails (Step 6)
Status: completed

Short description:
- Added allowlist-based admin role utilities powered by `ADMIN_ALLOWLIST_EMAILS`.
- Added a server-guarded `/admin` route that enforces authenticated allowlisted access.
- Added an admin session API endpoint for future route-handler guard checks.

Files/areas touched:
- Admin route: `app/(app)/admin/page.tsx`
- Admin API: `app/api/admin/session/route.ts`
- Auth utility: `lib/auth/admin.ts`
- Styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `/admin` now enforces allowlist-based access control and displays guarded admin shell content for authorized users.

## 2026-02-17 - Market Creation Wizard v1 (Step 7)
Status: completed

Short description:
- Added a protected market creation route with a full draft/review wizard for question setup, resolution rules, metadata, and sources.
- Added `POST /api/markets` with request validation for draft/review submission mode, source constraints, tags, risk flags, and market timings.
- Added shared market payload validation utilities to enforce source and field guardrails before insert.

Files/areas touched:
- Create route: `app/(app)/create/page.tsx`
- Create form UI: `components/markets/create-market-form.tsx`
- Markets API: `app/api/markets/route.ts`
- Validation utility: `lib/markets/create-market.ts`
- Styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Authenticated users can now visit `/create` to save market drafts or submit markets into review status using validated tags and source definitions.

## 2026-02-17 - Admin Review Queue (Step 8)
Status: completed

Short description:
- Replaced the admin shell with a functional review queue surface for pending-review and open markets.
- Added admin action APIs for `approve`, `reject`, and `halt` transitions with allowlist auth checks and status guardrails.
- Added service-role-backed admin market action utility that writes immutable records to `admin_action_log`.

Files/areas touched:
- Admin page: `app/(app)/admin/page.tsx`
- Admin queue UI: `components/admin/admin-review-queue.tsx`
- Admin action APIs:
  - `app/api/admin/markets/[marketId]/approve/route.ts`
  - `app/api/admin/markets/[marketId]/reject/route.ts`
  - `app/api/admin/markets/[marketId]/halt/route.ts`
- Admin auth guard: `lib/auth/admin-guard.ts`
- Admin action service: `lib/markets/admin-actions.ts`
- Supabase service client: `lib/supabase/service.ts`
- Styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Allowlisted admins can now process review-queue markets and halt open markets from `/admin`, with each action captured in the admin audit log.

## 2026-02-17 - Landing Auth Navigation Fix
Status: completed

Short description:
- Replaced non-functional landing auth buttons with real navigation links to auth routes.
- Preserved existing button styling while ensuring link semantics for reliable route transitions.

Files/areas touched:
- Landing route: `app/(marketing)/page.tsx`
- Styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `LOGIN` and `SIGN UP` controls on `/` now correctly navigate to `/login` and `/signup`.

## 2026-02-17 - Auth Env Fallback Hardening
Status: completed

Short description:
- Added shared Supabase public config resolution that supports both `NEXT_PUBLIC_SUPABASE_*` and legacy `SUPABASE_*` naming.
- Injected safe runtime public config into the HTML shell so client auth forms can initialize even when build-time public env injection is unavailable.
- Updated client, server, and service Supabase helpers to use unified config resolution and clearer missing-config errors.
- Added sanitization for malformed env payloads containing escaped newline suffixes (for example `\\n`).

Files/areas touched:
- Config utility: `lib/supabase/config.ts`
- Client helper: `lib/supabase/client.ts`
- Server helper: `lib/supabase/server.ts`
- Service helper: `lib/supabase/service.ts`
- App shell injection: `app/layout.tsx`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Signup/login/reset no longer fail with `Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL` when legacy `SUPABASE_*` env names exist.

## 2026-02-17 - Canonical Domain + Auth Back-Nav Top Restore
Status: completed

Short description:
- Added production-only canonical host redirect so non-canonical production hosts redirect to `https://theres-no-chance.com`.
- Added auth-route session marker logic so returning from `/login`, `/signup`, or `/reset` back to landing forces a top-of-page reset.
- Updated the landing 3D script to consume/reset that marker, restore scroll to top, and re-sync hero render state on browser `pageshow`.

Files/areas touched:
- Canonical host routing: `middleware.ts`
- Auth back-nav marker: `components/auth/auth-back-nav-flag.tsx`, `app/(auth)/layout.tsx`
- Landing runtime behavior: `public/script.js`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- The production app now normalizes to `https://theres-no-chance.com`.
- Using the browser back button from auth pages now returns users to the top of landing with hero/render state restored.

## 2026-02-17 - Auth Back Navigation Hardening + Supabase Email Routing/Branding
Status: completed

Short description:
- Hardened landing back-navigation handling to recover from browser back-forward cache rendering edge-cases by forcing a one-time reload on auth-return back events.
- Standardized auth email redirect targets to a canonical app base URL helper so signup/reset links consistently target production routes.
- Updated Supabase Auth project configuration (project `ynuyfchtajpmnbcpbagb`) to use production site URL and redirect allowlist, and customized confirmation/recovery email subject/body copy to clearly identify There&apos;s No Chance.

Files/areas touched:
- Landing runtime back-nav logic: `public/script.js`
- Auth redirect URL helper: `lib/app/base-url.ts`
- Auth forms: `components/auth/signup-form.tsx`, `components/auth/reset-form.tsx`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Browser back from `/login`, `/signup`, or `/reset` now reliably returns to a fully rendered landing page.
- New signup and password reset emails now use There&apos;s No Chance branding and route users to `https://theres-no-chance.com` paths instead of localhost URLs.

## 2026-02-17 - Auth Browser Back Determinism Patch
Status: completed

Short description:
- Added auth-route browser history trapping for users who arrived from the landing page, so pressing browser back from auth routes deterministically returns to a fresh landing load.
- Expanded landing auth-return handling to prime return flags from landing auth link clicks and recover on multiple browser lifecycle events.
- Verified with repeated automated browser-level runs of landing -> login -> browser back, including top-scroll and landing DOM checks.

Files/areas touched:
- Auth back trap: `components/auth/auth-back-nav-flag.tsx`
- Landing runtime back-flow handling: `public/script.js`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Pressing the browser back button from `/login`, `/signup`, or `/reset` after visiting landing now consistently returns to the top of a fully rendered landing page.

## 2026-02-17 - Back-Nav Regression Hotfix (Boot Fallback Visibility)
Status: completed

Short description:
- Fixed a regression where auth-return handling could leave landing initialization in an incomplete `boot` state and show non-canonical fallback headline text.
- Updated auth back handling to force clean return to `/` while still allowing landing runtime initialization to proceed.
- Hid fallback headline markup during `boot` mode so incomplete initialization can no longer display the incorrect giant-text version.

Files/areas touched:
- Auth back trap behavior: `components/auth/auth-back-nav-flag.tsx`
- Landing runtime init/back handling: `public/script.js`
- Landing boot fallback visibility: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Browser back from auth routes now returns to `/` without `?auth_return=1`.
- The non-canonical fallback headline rendering you reported will no longer appear during landing boot.

## 2026-02-17 - Landing Email Carryover To Auth Forms
Status: completed

Short description:
- Replaced the landing auth row with a client-driven component that carries the typed landing email into auth route links as a query parameter.
- Updated login and signup forms to auto-prefill the email field from the incoming `email` query parameter.

Files/areas touched:
- Landing auth row component: `components/landing/auth-row.tsx`
- Landing page integration: `app/(marketing)/page.tsx`
- Auth forms: `components/auth/login-form.tsx`, `components/auth/signup-form.tsx`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Typing an email in the landing `Enter email` field and then clicking `LOGIN` or `SIGN UP` now auto-populates the email field on the destination auth page.

## 2026-02-17 - Auth Password Visibility Toggle
Status: completed

Short description:
- Added password visibility toggles to auth forms so users can reveal or hide password input while typing.
- Applied the same interaction pattern to login, signup, and reset new-password flows.

Files/areas touched:
- Auth forms: `components/auth/login-form.tsx`, `components/auth/signup-form.tsx`, `components/auth/reset-form.tsx`
- Auth styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Users can now click `SHOW`/`HIDE` next to password fields on `/login`, `/signup`, and `/reset`.

## 2026-02-17 - Auth Back-To-Landing Full Reload Hotfix
Status: completed

Short description:
- Replaced the auth layout's client-side `Link` with a native anchor for the `Back to landing` control.
- Forced full-document navigation when returning from `/login`, `/signup`, or `/reset` to `/` so the landing renderer always initializes from a clean page load.

Files/areas touched:
- Auth layout navigation: `app/(auth)/layout.tsx`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Clicking `← Back to landing` from auth pages now returns to a fully rendered landing page instead of a blank screen.

## 2026-02-17 - Hero Word Spacing Adjustment (`NO` vs `/ A`)
Status: completed

Short description:
- Increased the horizontal spacing between `NO` and the `/ A` cluster in the hero composition.
- Added right-edge anchoring behavior so `A` remains slightly left of the right edge of `THERE'S`/`CHANCE` instead of drifting too far inward.
- Updated fallback text positioning to mirror the same wider visual separation when 3D rendering is unavailable.

Files/areas touched:
- Hero layout logic: `public/script.js`
- Hero fallback positioning: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- The hero now shows a much larger gap between `NO` and `/ A`, while `A` still sits just left of the right edge of the top and bottom words.

## 2026-02-17 - Hero Slash Centering Hotfix
Status: completed

Short description:
- Updated the hero suffix placement logic so `/` is centered between the right edge of `NO` and the left edge of `A`.
- Preserved the previously widened spacing and right-edge anchoring for `A`.

Files/areas touched:
- Hero layout logic: `public/script.js`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- The `/` now renders centered within the widened `NO` to `A` gap.

## 2026-02-17 - Shadow Button Press-In Interaction
Status: completed

Short description:
- Added a shared active/pressed interaction for shadowed action buttons so they visually depress when clicked or tapped.
- Applied the behavior across landing auth actions, auth submits, onboarding submit, market creation actions, and admin queue action buttons.
- Kept toggle controls out of this interaction pattern.

Files/areas touched:
- UI interaction styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Shadowed action buttons now "press in" on click/tap; toggle-style controls do not.

## 2026-02-17 - Landing Fallback Text Removal
Status: completed

Short description:
- Removed the static fallback headline text block from the landing hero markup.
- Removed associated fallback-text CSS rules and fallback-text display states.
- Kept the primary WebGL/SVG rendering paths unchanged.

Files/areas touched:
- Landing hero markup: `app/(marketing)/page.tsx`
- Landing renderer styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- The landing hero no longer contains or displays the separate fallback text layer.

## 2026-02-17 - CTA Border Seam Rendering Fix
Status: completed

Short description:
- Fixed the `BET ON REALITY` CTA positioning to avoid subpixel horizontal transforms that caused a non-black seam on the border in some rasterized states.
- Switched horizontal centering from `translateX(-50%)` to layout-based centering using `left/right` plus auto margins.

Files/areas touched:
- CTA positioning styles: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- The CTA border now renders consistently black without the thin off-color pixel line.

## 2026-02-17 - CTA Recenter + Pixel-Snapped Motion Fix
Status: completed

Short description:
- Restored `BET ON REALITY` to true centered horizontal positioning in the hero.
- Replaced smooth fractional vertical movement with pixel-snapped offset values computed in the landing runtime to prevent subpixel seam artifacts during CTA reveal.
- Set CTA border and drop shadow to pure black for consistent edge rendering.

Files/areas touched:
- CTA layout and styling: `app/globals.css`
- CTA reveal offset logic: `public/script.js`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `BET ON REALITY` is centered again and no longer shows the gray single-pixel seam during reveal.

## 2026-02-17 - Market Discovery + Public/Institution Access Guardrails (Step 9)
Status: completed

Short description:
- Added a connected market discovery flow at `/markets` with search, status/access filters, sorting, and market cards linked to detail pages.
- Added market detail route `/markets/[marketId]` with read-only layout sections (stats strip, chart shell, action module, context, resolution rules, and sources).
- Added server access enforcement so guest viewers can browse only public markets, while institution/restricted markets require login.
- Added explicit action gating copy and CTAs so market actions require account authentication.
- Added `GET /api/markets` and `GET /api/markets/:id` contracts to expose discovery and detail payloads with matching access controls.

Files/areas touched:
- Discovery/detail pages: `app/(app)/markets/page.tsx`, `app/(app)/markets/[marketId]/page.tsx`
- Market APIs: `app/api/markets/route.ts`, `app/api/markets/[marketId]/route.ts`
- Market read/access services: `lib/markets/read-markets.ts`, `lib/markets/view-access.ts`
- Navigation wiring: `components/landing/auth-row.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/reset/page.tsx`, `app/(app)/create/page.tsx`
- Styling: `app/globals.css`
- Planning + deployment log: `docs/BUILD_PLAN.md`, `docs/CHANGE_HISTORY.md`

User-visible change:
- Unauthenticated visitors can now browse public markets and open public market detail pages.
- Institution/restricted markets now require login before detail access.
- Action areas now clearly direct guests to create an account/login before taking market actions.

## 2026-02-17 - Market Schema-Missing Graceful Degradation Hotfix
Status: completed

Short description:
- Added schema-aware handling for environments where `public.markets` is not provisioned yet.
- Updated discovery and detail read services to detect schema-cache missing-table errors and return controlled responses.
- Updated market APIs and pages to avoid raw 500 failures and show clear provisioning guidance instead.

Files/areas touched:
- Market read service: `lib/markets/read-markets.ts`
- Market APIs: `app/api/markets/route.ts`, `app/api/markets/[marketId]/route.ts`
- Market pages: `app/(app)/markets/page.tsx`, `app/(app)/markets/[marketId]/page.tsx`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `/markets` and market detail flows now render guidance instead of crashing when the Supabase market schema has not been applied in an environment.

## 2026-02-17 - Market Discovery Product UI Redesign + Card Shadow Customization
Status: completed

Short description:
- Reworked `/markets` into a denser product-style experience with a compact sticky top toolbar, quick category pills, and a 4-column desktop market grid inspired by modern trading discovery layouts.
- Reduced excess top/side whitespace and removed the centered oversized shell so discovery uses screen real estate efficiently.
- Added market-card drop-shadow color themes (`mint`, `sky`, `lemon`, `lavender`, `peach`, `rose`) that can be selected by market creators.
- Added market presentation utilities and deterministic fallback shadow tone selection for existing markets without an explicit tone.

Files/areas touched:
- Discovery UI: `app/(app)/markets/page.tsx`
- Discovery and card styling: `app/globals.css`
- Market creation customization: `components/markets/create-market-form.tsx`
- Market read projection: `lib/markets/read-markets.ts`, `lib/markets/presentation.ts`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `/markets` now looks and behaves like a dense product discovery surface instead of a sparse centered page.
- Market cards now display with light rectangular style and color-tinted drop shadows.
- New markets can choose their card shadow tone in the creation flow.

## 2026-02-17 - Supabase Step 5 Migration Applied To Production Project
Status: completed

Short description:
- Linked Supabase CLI to project `ynuyfchtajpmnbcpbagb` in a clean workdir and pushed `202602170001_step5_core_schema.sql` directly to remote.
- Verified `public.markets` endpoint availability after migration.

Files/areas touched:
- Remote infrastructure state only (no repository file changes).

User-visible change:
- Market APIs can now query `public.markets` without schema-missing failures.

## 2026-02-17 - Markets Route Crash Guard Hotfix
Status: completed

Short description:
- Added defensive catch handling around markets discovery/detail Supabase reads to prevent thrown request exceptions from crashing server rendering.
- Added route-level `app/(app)/markets/error.tsx` boundary so unexpected runtime exceptions render a recoverable retry screen instead of the generic Next.js app error page.

Files/areas touched:
- Market read service hardening: `lib/markets/read-markets.ts`
- Route error boundary: `app/(app)/markets/error.tsx`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `/markets` now fails gracefully with a retryable error panel if a transient server error occurs, instead of showing the raw application error digest screen.

## 2026-02-17 - Markets Auth-Cookie Crash Root-Cause Fix
Status: completed

Short description:
- Fixed Supabase server-client cookie refresh writes in Server Component contexts by safely ignoring unsupported cookie-set operations during render.
- Added defensive catch handling around viewer auth lookup (`supabase.auth.getUser`) to prevent session-related exceptions from crashing market discovery rendering.

Files/areas touched:
- Supabase server client cookie handling: `lib/supabase/server.ts`
- Markets auth viewer lookup hardening: `lib/markets/read-markets.ts`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `/markets` no longer crashes for sessions with stale/refreshing auth cookies and should render normally instead of dropping into the temporary-unavailable error panel.

## 2026-02-17 - Markets Full-Width Navigation Refactor + Signal-Dense Header
Status: completed

Short description:
- Rebuilt `/markets` top navigation into a full-width horizontal product header (no boxed shell) with brand, search, category strip, and account context.
- Added top-right discovery context similar to trading surfaces: `Portfolio`, `Cash`, and a `Deposit` CTA, with wallet-aware values for authenticated users and guest-safe placeholders otherwise.
- Reduced excessive shadowing across controls and navigation while keeping depth where it matters (primary CTA buttons and market cards).
- Preserved existing guest/public guardrails and added extra page-level try/catch handling so unexpected discovery load failures render in-page instead of bubbling to a digest crash page.

Files/areas touched:
- Markets page structure and safety handling: `app/(app)/markets/page.tsx`
- Markets discovery styling and responsive behavior: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `/markets` now reads as a more navigable, high-density product page with a full-width top bar and category navigation.
- The header now surfaces portfolio/cash/deposit context and cleaner controls.
- The page keeps functioning gracefully even when discovery data calls fail unexpectedly.

## 2026-02-17 - Markets Header Brand Swap To Landing TNC Logo
Status: completed

Short description:
- Replaced the `/markets` top-left text brand block with the same `T/N/C` logo motif used on the landing page.
- Tuned logo sizing for the markets header while preserving the landing logo color/border treatment.
- Removed no-longer-used markets brand text CSS definitions.

Files/areas touched:
- Markets header markup: `app/(app)/markets/page.tsx`
- Markets header styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- The markets page now shows the branded landing-style TNC logo in the top-left instead of text labels.

## 2026-02-17 - Markets Header Cleanup (Remove Landing Link + Duplicate Filter Strip)
Status: completed

Short description:
- Removed the `Landing` text link from the `/markets` inline header links.
- Removed the lower quick-filter pill strip because it duplicated category navigation already present above it.
- Kept the top-left TNC logo as the primary path back to the landing page (`/`).

Files/areas touched:
- Markets header markup: `app/(app)/markets/page.tsx`
- Redundant quick-filter styles: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Header is cleaner and less redundant: no extra `Landing` link beside `Create/Log in/Sign up`, and no duplicate filter row under the main nav.

## 2026-02-17 - Markets Nav Simplification + Form Control Text-Clipping Fix
Status: completed

Short description:
- Removed `Breaking` from the primary markets category nav to avoid redundancy with `Trending` and `New`.
- Updated text input/select sizing and typography in auth, onboarding, create, and markets controls to prevent clipped text in form fields and dropdowns.
- Replaced fixed-height markets search/select controls with min-height + improved line-height and box sizing for reliable cross-browser rendering.

Files/areas touched:
- Markets category nav: `app/(app)/markets/page.tsx`
- Form control sizing/typography: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `Breaking` no longer appears in the top nav categories.
- Dropdown and textbox labels/content (including `Closing soon`) render fully without cut-off descenders.

## 2026-02-17 - Force Hard Reload On All Landing Return Links
Status: completed

Short description:
- Replaced all landing-return `Link` routes (`href="/"`) with plain anchor navigation (`<a href="/">...`) to force full document reloads.
- This ensures returns to landing always do a full document reload instead of client-side route transitions.
- Applied to markets logo return, error/fallback return links, and home-return links across create/admin/onboarding/detail flows.

Files/areas touched:
- Landing-return links: `app/(app)/markets/page.tsx`, `app/(app)/markets/error.tsx`, `app/(app)/markets/[marketId]/page.tsx`
- Home-return links: `app/(app)/create/page.tsx`, `app/(app)/admin/page.tsx`, `app/(app)/onboarding/page.tsx`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Clicking any link intended to return to landing now performs a hard refresh of `/`, preventing blank client-transition states.

## 2026-02-17 - Landing Renderer Dependency Hardening (Local Three.js Vendor)
Status: completed

Short description:
- Removed landing hero dependence on third-party CDN module resolution during boot.
- Vendored Three.js runtime modules used by `public/script.js` into same-origin static paths under `public/vendor/three`.
- Updated the landing import map to load `three` and `three/addons/*` from local `/vendor/three/...` URLs.

Files/areas touched:
- Landing import map source: `app/(marketing)/page.tsx`
- Local vendor modules: `public/vendor/three/build/three.module.js`, `public/vendor/three/examples/jsm/*`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Landing loads reliably on hard refresh and on return-from-app navigation even when external CDN module fetches are blocked or flaky.

## 2026-02-17 - Markets Toolbar Alignment + Control Sizing Normalization
Status: completed

Short description:
- Normalized `/markets` toolbar select controls to explicit fixed height with a consistent custom caret so the control box no longer renders oversized or misaligned across browsers.
- Aligned the toolbar row vertically so `APPLY` and inline links (`CREATE`, `LOG IN`, `SIGN UP`) sit on the same visual center line.
- Kept the mobile stacked toolbar behavior intact while removing extra desktop-only inline-link height from the compact layout.

Files/areas touched:
- Markets toolbar/control styling: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Status/access/sort dropdowns now render at consistent height with proper caret placement.
- `APPLY` and `CREATE` alignment in the toolbar row is visually balanced and no longer appears offset.

## 2026-02-17 - Landing Cross-Browser Boot Hardening
Status: completed

Short description:
- Removed the landing page import-map boot dependency and switched the hero runtime imports to direct same-origin vendor module URLs.
- Updated vendored Three.js addon files used by the landing renderer to import `three.module.js` via explicit same-origin path instead of bare `three` specifiers.
- Added static fallback hero word markup and styles that render during `boot`/`fallback` modes so landing never appears blank if JS module initialization fails.
- Added hero-ready display guard so fallback words stay visible until the 3D/SVG renderer has successfully painted at least one frame.

Files/areas touched:
- Landing markup: `app/(marketing)/page.tsx`
- Landing styles: `app/globals.css`
- Landing runtime imports: `public/script.js`
- Vendored module imports:
  - `public/vendor/three/examples/jsm/geometries/TextGeometry.js`
  - `public/vendor/three/examples/jsm/loaders/FontLoader.js`
  - `public/vendor/three/examples/jsm/loaders/TTFLoader.js`
  - `public/vendor/three/examples/jsm/renderers/SVGRenderer.js`
  - `public/vendor/three/examples/jsm/renderers/Projector.js`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Landing page remains readable/loadable on more browsers and network conditions that previously could fail module boot and show a blank hero area.

## 2026-02-17 - Landing Fallback Removal (Owner Direction)
Status: completed

Short description:
- Removed all visual fallback wordmark markup/styles from landing hero.
- Removed JS fallback support branches (`fallback` render mode path, fallback badge, hero-ready fallback toggles).
- Kept explicit same-origin vendor module loading and primary renderer paths only.

Files/areas touched:
- Landing markup: `app/(marketing)/page.tsx`
- Landing styles: `app/globals.css`
- Landing runtime logic: `public/script.js`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Landing now renders only the canonical hero renderer output (no alternate fallback wordmark variant).

## 2026-02-17 - Markets Header Rebalance (Search Width + Logo Height Match)
Status: completed

Short description:
- Rebalanced the `/markets` top header grid so search no longer stretches across nearly the full row on desktop.
- Added a shared markets control-height token and applied it to search input/button plus filter select/apply controls.
- Matched TNC logo tile height to the shared search control height while preserving landing logo styles.
- Reserved additional right-side space for account metrics/actions without adding new account content.

Files/areas touched:
- Markets header/layout styles: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- Desktop `/markets` now has a narrower, capped search area, a logo block that matches search input height, and a roomier account strip on the right with aligned controls.

## 2026-02-17 - AI Market Scout Automation (Public + Institution)
Status: completed

Short description:
- Added shared market taxonomy constants used by both `/markets` UI navigation and AI market scouting so category definitions cannot drift.
- Added new Supabase persistence for AI research runs/proposals with dedupe and run-lock guardrails.
- Added automation-safe proposal submission service that reuses market creation validation, forces review-mode submission, stamps AI metadata in `access_rules`, and writes admin audit logs.
- Added OpenAI Responses-based public and institution research engines with retries, timeout guardrails, confidence/source/time-window quality gates, and per-scope proposal caps.
- Added CLI automation runner + npm scripts for recurring codex automation execution and markdown run summaries.
- Added admin observability section for latest AI runs and proposal submission outcomes.

Files/areas touched:
- Shared taxonomy: `lib/markets/taxonomy.ts`, `app/(app)/markets/page.tsx`
- Schema migration: `supabase/migrations/202602170002_step_ai_market_scout.sql`
- Automation market submit service: `lib/markets/submit-automation-proposal.ts`
- AI scan engines + runner:
  - `lib/automation/market-research/types.ts`
  - `lib/automation/market-research/constants.ts`
  - `lib/automation/market-research/utils.ts`
  - `lib/automation/market-research/openai-research.ts`
  - `lib/automation/market-research/quality-gates.ts`
  - `lib/automation/market-research/process-candidates.ts`
  - `lib/automation/market-research/public-scan.ts`
  - `lib/automation/market-research/institution-scan.ts`
  - `lib/automation/market-research/runner.ts`
- CLI + scripts: `scripts/market-research-runner.ts`, `package.json`
- Admin observability: `app/(app)/admin/page.tsx`, `app/globals.css`
- Planning docs: `docs/BUILD_PLAN.md`, `docs/CHANGE_HISTORY.md`

User-visible change:
- Platform admins can now inspect AI research run history and proposal outcomes in `/admin`.
- Backend now supports recurring AI-generated market proposals that flow into existing review queue guardrails instead of opening directly for trading.

## 2026-02-17 - Market Detail Layout Completion (Step 10)
Status: completed

Short description:
- Completed Step 10 by upgrading `/markets/[marketId]` from a placeholder shell into the full sketch-aligned market detail layout.
- Added a structured top layout with a left market strip, center probability timeline chart, and right rail containing buy/sell module scaffolding plus a personal position panel.
- Extended market detail data contracts to provide chart timeline points and authenticated viewer position summary values.

Files/areas touched:
- Market detail route: `app/(app)/markets/[marketId]/page.tsx`
- Market detail data/service contract: `lib/markets/read-markets.ts`
- Market detail styling + responsive layout: `app/globals.css`
- Deployment log: `docs/CHANGE_HISTORY.md`

User-visible change:
- `/markets/[marketId]` now presents the intended product detail experience: stats strip, chart with timeline axis, action module shell, context/resolution sections, source list, and a right-rail personal position panel (stacked below on mobile).

## 2026-02-17 - Wallet/Deposit Page + Funding Intent Correlation (Upgrade Step 1)
Status: completed

Short description:
- Added a real `/wallet` route that surfaces wallet balances, deposit options, and recent ledger history.
- Added Supabase-backed `funding_intents` records so deposits can be correlated between user initiation and webhook crediting.
- Updated Stripe/Coinbase checkout/charge creation to create funding intents and redirect back to `/wallet` for status display.
- Updated Stripe/Coinbase webhooks to mark funding intents as credited once ledger crediting completes (non-fatal if funding intent update fails).

Files/areas touched:
- Wallet route + UI components:
  - `app/(app)/wallet/page.tsx`
  - `components/wallet/deposit-panel.tsx`
  - `components/wallet/deposit-status-banner.tsx`
  - `components/wallet/ledger-table.tsx`
- Funding intent schema: `supabase/migrations/202602170007_step_wallet_funding_intents.sql`
- Payment creation redirects + metadata:
  - `lib/payments/stripe.ts`, `app/api/payments/stripe/checkout/route.ts`
  - `lib/payments/coinbase.ts`, `app/api/payments/coinbase/charge/route.ts`
- Webhook correlation:
  - `lib/payments/stripe-webhook.ts`
  - `lib/payments/coinbase-webhook.ts`

User-visible change:
- `/wallet` no longer 404s and now supports deposit initiation via Stripe/Coinbase with a pending/credited status banner tied to webhook processing.
