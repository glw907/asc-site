# ROADMAP

> Strategic initiatives. Managed by `/log-project`. Individual carry-forwards live in
> `docs/STATUS.md` entries (this repo keeps no BACKLOG.md, per CLAUDE.md).

The six `mw-*`-ordered initiatives below form the MembershipWorks replacement program
(approved by Geoff 2026-07-13): one go-live — the apex cutover waits until membership
signup, renewal, and admin are live on this site, and MW cancels right after. Order
matters: the ledger is the foundation every money flow writes into, the signup
lifecycle is the centerpiece, and everything else hangs off those two.

## Active

### The money ledger `money-ledger`
The QBO-shaped `transactions` table: one row per money event (charge, refund, void,
comp, donation) with date, amounts, processor ref, fee, line items, and a future
`qbo_ref`. Reworks the existing dues/class-fee/asset-fee reconcilers and the donate
flow to write ledger rows, backfills the archived 401-transaction MW ledger via the
verified-import pattern keyed on `mw_account_id`, and re-hangs existing payment facts
off it. First in the program because every later initiative writes money events.
(Split out of `qbo-integration` per Geoff's 2026-07-13 ruling that the ledger is
designed at the payments pass, not bolted on mid-flow.)

### Unified signup & membership lifecycle `unified-signup`
One flow and language across both doors: public join (household + members + tier
pricing from settings + waiver + Stripe dues checkout), join-plus-class in one pass,
a live Renew path from the portal and reminder emails, lapse/standing semantics, and
wiring the already-built class-fee and asset-fee checkouts into their flows. The
program's centerpiece; Geoff authorized Fable time for its brainstorm. Builds on
`money-ledger`.

## Planned

### Members & Memberships admin on live data `membership-admin`
Swap the admin members screens' demo fixtures for the real 285-member D1 and settle
the screen-shape question (two screens vs. one household-grouped screen plus a
money/renewals view) in its design. Adds the missing CRUD: manual payments
(check/cash/comp), tier changes, archive, directory-visibility management,
current/lapsed segments, and refunds against the ledger. Also user/role management
(Geoff, 2026-07-13): a proper memberships admin area plus management of club roles
(owner/club-admin/instructor — grant/revoke exists owner-only in Settings today) and
cairn editor accounts (AUTH_DB allowlist, currently hand-seeded with no UI; the design
decides whether that screen lands here or upstream in cairn-cms).

### Segment email `segment-email`
Announce stays; add segment targeting (current, lapsed, class roster, instructors)
and a compose-without-a-post path, on the existing email-templates/log substrate.
Scope ruled by Geoff 2026-07-13: segments, not a campaign product.

### Payments hardening & live smoke `payments-live-smoke`
The deliberate live-Stripe smoke that has been queued since pass 2.1, plus Turnstile
and rate limiting on the new public money forms (a named cutover blocker).

### Go-live: apex cutover & MW retirement `mw-cutover`
The program's final act: a fresh MW delta re-import (members keep joining/renewing on
MW between the 2026-07-13 snapshot and cutover; the idempotent import script makes
this cheap but it must be an explicit step), content updates pointing join/renewal at
the real flows, the fresh-context verification pass, Geoff's before/after, the apex
DNS cutover, the soak, then the MW subscription cancel and GCE retirement.

### QuickBooks Online integration `qbo-integration`
Sync the club's money events to QuickBooks Online: `qbo_ref` population, entity
mapping (SalesReceipt/Refund/Deposit onto ledger rows), and the OAuth/API plumbing.
Builds on `money-ledger`, which now carries the ledger table itself; this initiative
is the sync. Ruled by Geoff 2026-07-13; phase-2, after the MW replacement program.
