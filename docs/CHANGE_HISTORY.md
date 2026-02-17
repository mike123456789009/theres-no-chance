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
