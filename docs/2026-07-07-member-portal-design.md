# The member portal design suite (pass 2.2's member-facing face)

**RATIFIED (Geoff, 2026-07-07, from his mockup review): "The basic UI looks clean, it
just needs to incorporate the additional functionality."** The structure and voice are
the contract as drawn; the amendments are the functionality his review streamed, all
folded below: the assets section (see/request/waitlists), retention with the
merit-gate-then-pay sequence, ROLLING renewals (standing = paid_at + 1 year; grace 30
days as a Club setting; the renewal notification carries the asset-loss warning),
gap-years = continuous holders only, any adult member may request assets, the
join-then-class continuity, and the free-clinic RSVP framing. The four drafted defaults
(in-portal receipts, Stripe Checkout, grace-window settings, contact-mechanism
neutrality) stand unobjected. The build incorporates directly; no mockup v2.

Authored on Fable, 2026-07-07 (the extended window's overnight run), against the phase-2
design suite's member-model rulings, Geoff's 2026-07-07 rulings (episodic use; lean data;
primary-controls-household-listings; retention-without-pestering reminders), the
MembershipWorks teardown, and the portal-UX research sweep (exemplars cited inline where the
research grounds a choice). The mockup set that accompanies this document is the ratification
artifact; this document is the reasoning it stands on.

## The governing constraint: episodic use

Geoff's own line: members RARELY touch their membership info; it happens at signup and
renewal. The design consequence reaches everything:

- **Every visit is a first visit.** No learned navigation may be assumed. The portal has no
  concept of a power user; nothing lives behind an icon a visitor must remember.
- **Task-first, not dashboard-first.** The median account page greets a returning user with
  stat tiles. Our member arrives with exactly one intention (renew; register for a class;
  update a phone number; occasionally "am I current?"). The landing screen is an answer plus
  a short task list, not a dashboard.
- **The email IS the front door.** For an episodic user, the renewal reminder and the
  magic-link sign-in are the navigation. The reminder email deep-links into the renewal flow;
  the portal never depends on someone thinking "I should go check the portal."
- **MembershipWorks sets a low bar and two traps to avoid** (from the teardown): its login is
  a manual password-by-email round-trip with documented failure modes (our magic link is the
  same gesture done right), and its portal wayfinding is the top verified complaint. We beat
  it by having fewer places, not better signage.

## What the portal is

`my-account` on the public site, behind member magic-link auth (the same lean D1 token
discipline as the admin's, against the member store; the site-brings-its-own-auth seam eating
its own dogfood). One surface, five jobs, frequency-ordered:

1. **Renew and pay** (annual; the reminder email lands here with one intermediate screen).
2. **Register for a class** (credit redemption automatic and visible; waitlist join when
   full; "My classes" thereafter, including the instructor's roster view when the member
   instructs — that view rides this surface, 2.2+).
3. **See standing at a glance** (current / lapses <date> / lapsed, tier, who's covered).
4. **Edit contact info + directory visibility** (one email, one phone, E.164; visibility with
   a "what others see" preview).
5. **Manage the household** (primary only: add/edit household members, set any household
   member's directory listing — Geoff's 2026-07-07 ruling — and hold the renewal/payment
   power; non-primary adults self-serve their own profile and visibility only).

### The assets section (Geoff, 2026-07-07; unlocked by unification — builds after 2.4's
asset domain meets 2.2's member auth)

The portal gains "Your assets" once both halves exist:
- **See current assets**: the household's assignments (mooring, RV, trailer, rack) with
  season and payment status, on the landing beside the household card.
- **See the waitlists**: the member's own queue positions, plus each queue's honest length
  ("7 households ahead of you"), since the continuous multi-year queues are exactly the
  thing members most want visibility into.
- **Request an asset**: pick a type, one-line note, submit. The request lands in the
  admin's review inbox (the signup queue's exact pattern, entity 'asset-request'):
  approve places the household into the queue (or assigns directly when the type has a
  free slot), deny carries a required reason. Every transition audited. When an asset
  frees, the grant-to-next-in-queue reuses the offer machine's token discipline (a
  time-limited claim, decline passes it down) rather than inventing a third mechanism.
- Model note: requests are a small state machine in front of the existing asset_waitlist
  (pending → queued | assigned | denied); the waitlist itself stays the continuous,
  never-reset queue the suite mandates.
- **Year-to-year retention (Geoff, 2026-07-07): assets carry over by REQUEST, not
  automatically.** Requests carry a kind: 'retention' or 'new'. A renewing member who
  held an asset last season gets the retention option surfaced IN the renewal flow
  ("Request your mooring again for 2027?") — as INTENT only; the renewal checkout covers
  dues alone. **The sequence is request → admin approval → THEN payment (Geoff,
  2026-07-07): the approval moment is leadership's merit gate, the deliberate check that
  the person is an active, participating member who still merits a scarce spot, before
  money changes hands.** On approval the member's portal task list gains "Pay for your
  mooring — $300" (and the notification email says so); payment completes the assignment
  (state machine: pending → approved-awaiting-payment → active | denied). The admin
  inbox shows every request WITH the household's prior-holding history ("held mooring,
  2023 through 2026, paid each season" — derivable from the assignment/payment rows), so
  approving a returning holder is one informed click and denying one is a considered,
  reasoned act. Nothing renews silently.

Explicitly NOT in the portal: payment-method vaulting (annual manual renewal is the club's
rhythm; no stored cards in v1), invoice archaeology beyond simple receipts, any admin
function, any content function.

## Information architecture: one landing, task pages under it

```
/my-account                     the landing: standing card + task list + household card
/my-account/renew               the renewal flow (also the reminder email's deep link)
/my-account/classes             register / my classes / waitlist status (+ roster view when instructor)
/my-account/profile             contact info + directory visibility (with preview)
/my-account/household           primary only: members, listings, primary reassignment request
```

One level deep, no tabs-within-tabs, every page reachable from the landing in one click and
returning to it in one click. The landing answers "am I current, who's covered, is anything
due" in the first screenful; the GOV.UK one-thing-per-page doctrine governs the flows (renewal
and class signup proceed as short single-question steps rather than one long form).

## Screen-by-screen (the mockup set's contract)

### 1. The landing (`/my-account`)

- **The standing card** leads: tier, season, plain-words status line ("Current through
  April 30, 2027 · Family membership · 2 class credits available"). Status colors follow the
  club-grounds palette's semantic trio only.
- **The task list** below it, rendered ONLY when a task exists: "Renew for 2027" (in the
  renewal window), "Use your class credit" (unspent credit + open registration), "Confirm
  your household's directory listings" (one-time nudges, dismissible). No tasks = the list is
  absent, not an empty state.
- **The household card** (family memberships): who's covered, one line each, the primary
  marked; the primary sees the manage link.
- Receipts live as a short list at the foot (date, what, amount, view/print) — the
  self-serve receipt history MW members already expect.

### 2. Renewal (`/my-account/renew`)

- Standing BEFORE money: the flow opens by saying what renewing buys ("2027 season ·
  Family · $500 · includes 2 class credits") before any payment control.
- One decision per screen; Stripe Checkout carries the card step (the ops-proven pattern,
  consolidated); the receipt lands by email and in the receipts list.
- The reminder email deep-links here; the flow works identically from a cold magic-link
  sign-in mid-window.
- Lapsed members get the same flow with honest copy (no penalty framing; credits survived,
  say so: "your 1 unused class credit is still yours").

### 3. Classes (`/my-account/classes`)

- Open sessions listed with seats-remaining honesty; a member with an unspent credit sees
  the credit APPLIED by default at confirmation ("Using 1 class credit — $0 due today");
  no credit = the $100 fee line and Checkout.
- Full session → one-click waitlist join; the member's waitlist position and any live offer
  (with its 72-hour countdown) render here; claiming an offer lands in the same confirmation
  flow.
- After registration: "My classes" rows (dates, location, what to bring link). A member
  holding the instructor role additionally sees their assigned classes' rosters here (2.2+,
  the privacy-floor fields only).

### 4. Profile (`/my-account/profile`)

- The lean fields only: name, one email, one phone (E.164 stored, formatted on render),
  birthdate (shown as "used for class age groups and the young-adult rate; never shown to
  other members"), household address (edit routes the primary's copy on non-primaries).
- **Directory visibility as consent UI**: the member's own row previewed exactly as other
  members will see it, a single visible/partial/hidden control beside it, per-field
  suppression under "partial". Changing it updates the preview live. Hidden is one click, no
  confirmation friction.

### 5. Household (`/my-account/household`, primary only)

- The covered members, each with: profile summary, directory listing control (the primary
  can set any household member's listing — the ruling; minors' rows say so plainly), and
  remove/add (add = the welcome page's "add each household member" promise, fulfilled here).
- **Override precedence, disclosed both ways (round-two critique):** an adult member and
  the primary can both write the member's listing; the latest change wins, the member's
  own profile says the primary can change it, and the household page says the member can.
  No silent overrides.
- The primary designation shown; reassignment is an admin action (the portal links to
  contact, doesn't self-serve it in v1).

## The accessibility floor (WCAG 2.2 AA, strict on the two forms that matter)

Magic-link auth is itself a W3C-listed sufficient technique for Accessible Authentication
(3.3.8/G218). The floor, applied hardest to sign-in and payment: visible persistent labels
(never placeholder-only), inline named errors that say the fix, correct `autocomplete`
tokens on every identity field, a review-and-confirm step before any charge (3.3.4), no
session timeout mid-payment (2.2.1), and GOV.UK-register copy (short words, one question
at a time). The offer countdown never conveys urgency by color alone.

## The auth surface

- Member sign-in page at `/my-account` when signed out: one email field, one button, the
  same quiet voice as the admin's login. The magic link email copy names the club and the
  action, nothing else.
- Sessions modest-lived (the admin's session discipline); signing out is visible but
  unnecessary (episodic use = sessions simply age out).
- A signed-in EDITOR is not a member session and vice versa; the two stores never blur (the
  access-tier ruling's member-facing mirror).

## Renewal reminders (the retention-without-pestering system)

The research band (MGI association benchmarks: big associations run 6-7 touches from ~4
months out; diminishing-returns evidence thin; 30-90 days post-lapse is the win-back window)
against Geoff's "far fewer, well-chosen":

- **Four touches, all season-anchored, all deep-linking to /my-account/renew** (the
  research's evidence band: associations run ~6-7 touches from ~3.9 months out with no
  measured annoyance threshold; four sits inside the band while honoring "far fewer,
  well-chosen"):
  1. ~30 days before the boundary: the warm one. Value first, never opening with the ask;
     the magic link lands on the renewal step directly.
  2. ~7 days before: the short practical one. Price, credits, one click.
  3. Day-of (or just after): the factual one. "Your membership lapses <date>."
  4. The single post-lapse touch (~30 days after): the door-open one. Credits survive,
     rejoining is one click, and this is the last reminder — said plainly (the "we'll stop
     emailing you about this" line; the research found no evidence either way, so the
     club's own courtesy wins). Past ~90 days any outreach is a differently-framed
     win-back, not another reminder.
- Every touch suppressed instantly on renewal (segment = not-yet-renewed, resolved at send
  time); auto-renewed members (if that ever ships) never see dunning copy.
- Offsets are `settings` rows; the committee tunes without code. Per-recipient send rows in
  `email_log` (ops's convention carried).

## What the mockups must show (the build contract)

Eight frames: signed-out sign-in; landing (current, with tasks); landing (family primary,
no tasks); renewal step 1 + confirmation; classes with credit-applied confirmation; waitlist
row with live offer countdown; profile with visibility preview (partial state); household
(primary view). Warm Stone admin idiom does NOT apply here — this is the PUBLIC site's
member surface, so it wears the club-grounds theme (the site's own type scale, bands, and
buttons), reading as club pages, not as admin chrome.

## The two canonical journeys (Geoff, 2026-07-07; the build contract's acceptance tests)

1. **Join-then-class, one visit.** Most membership is class-driven, so the join flow's Done
   screen is not "back to my account": for a new member it leads with "Register for your
   class — your membership includes a credit," landing in the class flow with the credit
   pre-applied (frame 05's arithmetic). The public class signup likewise detects a
   non-member and routes join-first, RETURNING to the class after payment with the intent
   preserved. The journey is one continuous path or it fails its purpose.
2. **The free-clinic RSVP.** An existing member signing up for Fleet Tune-Up: fee 0, no
   payment language anywhere, the signup framed as the roster ("so we know you're
   coming"), one click from the event's own page. Shipped on the public flow 2026-07-07
   (fee-aware confirmation); the portal's my-classes view lists it like any registration.

Both journeys are the review panel's walkthrough scripts and the e2e suite's canonical
paths.

## Open items riding to ratification

1. The four-touch cadence and its copy registers (above) — approve or adjust.
2. Receipts: email-only vs the in-portal list (drafted: both, list minimal).
3. The lapsed-directory grace: MW hides a listing N days after lapse; drafted as
   "directory requires current standing, immediately" for simplicity. Softer?
4. Class refund/cancel self-service: drafted OUT of v1 (the education page's existing
   human-contact policy stands).
