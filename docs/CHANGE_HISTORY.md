# Change History

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
