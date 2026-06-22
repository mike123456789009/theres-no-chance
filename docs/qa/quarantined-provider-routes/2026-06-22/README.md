# Quarantined Retired Payment Provider Routes

## Context

`docs/CURRENT_ARCHITECTURE.md` defines the active wallet-funding product model as Venmo-only. It also lists the Stripe and Coinbase runtime routes and provider libraries as retired, intentionally absent surfaces.

During the feature user-story QA loop, untracked Stripe/Coinbase route files were present under `app/api`. They contradicted the architecture document and blocked full release gates because the Coinbase routes imported retired provider modules that do not exist.

## Quarantine Action

The untracked provider route files were moved out of the active Next.js route tree and preserved here as `.txt` evidence:

- `app-api-payments-coinbase-charge-route.ts.txt`
- `app-api-payments-stripe-checkout-route.ts.txt`
- `app-api-webhooks-coinbase-route.test.ts.txt`
- `app-api-webhooks-coinbase-route.ts.txt`
- `app-api-webhooks-stripe-route.ts.txt`

## Regression Guard

`lib/payments/retired-provider-boundary.test.ts` asserts that the retired Stripe/Coinbase runtime paths and provider-library paths remain absent from the active app tree.

If multi-provider payments return, make that an explicit product-scope change: update the architecture document, UI copy, environment documentation, route implementation, and tests together.
