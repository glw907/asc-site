# The adversarial requirements review (prose promises vs built reality)

Run 2026-07-07 at Geoff's direction while Fable-tier judgment holds: every operational
promise the site's own prose makes (an exhaustive extraction across pages, bulletins, and
the shipped route copy) cross-examined against what the system actually does. Ranked by
what bites. The companion extraction table lives in the session record; this document
keeps the verdicts.

## The structural gap: nothing can act on time

The site worker has NO scheduled execution surface. Yet the requirement set now contains
at least five time-driven behaviors: renewal reminders at per-household offsets (rolling),
the approved-asset payment-window release, grace-window expiry effects, stale-offer
sweeps (lazy today), and the storage deadline auto-forfeits the RV page publishes ("if no
application is received by the deadline, the board will assume you are vacating"). One
Workers cron trigger plus a small job registry (each job: name, its due-work query, its
action, its audit rows) unlocks all of them. **Recommendation: build it now — it is the
single highest-leverage missing piece.**

## Promises our own shipped copy makes that machinery must honor

1. "We'll email you if a spot opens" (signup page) — TRUE as of today's rulings: the
   auto-offer on freed capacity (unparked) + the offer email (wiring today). Closing.
2. "We'll follow up by email with anything you need before class / the weekend" — NO
   SENDER EXISTS. Needs the per-class roster send (an admin one-click "email this
   roster" action lands cheaply on the class detail; full segment machinery is 2.3).
3. The welcome email bundle ("your class credit, a Discord invite, and a link to your
   member account") — the join flow's send, built with the join flow (portal chain);
   the Discord invite link inside it needs a stable invite source.
4. Boson Bot announces new posts to Discord — the bot lives in the legacy stack and
   watches the OLD site's feed. **Cutover checklist item: repoint the bot to the new
   feed.xml or it silently stops announcing.**

## Real gaps folded into current builds (decided today)

5. **Member early-access windows** (bulletin: "members get advance notice before we open
   signup to the public"): classes gain member_open_at/public_open_at; the signup route
   gates by audience + time; the announce email is the notice. Rides the portal chain.
6. **Withdraw / drop everywhere**: member self-withdrawal (contracted today, reversing
   credit grant, auto-offer chain), an admin drop action on the roster, and self-service
   leave-the-waitlist. Rides the portal chain.
7. **Payment windows: RULED (Geoff) one global 30-day window**; the RV page's published
   15-day deposit language edited to 30 to match (the symmetry principle cutting the
   other way: when the system rule wins, the prose updates).
8. **The storage confirm-your-spot email** (bulletin promise, verbatim the retention
   machinery + tokened link): being built; the email template joins the port.

## Real gaps filed forward (named scope, not silent)

9. **Participation tracking: RULED (Geoff) DEFERRED ENTIRELY.** The merit gate and the
   published storage-priority criteria stay leadership judgment, on purpose. Recorded so
   the silence is a choice; revisit only if leadership asks.
10. **Race registration** (2.3/2.4): the NOR bulletin runs entries through MW with real
    fees and deadlines — an MW function the migration inventory missed. The per-event
    pages are its natural home post-payment-integration.
11. **Cancellation/refund machinery** (with payments): the education page publishes
    14-day deadline math, processor-fee deductions, and a carry-to-next-year voucher —
    the voucher is a ledger grant with its own source tag; the deadline math rides the
    payment build.
12. **Boat qualifications** (later): class completion "checks you out" on boats — a
    per-member qualification record; operationally manual today, a natural post-2.2
    portal surface.
13. **The support/reimbursement form** (2.3): category routing + receipt upload, per the
    Issues & Support page's own promises.

## Deliberately manual (no software planned; recorded so silence is a choice)

The budget cycle, elections (the bylaws' quorum/fallback/deadline rules stay on the
annual-meeting process), regatta boat-reservation forfeiture (a skippers-meeting
check-in), private-event and long-stay approvals, guest paper waivers (the versioned
waiver machinery could absorb these later if wanted).

## The symmetry principle (Geoff, 2026-07-07: a standing design rule)

**Every self-service action implies its inverse.** Sign up implies withdraw; join a
waitlist implies leave it; request implies cancel-the-request. The audit across the full
action inventory:

| Action | Inverse | State |
|---|---|---|
| Class signup | Withdraw (reversing grant, auto-offer chain) | Contracted today |
| Waitlist join | Leave the waitlist | Contracted today |
| Offer claim | Decline ("pass this time") | Built |
| Asset request | **Cancel the pending request** | ADDED by this audit |
| Asset held | **Member-initiated release** ("I'm done with my RV spot" — one click, admin sees it in the strip, frees to the queue) | ADDED by this audit |
| Household add member | Remove member | Contracted |
| Directory listed | Hidden, one click | Contracted |
| Renewal reminders | The stated-final last touch | Contracted |
| Segment/bulk sends (2.3) | **An email-preferences opt-out surface** | ADDED, files to 2.3 |

The rule binds future features: any new "do X" ships with its "undo X" or names why not.

## The auto-email principle (Geoff, 2026-07-07: the second standing rule)

**A manual email is a system deficiency. If the system knows something a member needs to
know, the system sends it.** The full send inventory, each with its trigger:

| Send | Trigger | State |
|---|---|---|
| Signup / waitlist confirmation | Public class signup (on-screen only today — a GAP this audit adds) | Folds into today's email build |
| Offer (claim link) | Auto-offer on freed spot; admin offer | Wiring today |
| Welcome bundle (credit, Discord, portal link) | Join completes | With the join build |
| Storage confirm-your-spot | Retention window opens | With the request machinery |
| Renewal reminders (the four touches) | Cron, per-household rolling dates | Needs the job runner |
| Class reminder SET (Geoff, 2026-07-07): welcome-on-signup, ~7 days out, day-before, after-with-next-steps | Signup (welcome) + cron T-minus per class start_date (the rest) | The job runner build; per-participant, guardian-routed for kids, each a settings-configurable template with a class-specific override slot, sent once (a per-enrollment per-touch marker) |
| Approved-asset "pay to confirm" + window reminder | Approval; cron mid-window | With requests + job runner |
| New-signup nudge to the membership committee | Signup lands | With the attention strip |
| Admin notice: class withdrawal + where the auto-offer went | Member withdraws (Geoff, 2026-07-07) | With the withdrawal build |
| Admin notice: an offer was auto-sent (spot freed any other way) | Auto-offer fires | Same send, same build |
| Payment receipts | Any payment | With payments |
| The recurring-billing courteous note (8 members) | One scripted send at MW cutover | Filed |
| Support/reimbursement acknowledgments | 2.3's forms | Filed to 2.3 |
| Election/bylaws notices | Deliberately manual (legal-formal, rare) | Recorded as chosen |

Every automated send writes email_log per recipient and honors the coming preferences
opt-out (bulk classes of mail only; transactional confirmations always send).

## Decisions for Geoff

All four RULED (Geoff, 2026-07-07): A. the job runner builds now (blessed via the
auto-email principle); B. early access = 7 days, a Club setting; C. one global 30-day
payment window (the RV prose edited to match); D. participation tracking deferred
entirely.

## Ops parity audit verdict (2026-07-07, the 410-readiness report)

**GO to retire ops's EVENT/CLASS routes now.** The 12 events + 5 classes match exactly,
every guarded route has a verified home (parity or documented supersession), the 410
patch's route set is a precise 1:1 match with zero leakage, and both excluded routes
(`/images`, `/api/schema`) have real live reasons to stay (the handbook fetches
`/api/schema` cross-origin). One rationale refresh owed: `/images` has no live consumer
anymore (the 14 hero images migrated), but keeping it is zero-risk.

**HOLD on retiring the REST of ops** until these gaps close (ranked):
1. **Asset fee COLLECTION — the real blocker.** `recordPayment` only logs money already
   received; ops's Stripe-payment-link generation + prefilled email has NO home. This is
   how RV/mooring/parking fees get paid. Gates on the Stripe key + the payment build; it
   is the top priority of the payment integration, not an afterthought.
2. **Members/Signups on demo fixtures** — being replaced by the portal capstone (the real
   member store) as this lands.
3. **Discord notifications** absent (payment-request, waitlist events) — a committee
   visibility loss; wire to the auto-email/Discord layer.
4. Asset-type fee editing (no writer); class-waitlist manual reorder; waitlist admin
   notes; email-template editing (deferred to 2.3); post-create assignment-note editing.

Every gap is known and named; none is a silent miss. This matches the incremental-
absorption plan: events/classes is the first wave actually done.
