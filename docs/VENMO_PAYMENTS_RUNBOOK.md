# Venmo Payments Runbook

## Operational flow

1. User creates a Venmo funding intent in wallet.
2. Wallet generates invoice code and required Venmo note.
3. User pays via Venmo and includes invoice code in the note.
4. Gmail filter labels payment emails as `Venmo/Unprocessed`.
5. Apps Script sends parsed rows to `/api/payments/venmo/reconcile`.
6. System auto-matches by invoice code + gross amount and credits wallet at net amount.
7. Ambiguous rows appear in `/account/admin/payments`.

## Environment variables

- `VENMO_RECONCILE_BEARER_SECRET`
- `VENMO_FEE_PERCENT` (default `1.9`)
- `VENMO_FEE_FIXED_USD` (default `0.10`)
- `VENMO_USERNAME` (default `TheresNoChance`)
- `VENMO_PUBLIC_QR_PATH` (default `/assets/payments/venmo-theres-no-chance-qr.png`)
- `VENMO_PAYMENT_URL` (optional override)
- `DEPOSIT_MIN_USD` (default `5`)
- `DEPOSIT_MAX_USD` (default `2500`)
- `DEPOSIT_QUICK_AMOUNTS_USD` (comma list, default `25,50,100`)

## Fee policy

- Credit amount is always `net = gross - fee`.
- Fee formula: `fee = round_to_nearest_cent(gross * percent + fixed)`.
- Net credit never goes below `$0.00`.

## Admin queue actions

- `Match + credit`: provide target funding intent id, then apply net credit.
- `Ignore`: mark row ignored and remove it from active queue.

## Verification checklist

1. Create Venmo intent in wallet and confirm invoice code appears.
2. Confirm fee preview displays gross/fee/net.
3. Send test payload to reconcile endpoint and verify:
   - `deposit_receipts` row created
   - `ledger_entries` deposit amount equals net
   - `funding_intents.status = credited`
4. Validate admin queue row appears for unmatched invoice code.

## Failure handling

- If reconcile API returns `401`, rotate/recheck `VENMO_RECONCILE_BEARER_SECRET`.
- If schema errors occur, run Supabase migration push.
- If Apps Script parse fails, move thread to `Venmo/Error` and inspect raw message format.
