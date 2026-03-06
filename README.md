# There's No Chance

There's No Chance is a prediction-market platform built for both public discovery and institution-gated participation. The app combines live markets, wallet funding rails, community resolution, admin operations, and AI-assisted market research in one Next.js + Supabase product.

## What the product does

- Publishes public and institution-only prediction markets from the same platform.
- Supports wallet funding flows, ledger views, and payment operations for deposits and withdrawals.
- Runs community-resolution workflows with evidence submission, resolver bonds, challenges, and admin adjudication paths.
- Gives admins tooling for moderation, institutions, payments, and automation oversight.
- Uses scheduled market-research automation to propose and submit fresh markets.

## Stack

- Next.js App Router + React for the product shell and UI.
- Supabase for auth, Postgres, storage, RLS, and RPC-backed business logic.
- Vercel for production hosting and deployment from `main`.
- Vitest, TypeScript, ESLint, and contract checks for regression protection.

## Public module boundaries

The app intentionally consumes a few domains through barrel imports instead of deep module paths:

- `@/lib/markets/read-markets`
- `@/components/markets/page-sections`
- `@/components/markets/create-market/steps`

`npm run verify:public-barrels` compiles a focused contract file that imports only those public barrels and checks the specific export surface the app depends on. CI runs that contract before full typecheck so stale shadow files or partial refactors fail fast.

## Local development

```bash
npm install
npm run dev
```

Primary quality gates:

```bash
npm run lint
npm run verify:public-barrels
npm run typecheck
npm test
npm run build
```

## Supabase CLI workflow

This repo keeps Supabase CLI usage separate from the main app `.env` so multiline secrets do not break CLI parsing.

1. Put CLI-safe, single-line values in `.env.supabase.local` if you need any env-backed Supabase auth or connection settings.
2. Keep multiline secrets and app-only material out of `.env.supabase.local`.
3. Run Supabase commands through the wrapper:

```bash
npm run supabase:migration:list
npm run supabase:link
npm run supabase:db:push
npm run supabase -- migration repair --linked --status applied 202602210002 --yes
```

The wrapper temporarily swaps `.env.supabase.local` in as `.env` while the Supabase CLI runs, then restores your normal app environment file.

## Deployment

- `main` is the production branch.
- Pushes to `main` trigger Vercel production deployments.
- Record each shipped change in `docs/CHANGE_HISTORY.md`.
- After each push, confirm Vercel reports the deployment as `Ready` and smoke test the intended live behavior.
