# Portal redesign — plan (2026-07-16)

Executes docs/2026-07-16-portal-redesign-design.md (read it first; its Binding rulings
section governs every task). Runs as its own pass, ideally a fresh session. Sonnet
implementers per task; the conductor reviews each diff and verifies the gate between
dispatches; baselines are CI-canonical (regen via the ci.yml update_snapshots dispatch only).

## T1 — Data derivations and state machine

Outcome: pure, tested derivations for the landing's four states and the value mirror.
`portalState(standing, seasonData, settings, today)` → in-season-needs-you /
in-season-clear / off-season / renewal-window (~60 days before expiry, and lapsed), plus
`valueMirror(household, assets, credits)` → ordered segments (omit empty). Reads existing
seams (member-auth/lib standing + format, season-data, the class_registration_opens
setting). No schema changes expected; if one is genuinely needed, stop and flag. Unit tests
cover boundary dates (expiry day, window edge, season rollover) with fixed clocks.

## T1b — Receipts: repoint at the money ledger (added mid-pass, Geoff-ruled 2026-07-16)

Outcome: `listReceipts` reads the canonical money ledger (`transactions`/`transaction_lines`,
migration 0021) instead of its stale two-table `memberships`/`asset_payments` union.

NOT a schema change: 0021 already built the canonical store, every live write path already feeds
it (stripe-reconcile, refunds, manual-payment), and the MW backfill populated it. `receipts.ts`'s
header ("every paid row already IS a receipt") was true at its birth and went stale the day 0021
landed. Adding `paid_at`/amount to `class_enrollments`, or a `class_payments` table, would
DUPLICATE the ledger and would itself be the write-around; `fee_paid` stays a domain flag, money
lives in the ledger.

Live defect this fixes (verified against the live database): 143 class-fee lines and 5 donations
are invisible to the members who paid them. Also gains full multi-year history and honest
bundled charges (an MW dues-plus-mooring charge renders as the one charge the member actually
paid, matching the email receipt they got).

Constraints: the ledger read REPLACES the union, never sits beside it (217 dues lines overlap 235
paid memberships; a combined read double-counts). Scope to `kind = 'charge'` this pass; refunds
join later as signed rows. The formatter changes with it (ledger is integer CENTS, the union was
dollars). The 19 paid memberships absent from the ledger are all `price_paid = 0` comped rows,
which are not receipts, so the swap loses nothing real. The e2e portal fixture needs real ledger
rows seeded to match.

## T2 — Desktop landing composition

Outcome: the masthead band, value mirror, two-column working area, and doors per the spec's
desktop composition, as portal-scoped components (NOT registry directives). Subordination
constraints on the rail are acceptance criteria, not suggestions: one type step down, muted
eyebrow labels, links only. Weighted action rows render only real items. Receipts/dates via
the shared formatter. No em dashes in any rendered string (grep-gate it). Fireweed appears
ONLY via the renewal-window masthead action.

## T3 — Mobile composition

Outcome: the spec's own-screen mobile layout at ≤~40rem: compact masthead, stacked action
anatomy (label line; amount + button line; 44px targets), full-width reference sections in
recognition order, doors row. Not a media-query collapse of T2's grid: compose it
deliberately (separate layout branch or restructured order, whichever is cleaner in Svelte).
320 must hold.

## T2b — The gear door (added mid-pass, Geoff-ruled 2026-07-16)

Outcome: `/my-account/gear`, the gear-and-moorings home. Absorbs the whole current assets
composition off the landing: assignment rows with payment standing, waitlist positions, pending
requests with cancel, the request form, per-row release. The round-3 assets vocabulary
(`.portal-quiet-action`, the assets-row grammar, chips, tabular fees) relocates nearly as-is and
gets room to breathe, so this is not a ghost-town page. The landing's rail tile stays exactly as
mock D draws it and gains one quiet "Manage gear & moorings" foot link (satisfying links-only by
construction); Gear joins the doors row.

Release gets its ruled two-step confirm here (decisions.md carries the wording). Paying an
outstanding fee stays on the landing as the main column's one weighted action row; it does NOT
move here. Server actions move with their forms; no auth or payment logic changes.

## T2c — The renewal door (added mid-pass, Geoff-ruled 2026-07-16)

Outcome: `/my-account/renew`. The masthead's fireweed CTA links here instead of posting a hidden
tier. The page states the household's current tier and price plainly, offers the other tiers at
their settings prices, and continues to the existing `?/renew` Stripe path. Closes the
silent-wrong-tier purchase T2's simplification opened (decisions.md carries the ruling and its
grounding: 3 of 88 renewals changed tier).

The `#renew` anchor that reminder emails target must still land on the renewal surface. Reuse the
existing `?/renew` action and `mintOrReuseRenewalMembership`; no payment logic changes.

## T4 — Child-page riders

Outcome: profile/classes/household/directory pick up the em-dash retirement (the round-3
assets grammar on the landing is rebuilt by T2; children's own strings sweep here), the
compact mobile header pattern, and any shared-class fallout from T2/T3. No recomposition.

## T5 — Signed-in verification and baselines

Outcome: a portal e2e spec extending the admin-login session precedent: seed a member
session against the fixture DB, render landing needs-you and all-clear at 390/1440 light as
new visual baselines; the fixture data must be deterministic (fixed dates, no now()-relative
values — the offer-fixture lesson). Conductor-side: seeded renders of all four states,
light+dark, 390/1440, read with fresh eyes against mock D.

## T6 — Review fan-out and close

svelte-reviewer + daisyui-a11y over the pass diff; fix round if findings; simplifier; full
gate; push; CI baseline regen + verify; Geoff's before/after against mock D. Arc-log
distillation into decisions.md per the settle ritual.
