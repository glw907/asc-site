# Unified signup & membership lifecycle — design

**Initiative:** `unified-signup` (ROADMAP.md), the MembershipWorks replacement program's
centerpiece. Brainstormed and ruled with Geoff on 2026-07-13, immediately after
`money-ledger` shipped. This initiative builds on the ledger seams; the admin screens
ride the later `membership-admin` initiative.

## Baseline

On the live site today, joining is self-serve through MembershipWorks: apply and pay,
membership activates immediately, and the board reviews new applications in the
background (it is a courtesy review, never a gate; Geoff's standing ruling is that
members never need to email the board to join). This site must reach parity with that
flow, then add the combined join+class checkout and in-portal renewal. The pieces
already in place:

- **Money seams, ledger-complete.** `createCheckout` builds a Stripe Checkout Session
  for any of the four payment kinds; the dues, class-fee, asset-fee, and donation
  reconcilers all exist, are tested, and write multi-line-capable ledger transactions.
  The dues and asset-fee *call sites* were left to this initiative by design
  (`docs/2026-07-13-money-ledger-design.md`, non-goals).
- **Standing derives.** A household is current for a season iff a paid `memberships`
  row exists (`UNIQUE(household_id, season)`, `paid_at` NULL means invoiced/pending).
  `getMemberStanding` computes rolling `current`/`grace`/`lapsed` from the most recent
  `paid_at` plus one year, with `renewal_grace_days` (default 30) of grace.
- **The renew seam is a stub.** The portal's `?/renew` action records intent and shows
  "online renewal is coming soon"; its own code comment names this initiative. The
  4-touch renewal-reminder job already exists and deep-links to that card.
- **The class door is live but unguarded.** The public `/classes/[id]/signup` form
  enrolls anyone (enroll first, pay after; `fee_paid` flips at reconciliation), despite
  the published members-only policy. A second, member-scoped class flow lives in the
  portal with credit auto-redemption.
- **Tier prices are settings** (`tier_price_individual` 250, `tier_price_family` 500,
  `tier_price_young_adult` 100), snapshotted into `price_paid` at purchase. The credit
  ledger (`credit_grants`/`credit_redemptions`) has no season column: credits never
  expire, structurally.

## Rulings (Geoff, 2026-07-13)

1. **Classes are members-only.** A non-member or lapsed household hitting the class
   door pivots into join (or welcome-back renewal) with the class carried along.
2. **One combined checkout for join+classes.** Families register more seats than their
   credits cover (two parents and three kids, say); the single payment carries a dues
   line plus a class-fee line per uncovered enrollment.
3. **Young-adult tier: under 26, includes one class credit.** Age-gated at join via
   birthdate. Individual includes one credit; family includes two.
4. **The purchaser accepts the waiver at join.** Other household members keep accepting
   per-activity, as class signup already does.
5. **No board email anywhere in the join story.** The board receives a notification on
   each new join; it never sits in the path.

## Architecture: one engine, three entries

A single signup engine owns the vocabulary, pricing and credit math, waiver handling,
and checkout construction. Three thin entries call it:

- **`/join/apply`** — the public join flow. The `/join/` content page keeps the story
  and gains this live door.
- **The class door** — `/classes/[id]/signup` keeps today's short form for members in
  standing; anyone else pivots into `/join/apply` with the class preselected and their
  entered details carried over.
- **The portal renew card** — `/my-account`'s stub becomes a real dues checkout.

Current members registering for a class never see the join engine. The engine's pure
parts (pricing, credit application, validation) live as unit-testable functions beside
the existing domain libraries; routes stay thin.

## The join flow

One page with progressive disclosure, not a stepped wizard (the portal design's
episodic-use principle, since a member sees this flow once):

1. **Tier.** The three tiers with prices read live from settings. Young-adult requires
   a birthdate showing under 26 at purchase.
2. **People.** The purchaser (name, email, phone), then household members inline for
   family tier — name and birthdate, email optional. The purchaser becomes the
   household's primary member.
3. **Classes (optional).** Any listed member can be pointed at an open class, read from
   the same schedule data as the education page's island. Full classes offer the
   waitlist instead. The running total shows dues, credits applied in pick order, and
   any class fees beyond them.
4. **Waiver and submit.** The purchaser accepts the current waiver version; Turnstile
   guards the form (the pattern class signup already uses).

Submit performs one `db.batch()`: household, members, the unpaid `memberships` row
(`price_paid` snapshotted from settings), enrollments (`fee_paid = 0`) or waitlist rows
for full classes, the purchaser's waiver acceptance, and audit rows, then redirects to
Stripe. This mirrors the class door's existing enroll-then-pay contract.

**Duplicate protection.** A purchaser email that matches an existing member pivots to
the welcome-back path (below) instead of minting a duplicate household. A checkout
abandoned after submit leaves the unpaid rows in place, exactly like today's class
flow; a retry reuses the household's unpaid membership row (the unique constraint makes
this the natural shape), and unpaid-row visibility belongs to `membership-admin`.

## The combined checkout and its reconciler

A fifth payment kind, `join`. The session carries one dues line plus a class-fee line
per enrollment the tier's credits don't cover; `refId` is the membership id and the
session metadata lists the enrollment ids with the credit plan. The new `reconcileJoin`
(webhook side, same claim-gate pattern as the existing kinds):

- flips `memberships.paid_at` and stamps `stripe_ref`;
- inserts the tier's `credit_grants` (individual 1, young-adult 1, family 2);
- inserts `credit_redemptions` for the covered enrollments and sets `fee_paid = 1` on
  the paid ones;
- records **one** ledger transaction: a `dues` line plus a `class-fee` line per paid
  enrollment (credit-covered enrollments move no money and get no line; the credit
  ledger carries them);
- sends the welcome email and the board notification, writes audit rows.

The domain flip guards idempotency the way `reconcileDues` does (`WHERE paid_at IS
NULL`); a replayed webhook is a no-op past the session claim.

Renewals and solo joins with no classes skip all of this: they are plain `dues`
sessions through the already-built `reconcileDues`. Credits for a renewing household
are not granted again — credits ride *new* memberships' join reconciliation only,
matching the published promise ("new individual memberships include one class credit").

## The class door gate

The public class form gains a standing check at submit: the email resolves to a member
and household, and `current` or `grace` standing proceeds through today's exact path
(enroll or waitlist, credit-or-pay step after). No match answers with the pivot: an
invitation into `/join/apply` with the class and the entered fields carried across,
phrased as an invitation to join. A known member whose household has `lapsed` gets the
renewal handoff instead (the magic-link send described under welcome-back, 2026-07-14
amendment), since joining fresh would duplicate their household. With JavaScript
available, an email-blur check pivots before the person fills the rest.

The check trusts the claimed email, the same trust level as today's anonymous form. It
does reveal whether an email belongs to a current member; for a small club this is an
acceptable trade, recorded here as a deliberate decision. Audit rows record every
public write.

## Renew and welcome-back

**From the portal (authenticated).** The renew card shows the household's tier and the
current settings price, with the tier changeable in place. Confirming mints an unpaid
membership row for the next unclaimed season (at or after `current_season`) and hands
it to a `dues` checkout; `reconcileDues` flips it and the standing card updates. The
existing reminder emails deep-link here, so the 4-touch cadence goes live unchanged.

**From the public join door.** An email match on a household that has paid before
answers with a magic-link handoff, not an inline renewal: the door sends the member's
portal sign-in link (the enumeration-safe `requestMemberLink` seam) pointed at the
renew card, and tells the visitor to check their email. Renewal stays one email away
from either door, and the portal owns every household-scoped read and write.

*Amended at the 2026-07-14 review round, superseding the brainstorm's unauthenticated
welcome-back form.* The security lens showed the original shape let an anonymous
visitor who knew a member's email write into that household before any payment (add
members, enroll real members, consume class capacity) and read back the full roster,
including minors' names. Payment alone was safe; the writes and the disclosure were
not. An email match on a household that has never paid (an abandoned first join) still
resumes as a same-transaction retry, since that household has no history to protect.

## Asset fees

The deferred pay-to-confirm call site lands in the portal's assets section: an approved
assignment shows its fee and a pay button through `createCheckout({ kind: 'asset-fee' })`
into the already-built reconciler. Self-contained; no new semantics.

## Language and content

The other half of the unification is one vocabulary across both doors and the portal:

- The standing words are `current`, `grace`, `lapsed` everywhere; the schedule island's
  status chips and the signup flow use the same terms for the same states.
- "Class credit" is the only name for the join-included class; the waiver is framed the
  same way at join and at class signup.
- `join.md` and `renewing-your-membership.md` drop their interim callouts for the live
  doors. A small settings-reading pricing component replaces the hardcoded dollar
  amounts in copy, so a settings change can never strand the prose again (the
  process-facts correction of e16054f is the cautionary tale).
- The dormant `membershipworks` directive retires from the registry.
- All copy follows the website content style guide; every visual change gates on
  Geoff's before/after per the one-check rule.

## Emails

A `join_welcome` template joins the seeded set: the member's front door to the portal
(magic-link sign-in, class credit status, Discord invite), written to the style guide's
system-email rules. Payment receipts reuse `stripe_payment_receipt`. The board
notification is a quiet internal mail through the same `sendClubEmail` seam.

## Schema

The asc-club schema is fully evolvable (CLAUDE.md ruling). Expected surface, settled
exactly at plan time and scratch-proven per the migration pattern: a `join`-kind value
wherever payment kinds are constrained, and whatever small columns the welcome-back and
credit-grant provenance need. `EVENTS_DB` stays read-only; no engine (`AUTH_DB`)
changes.

## Testing

- Unit: pricing and credit math (pick-order application, family multi-seat cases,
  young-adult age gate), the join batch builder, `reconcileJoin` (idempotent replay,
  no-op paths, ledger lines sum), the standing gate's three branches, welcome-back
  dedup, renewal season assignment.
- E2E: the join happy path and the class-door pivot against the stubbed checkout
  (`createCheckout` already degrades to `{ stub: true }` without a key).
- Visual: new pages join the five-viewport bar; baselines regenerate in the same
  change. Geoff's before/after gates deploy.
- The full existing suite (973 tests), `npm run check` 0/0, build green.

## Non-goals

- Admin members/memberships screens, manual payments, refunds against the ledger
  (`membership-admin`).
- Segment email (`segment-email`); QBO (`qbo-integration`).
- The live-Stripe smoke and the broader rate-limiting pass (`payments-live-smoke`),
  though the join form ships with Turnstile from day one.
- The apex cutover and MW cancellation (`mw-cutover`).
- Auto-renewal/subscriptions: MW offered it; this design is deliberate-payment-only
  until a real demand signal appears.

## Acceptance

1. A stranger joins (any tier), optionally registering several household members for
   classes, in one pass with one payment; membership activates on payment; credits
   grant and apply per the published promise; the ledger holds one honest multi-line
   transaction.
2. A non-member at the class door lands in join with the class carried; a member in
   standing never sees the join flow.
3. A current member renews from the portal in one screen; a lapsed member renews from
   either door; reminders deep-link into the working path.
4. An approved asset assignment is payable from the portal.
5. Both content pages describe the real process with settings-driven prices; no email
   step anywhere in the join story; the board is notified of each join.
