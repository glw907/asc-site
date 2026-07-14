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
current/lapsed segments, and refunds against the ledger. Staff-role management: cairn's
committed shape (2026-07-13, filed in that repo's Next tier) is one identity with a
site-declared role vocabulary — the engine keeps the allowlist, editor table, and
ManageEditors screen; ASC declares owner/club-admin/instructor in config, each mapped to
an engine capability level. ASC is the named first consumer: at this initiative the site
COLLAPSES `club_roles` onto that seam (retiring the table, the Settings grant/revoke UI,
and the site-side last-owner guard) once the cairn release ships. Member-scale auth
stays this site's own system, per Geoff's separation ruling. The consumer requirements,
vocabulary mapping, and fork answers: `docs/2026-07-13-cairn-editor-roles-consumer-brief.md`.

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

### Class management `class-management`
The season-operations tooling for classes, on top of the pass-2.1 admin (events,
classes, waitlists, offers, and settings already run on live D1): season rollover
(mint next season's class instances instead of hand-editing rows — `classes-store.ts`
already anticipates this), attendance and check-in against the roster (MW's per-event
check-ins set the bar), roster exports for instructors, class-fee refunds through the
ledger's refund machinery, and instructors reading their own rosters via the declared
`instructor` role once `membership-admin` lands the cairn roles seam. Key tooling for
the site (Geoff, 2026-07-13) but not a cutover blocker — the 2026 season already runs
on the existing admin. Outside the mw-* program; can start any time after
`membership-admin`. The class-roster email segment rides `segment-email`.

### QuickBooks Online integration `qbo-integration`
Sync the club's money events to QuickBooks Online: `qbo_ref` population, entity
mapping (SalesReceipt/Refund/Deposit onto ledger rows), and the OAuth/API plumbing.
Builds on `money-ledger`, which now carries the ledger table itself; this initiative
is the sync. Ruled by Geoff 2026-07-13; phase-2, after the MW replacement program.
