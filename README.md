# payments (Stripe payment collection)

This worktree builds the Stripe payment integration the ops parity audit named as the club's #1
blocker: `src/admin-club/lib/payments.ts`'s `createCheckout` creates a Checkout Session for one
of three payment kinds (`dues`, `class-fee`, `asset-fee`), and
`src/routes/(site)/api/stripe/webhook/+server.ts` reconciles a completed one into asc-club's own
tables (`src/admin-club/lib/stripe-reconcile.ts`).

## Secrets and the webhook endpoint are already live

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are both already set on the `asc-site` Worker,
sandbox mode (Geoff, before this pass), and the sandbox webhook endpoint is already registered
in Stripe's dashboard at this exact path, `/api/stripe/webhook`. This means the integration lights
up on deploy with no further secret work: no `wrangler secret put`, no dashboard endpoint
registration. An environment that has NOT provisioned either secret still degrades gracefully
(`createCheckout` returns `{ stub: true }`; the webhook route answers `503` rather than crashing),
the same posture every other optional site secret (`TURNSTILE_SECRET_KEY`, `EMAIL`) already takes.

## What's wired here, and what's a deferred seam

- The webhook's reconciliation for all three kinds (`stripe-reconcile.ts`) is built and tested.
- The class-signup page's own "pay the class fee now" call site is wired
  (`src/theme/class-fee-checkout.remote.ts`, `+page.svelte`).
- The dues renewal (`/my-account`) and approved-asset-fee ("pay to confirm") call sites are NOT
  built here: both belong to `portal-capstone`'s own screens (the join/renewal flow, the asset
  request queue), neither of which exists in this worktree. `payments.ts`'s own header and the
  `/my-account` page's own comment each name the exact seam (`createCheckout({ kind: 'dues', ... })`
  / `createCheckout({ kind: 'asset-fee', ... })`) so that worktree's own work only has to call it.

## Migration 0014

`migrations/asc-club/0014_stripe_payments/` lands `processed_stripe_sessions` (the webhook's
idempotency guard) and seeds the `stripe_payment_receipt` email template. Applied and verified
against the real `asc-club` database as part of this pass; see that migration's own README for
the full record, including the naming collision it caught against the ops-imported
`payment_receipt` template (a different, narrower, asset-only notice with no live sender yet).
