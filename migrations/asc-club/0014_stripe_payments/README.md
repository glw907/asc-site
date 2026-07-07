# asc-club migration 0014: Stripe payment collection

## What this does

Lands `processed_stripe_sessions` (the webhook's idempotency guard, one row per Stripe Checkout
Session id the webhook has already reconciled) and seeds one new `email_templates` row,
`stripe_payment_receipt`, the member-facing confirmation every reconciled payment sends. See
`forward.sql`'s own header for the full reasoning on each, including why the new template is
NOT named the more obvious `payment_receipt` (that id already exists, seeded by the ops import,
and `INSERT OR IGNORE` would have silently kept it).

No existing table's structure changes: dues reconciliation writes to `memberships` (already
carries `paid_at`/`stripe_ref`, migration 0005), class-fee reconciliation writes to
`class_enrollments` (already carries `fee_paid`/`stripe_ref`, migration 0001), and asset-fee
reconciliation writes to `asset_payments` (already carries `stripe_ref`/`method`, migrations
0007/0008). This migration only lands the one genuinely new piece of storage the webhook needs:
somewhere to record "this session id was already handled."

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0014_stripe_payments/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0014_stripe_payments/verify.sql)"
```

Expect the `processed_stripe_sessions` table name back, and one `stripe_payment_receipt` row
(`reply_to = finance-committee@aksailingclub.org`, `updated_by = authored:payments`).

## Proved safe before landing (2026-07-07)

A scratch database (`asc-club-scratch-0014-<timestamp>`, created and deleted for this proof
only) confirmed the full migration chain (0001 through 0010, then 0014) applies cleanly in
order (24 tables land, no error). Against that scratch database:

1. `INSERT OR IGNORE INTO processed_stripe_sessions (...)` for a session id not yet seen
   reports `changes: 1` (a real claim).
2. The identical statement run again for the SAME session id reports `changes: 0` (the replay
   is a clean no-op) -- this is the exact compare-and-set the webhook relies on to decide
   whether to reconcile and send a receipt, or skip silently, matching `offers.ts`'s own
   `claimOffer` compare-and-set convention for the same shape of race.
3. `kind` outside `('dues', 'class-fee', 'asset-fee')` fails with
   `CHECK constraint failed: kind IN (...)`, confirming the constraint is live (defense in
   depth; the application layer only ever writes one of the three).

The real `asc-club` database was not touched by this proof.

## Applied to the real database (2026-07-07)

Checked first, per this migration's own convention: `SELECT name FROM sqlite_master WHERE
type='table'` against the real `asc-club` database returned no `processed_stripe_sessions`
table, confirming the migration had not yet landed (the agent that authored it died on an API
overload before running it). That same check also surfaced the `payment_receipt` naming
collision documented above and in `forward.sql`'s own header, caught before this migration ran
against the real database, not after.

Applied with the `How to run` command above, then confirmed with `Verify`: the table exists,
and `stripe_payment_receipt` reads back with `reply_to = finance-committee@aksailingclub.org`,
`updated_by = authored:payments`. The pre-existing `payment_receipt` row (`import:ops`) is
unchanged.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0014_stripe_payments/rollback.sql
```

Safe only before any real Checkout session has been reconciled (see `rollback.sql`'s own
header).

## Numbering note

`0011`, `0012`, and `0013` are each already claimed by other concurrent worktrees
(`member-portal`'s `0011_member_portal`; `job-runner`'s `0011_job_runner`/`0012_class_reminders`;
`email-editor`'s `0012_template_defaults`/`0013_class_custom_note`). This migration takes `0014`
to avoid a fourth collision on the same few numbers; per this repo's own established convention
(see the `0010_tier_prices` README), every one of these is still expected to renumber at merge
time.
