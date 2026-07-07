# Discord notifications: wiring guide

Closes the ops parity audit's "Discord notifications absent" gap
(`docs/2026-07-07-requirements-adversarial-review.md`, ops-parity verdict item 3): ops posted
committee-facing pings on payment-request and waitlist events; the phase-2 system has none.

The module is `src/admin-club/lib/discord.ts`: `notifyDiscord(env, notification)` posts one
Discord webhook embed, best-effort, never throws, and degrades silently when the channel's
webhook secret is unbound. Five builders shape the real events (`buildPaymentRequestNotice`,
`buildAssetRequestSubmittedNotice`, `buildWaitlistSignupNotice`, `buildOfferSentNotice`,
`buildClassFilledNotice`). It was built self-contained on purpose: no import from and no edit to
`offers.ts`, `enrollments.ts`, `assets-store.ts`, `club-settings.ts`, `classes-store.ts`, or
`club-email.ts`, all mid-merge across other worktrees at build time. Wiring a call into one of
those files is this document's own list, a mechanical follow-up for whoever next touches each
file (or a dedicated small pass once the merges settle).

## Call sites

Each row names the file, the function, and the one line to add after that function's write
succeeds. `env` is whatever `Platform.env`-shaped binding object the call site already has in
scope (`platform?.env` in a route, or a passed-through `env` parameter in a store function that
already takes one, matching `offerSpot`'s own `notify?: { env, origin }` pattern in
`offers.ts`).

| Event | File → function | Add |
|---|---|---|
| Waitlist signup | `enrollments.ts` → `signUpForClass`, `'waitlisted'` branch, after the `db.batch()` commits | `await notifyDiscord(env, buildWaitlistSignupNotice({ className: cls.name, applicantName: input.name, position }));` |
| Class filled | `enrollments.ts` → `signUpForClass`, `'enrolled'` branch, after the `db.batch()` commits, only when this enrollment brought the class to capacity (`cls.enrolledCount + 1 === cls.capacity`) | `if (cls.enrolledCount + 1 === cls.capacity) await notifyDiscord(env, buildClassFilledNotice({ className: cls.name, capacity: cls.capacity }));` |
| Offer sent | `offers.ts` → `offerSpot`, inside the `if (args.notify)` block, right after the `sendClubEmail` call, inside its own `if (contact)` so a real name is always available (covers both today's admin-triggered offer and the auto-offer chain once it lands, since both call this one function) | `await notifyDiscord(args.notify.env, buildOfferSentNotice({ className: cls.name, applicantName: contact.name, expiresAt: formatClubTimestamp(expiresAt) }));` |
| Asset payment request sent | `assets-store.ts` → the payment-window "pay to confirm" writer (not yet built; the payment integration names it in the adversarial review's own send inventory, "Approved-asset 'pay to confirm' + window reminder"), after that write succeeds | `await notifyDiscord(env, buildPaymentRequestNotice({ memberName, assetTypeName, amount, dueBy }));` |
| Asset request submitted | `assets-store.ts` → the member-submitted request writer (also not yet built; the symmetry-principle audit names the pending-request state this event announces, "Asset request \| Cancel the pending request \| ADDED by this audit"), after the insert succeeds | `await notifyDiscord(env, buildAssetRequestSubmittedNotice({ memberName, assetTypeName, notes }));` |

The last two rows have no live function to attach to yet: the asset payment-request and
member-submitted-request writers are part of the payment integration named as the ops-parity
audit's top blocker ("Asset fee COLLECTION"), still unbuilt as of this pass. Once either lands,
its own writer is the call site; the notification call is one line at the end of the function,
same as the three rows above.

`env` needs the two webhook fields visible to it wherever `notifyDiscord` is called. Mirroring
`EmailBindingEnv`'s own pattern in `club-email.ts`, `DiscordBindingEnv` is a small structural
type (`{ DISCORD_WEBHOOK_ASSETS?: string; DISCORD_WEBHOOK_CLASSES?: string }`), so passing
`platform.env` (or a `CLUB_DB`-adjacent `env` parameter already threaded into a store function)
type-checks today with no edit to `src/app.d.ts`. Adding the two optional fields to
`app.d.ts`'s own `Platform.env` intersection is a worthwhile follow-up regardless, so
`wrangler secret list` and this repo's own type declarations agree, but it is not required for
any of the call sites above to compile.

## Secrets cutover

`DISCORD_WEBHOOK_ASSETS` and `DISCORD_WEBHOOK_CLASSES` already exist as secrets on the **ops**
worker (`~/.claude/docs/cloudflare-estate-inventory.md`'s own note on ops's webhook config). The
**asc-site** worker needs its own copies of both:

- Worker secrets are write-only (`wrangler secret list` returns names, never values); the ops
  worker's own webhook URLs cannot be read back through the Cloudflare API or `wrangler`.
- Reaching each Discord server's webhook settings screen and copying the URL fresh, or asking
  Geoff for the two URLs he already has, are the only two ways to get the values. Neither is a
  script; this is a flagged human step, not something this pass can complete unattended.
- Once the two values are in hand: `npx wrangler secret put DISCORD_WEBHOOK_ASSETS` and
  `npx wrangler secret put DISCORD_WEBHOOK_CLASSES`, run from a checkout bound to the asc-site
  worker.

Until both secrets are set, every `notifyDiscord` call degrades to a logged no-op (this
module's own graceful-degrade path, proven by `src/tests/discord.test.ts`), so wiring the call
sites above and setting the secrets are independent steps: shipping the calls first is safe.
