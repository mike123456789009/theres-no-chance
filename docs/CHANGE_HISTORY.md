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
