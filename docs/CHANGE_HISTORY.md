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
