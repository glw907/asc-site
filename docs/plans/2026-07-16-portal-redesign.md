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
