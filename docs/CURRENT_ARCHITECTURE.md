# Current Architecture

This document describes the active runtime architecture for There's No Chance after the cleanup that removed stale compatibility modules, retired provider code, and legacy static landing artifacts.

## Runtime Surface

- `app/(marketing)/page.tsx` is the canonical landing page.
- The root-level static prototype files (`index.html`, `script.js`, `styles.css`) are no longer part of the runtime.
- Shared visual layers load through `app/globals.css`, including `app/styles/controls.css` for reusable table/control primitives and `app/styles/market-detail.css` for market-detail and trade UI rules.

## Product Model

- Wallet funding is Venmo-only in the active product surface.
- Historical Stripe/Coinbase migrations remain as migration history, but Stripe/Coinbase runtime routes and provider libraries are retired.
- Market resolution uses the community-resolution flow with resolver bonds, challenges, finalization, and admin adjudication when needed.
- Institution-gated markets use verified institution email/domain membership and private visibility.

## Code Boundaries

- Market reads go through `@/lib/markets/read-markets`.
- Trade DTOs live in `@/lib/markets/trade-contract`.
- Institution access DTOs live in `@/lib/institutions/contracts`.
- Shared API route primitives live in `@/lib/api/route-primitives`.
- Shared bracketed RPC error helpers live in `@/lib/api/rpc-errors`.
- Shared account page loading and formatting live in `@/lib/account`.
- Shared Next search-param typing lives in `@/lib/shared/next-types`.

## Removed Compatibility Surfaces

These files are intentionally absent and protected by lint/import guardrails:

- `lib/admin/account-dashboard.ts`
- `lib/institutions/service.ts`
- `lib/payments/stripe.ts`
- `lib/payments/stripe-webhook.ts`
- `lib/payments/coinbase.ts`
- `lib/payments/coinbase-webhook.ts`
- `app/api/payments/stripe/checkout/route.ts`
- `app/api/payments/coinbase/charge/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/api/webhooks/coinbase/route.ts`
