# Go-live cutover runbook: apex flip and MembershipWorks retirement

This runbook takes the Alaska Sailing Club site live. It flips the production apex
(`aksailingclub.org` and `www.aksailingclub.org`) from the legacy Hugo Worker to the
`asc-site` Worker built in this repo, then retires MembershipWorks after a two-week soak.

Audience: an operator session (Opus- or Fable-conducted) running the cutover step by step,
with Geoff approving the human gates. Every step states its verification. Every step with a
reversible effect states its rollback.

## How the flip actually works

The apex is not served from a GCE origin. It is served today by the legacy Cloudflare Worker
`aksailingclub-org` (the Hugo site bundled as Worker assets, in `~/Projects/aksailingclub-legacy`,
whose committed `wrangler.toml` claims the routes `aksailingclub.org/*` and
`www.aksailingclub.org/*`). The apex `A` record (`35.215.115.137`, a GCE-era IP, proxied) is a
placeholder the Worker route overrides.

The flip reassigns two hostnames from one Worker to another on an already-proxied zone, an
edge configuration change that takes effect within seconds, rollback included. No record value
changes and no resolver cache is in the path, so nothing propagates.

Geoff's ruling called for "a low DNS TTL" so that a rollback would be fast. The intent behind
that ruling, instant rollback, is satisfied by the mechanism itself. TTL is moot here because
no record value changes and no resolver cache is in the path. This runbook keeps the legacy
Worker warm for instant rollback (the ruling's real requirement) and does not manipulate TTL.

## 0. Preconditions and blockers

Do not proceed past this section until every item is confirmed. Each is a hard blocker.

1. **Payments live-mode smoke passed.** The live-Stripe smoke defined in
   `docs/2026-07-15-payments-live-smoke-design.md` is a named cutover blocker. Confirm it ran
   green (a real charge refunded through the ledger path). Verify: the smoke's own recorded
   pass, plus the `audit_log` row it writes.
2. **Geoff's dev walkthrough is done.** The five-stop walkthrough (Members, household desk,
   Money & Renewals, Compose, the sidebar and ManageEditors) has Geoff's sign-off.
3. **GitHub Actions billing is clear.** Both `ci.yml` and `deploy.yml` were once blocked on a
   spending-limit condition. Verify: `gh run list --limit 3` shows recent runs that started and
   ran, not 2-5 second billing failures.
4. **A fresh MembershipWorks export is in hand.** Geoff has pulled the current member export,
   accounting CSV, and attendee rosters into `~/.local/asc-data/` as plaintext (never committed).
   The committed archives at `data/membershipworks/*.csv.age` are the 2026-07-13 snapshot, not
   the delta. Verify: the three source paths exist and carry a date later than 2026-07-13.
5. **Live route-to-script bindings confirmed.** Read the current Workers routes for the zone so
   you know exactly what the flip reassigns and what it must leave alone. Use the dashboard
   (Workers & Pages, then the zone's routes) or a token scoped `Workers Routes:Read` (the
   research token lacked that scope). Confirm: `aksailingclub.org/*` and `www.aksailingclub.org/*`
   resolve to the legacy `aksailingclub-org` Worker; `ops.aksailingclub.org` and
   `handbook.aksailingclub.org` are separate Workers on their own routes; `dev` and `staging`
   are Workers custom domains.

**Access posture decision (Geoff decides, do not decide it here).** No Access application covers
the apex or `www`; production stays public after the flip, which is correct. Separately,
`dev.aksailingclub.org` currently serves `200` with no Access token, so dev is not behind Access
despite `CLAUDE.md` stating it is. `dev` stays bound to `asc-site` after the flip. Surface the
question to Geoff: re-protect dev now, or accept it public until the flip makes dev redundant.
Record his answer before proceeding.

## 1. Pre-flip verification pass

The mechanical gates measure correctness, never resemblance. A real render read on dev is the
step that measures what a member sees. Reference the shape of `docs/verification-findings.md`.

1. **Mechanical gates.** Run `npm run check` (expect 0 errors, 0 warnings), `npm test`, and
   `npm run build`. Verify: all three exit `0`.
2. **Pixel-diff e2e suite.** Run `npm run test:e2e`. Verify: the suite is green across the
   five-viewport matrix (`FAMILY_WIDTHS` in `e2e/site-visual.spec.ts`). Known caveat: CI's local
   R2 replica is empty, so real photos render as broken-image glyphs in CI. The suite catches a
   layout regression, not a photo regression. This is why step 4 exists.
3. **Permalink crawl.** The URL list comes from the legacy apex; the target under test is
   the new build. Fetch every `<loc>` in `https://aksailingclub.org/sitemap.xml` (73 URLs at
   the last pass), then request each path against `https://dev.aksailingclub.org`, plus the
   delivery routes (`/feed.xml`, `/feed.json`, `/robots.txt`, `/healthz`, `/sitemap.xml`),
   following redirects, and check each for a final `200` or the sanctioned `404` (the two
   `notifications`-concept bulletin URLs, observable only on the new build). Pre-flip the
   apex still serves the legacy site, so crawling the apex against itself proves nothing
   about this build; this form matches how `docs/verification-findings.md` ran the original
   crawl (the live URL list against the new build). The original crawl script was not
   committed; write a fresh loop. Verify: every URL resolves as
   `docs/verification-findings.md` records, with no unsanctioned gap.
4. **Real render read on dev.** Render `dev.aksailingclub.org` against the real R2 bucket (real
   photos, not the CI broken-image glyph). Read the home page, education, `/events/`, and a post.
   Verify: photos load, the Season band shows the C7-gold taxonomy, no broken layout.
5. **Fresh-context visual verification.** The phase-1 pass was self-graded by the implementing
   session. Dispatch a fresh-context `visual-verifier` (not the session running this cutover)
   against dev at the family five-viewport bar, per the visual-fidelity doctrine. Verify: the
   verifier returns no STRUCTURAL findings; triage any COSMETIC ones with Geoff.

## 2. MembershipWorks delta re-import

Members keep joining and renewing on MembershipWorks until the flip, so the database needs a
final delta import. Do not run the import script during drafting or rehearsal; run it here
against the fresh export from step 0.4. Run this section as close to the flip as practical: any
member who joins or renews on MembershipWorks after the export is missed until the next run. If
the before/after gate (section 4) stretches past a day or two, pull a newer export and re-run;
the import is idempotent and a re-run is cheap. Full mechanics live in
`scripts/import/mw-members.README.md`; this section is the sequence, not a substitute for it.

1. **Back up asc-club first.** This is the only full restore path; the rollback script undoes
   only `import.insert` rows.
   ```sh
   npx wrangler d1 export asc-club --remote --output backup-$(date +%Y%m%d%H%M%S).sql
   ```
   Verify: the file exists and is non-empty.
2. **Dry run.** Point the script at the fresh files and review the whole before-to-after report.
   ```sh
   node scripts/import/mw-members.mjs --dry-run \
     --source ~/.local/asc-data/<member-export>.csv \
     --accounting ~/.local/asc-data/<accounting>.csv \
     --attendees ~/.local/asc-data/mw-attendees/
   ```
   Verify: the plan's creates, updates, and refusals all read as expected; no unexplained refusal.
3. **Real run.** Same flags without `--dry-run`. The script always writes `--remote`.
   Verify: the run completes and prints its `import.batch` summary.
4. **Verify.** Run the import's own verification query.
   ```sh
   VERIFY_SQL=$(grep -v '^--' scripts/import/mw-members.verify.sql | grep -v '^\s*$')
   npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
   ```
   Verify: counts match the report from step 3.

**Rollback.** A mid-run failure recovers by a plain re-run (the import is idempotent on
`mw_account_id` provenance). To undo created rows, run
`npx wrangler d1 execute asc-club --remote --file scripts/import/mw-members.rollback.sql` (undoes
`import.insert` rows only). To reach the exact pre-import state, restore the step-1 backup.

## 3. Content flips

Fix the copy that goes stale once MembershipWorks is no longer the directory system. After any
edit made outside the admin, run `npm run cairn:manifest`.

1. **Required fix.** `src/content/posts/2026-02-27-welcome-new-website.md:34` claims the
   directory is "powered by the same MembershipWorks software". This is wrong post-cutover.
   Reword to drop the MembershipWorks present-tense claim. Verify: the phrase no longer appears.
2. **Archival mentions.** The 2024-04-21 and 2024-07-31 posts mention MembershipWorks. Leave
   them as dated news; a dated editorial note is optional. Verify: confirm the 2024 post's
   `/membership/` link still resolves through a redirect to a final `200`.
3. **Regenerate the manifest.** Run `npm run cairn:manifest`. Verify: `git diff` shows the
   manifest updated and `npm run check` stays 0/0.

The `membershipworks` embed directive is already retired and the join/renew pages already point
at the internal doors. No directive work is needed here.

## 4. Geoff's before/after gate

Nothing reaches production without a full-page render read by human eyes, and this member-facing
site requires Geoff's explicit before/after approval.

1. Present Geoff a before (current `aksailingclub.org`, the live Hugo site) and after (dev on
   `asc-site`) at the pages he wants to compare.
2. Verify: Geoff gives an explicit go. Without it, stop. The flip does not proceed on a mechanical
   green alone.

## 5. The flip

Preferred mechanism: Workers route reassignment. It matches how the apex is served today,
touches no DNS record, and rolls back exactly (repoint the routes). The custom-domain form
(how `dev` and `staging` bind) was considered and demoted: Cloudflare refuses a custom domain
on a hostname with an existing DNS record, so it would require deleting the proxied `www`
CNAME and apex `A` record first, and deleting the custom domain at rollback removes the
record it created, leaving the apex unresolvable. See the alternative note after section 6.

1. **Deploy the current `asc-site` build.** Confirm the Worker running is the reviewed build.
   ```sh
   npm run build:search
   npx wrangler deploy
   ```
   Verify: the deploy reports a version id; note it for the rollback record.
2. **Reassign the two routes.** Repoint `aksailingclub.org/*` and `www.aksailingclub.org/*`
   from the `aksailingclub-org` Worker to `asc-site`, via the dashboard (the zone's Workers
   Routes screen) or the zone routes API. Add the same two patterns to this repo's
   `wrangler.toml` as a `routes` block in the same change so future deploys keep the claim.
   Claim only these two exact patterns. Never claim a wildcard route. The DNS records do not
   change. Verify: the zone's route list shows both patterns bound to `asc-site`.

   Soak-window caveat: the legacy repo's committed `wrangler.toml` still claims these
   patterns, so a push to its `master` during the soak will fail its deploy on the route
   conflict. That failure is expected and harmless. Do not remove the legacy config's route
   claims until the retirement tail; rollback depends on them.
3. **Apex serves the new site.**
   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' https://aksailingclub.org/
   curl -sS https://aksailingclub.org/ | grep -o '<title>[^<]*</title>'
   ```
   Verify: `200`, and the `<title>` matches the cairn build, not the Hugo site.
4. **www serves the new site and redirects as expected.** Verify: `curl -I https://www.aksailingclub.org/`
   returns the new site (or the site's canonical apex redirect, whichever the build defines).
5. **ops and handbook are unaffected.** Verify:
   `curl -sS -o /dev/null -w '%{http_code}\n' https://ops.aksailingclub.org/` and the handbook
   host both still return their normal responses. The coexistence requirement (the ops dashboard
   keeps working through phase 2) holds.
6. **Admin login works on the apex.** Request a magic link at `https://aksailingclub.org/admin`
   and complete a login. Verify: the session cookie is `__Host-cairn_session` (https form) and the
   admin sidebar renders.
7. **Stripe webhook reaches the production origin.** Stripe's dashboard test events are a
   test-mode affordance, so verify the live endpoint in two parts. First, reachability: an
   unauthenticated JSON POST to `https://aksailingclub.org/api/stripe/webhook` returns the
   route's own `400` ("Invalid signature."), proving the route answers on the apex. Second,
   delivery: confirm the first live event (the payments smoke, or the first real checkout)
   shows `2xx` in the Stripe dashboard's delivery log for the live-mode endpoint. (The
   live-mode key and endpoint are set per the payments spec; see the "Payments live posture"
   note below.)

**Payments live posture.** Before or at the flip, set `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` to live-mode values and register the live-mode webhook endpoint for the
production origin, following `docs/2026-07-15-payments-live-smoke-design.md`. That spec owns the
exact procedure; do not duplicate it here. The live smoke passing (step 0.1) is the gate that
this posture is correct.

**Rollback:** see section 6. It is a standalone procedure.

## 6. Rollback (standalone, runnable at any point)

The legacy Worker `aksailingclub-org` stays deployed and warm throughout. Rollback returns the
two hostnames to it and takes effect at the edge within seconds.

1. **Repoint the two route patterns back** to `aksailingclub-org` via the dashboard or the
   zone routes API, the exact reverse of step 5.2. The legacy Worker is still deployed and
   warm, so this alone restores the Hugo site. No DNS changes.
2. **Alternative reclaim.** If the dashboard and API are unavailable, redeploy the legacy
   repo (`npx wrangler deploy` from `~/Projects/aksailingclub-legacy`, or push to `master` to
   trigger its `deploy.yml`): its committed `wrangler.toml` re-asserts both patterns. First
   remove the two patterns from this repo's `wrangler.toml` and the zone, or the claim will
   conflict.
3. Verify: `curl -sS https://aksailingclub.org/ | grep -o '<title>[^<]*</title>'` shows the Hugo
   title again, and `curl -o /dev/null -w '%{http_code}\n' https://aksailingclub.org/` is `200`.

If the cron was re-enabled (section 7) before a rollback becomes necessary, disable it again
first (re-comment the trigger and redeploy `asc-site`) so a rolled-back, pre-production Worker
cannot email members.

**Custom-domain alternative (not preferred).** The flip can instead use Workers custom
domains, the `dev`/`staging` pattern, but only with its prerequisites met explicitly: delete
the existing proxied `www` CNAME and apex `A` record first (Cloudflare refuses a custom
domain over an existing record), and accept that rollback must then also recreate a proxied
apex record before the legacy route can serve again (deleting a custom domain removes the
record it created; `www` alone would recover via the wildcard CNAME, the apex would not).
Under this form, section 9.4 is moot. Use it only if route reassignment is unavailable.

## 7. Re-enable the reminder cron

The daily job tick is disabled by keeping `crons` commented out of `wrangler.toml` `[triggers]`.
It was disabled 2026-07-14 after an unguarded tick fired 655 catch-up reminders (184 delivered).
Re-enabling rides on the reminder-blast guard (already landed) and is an explicit step here,
never a side effect of a deploy.

1. **Confirm the guard is present.** In `src/jobs/runner.ts`, confirm `PER_TICK_SEND_CAP = 50`
   and the shared `TickSendBudget`. In `src/jobs/renewal-reminders.ts`, confirm
   `STALENESS_CUTOFF_DAYS = 10` and the cycle-keyed sent markers (migration 0024,
   `alreadySentTouches`). Verify: the constants read as stated.
2. **Uncomment and deploy.** Restore `crons = ["0 8 * * *"]` under `[triggers]` in
   `wrangler.toml` and run `npx wrangler deploy`. Verify: `npx wrangler deployments list` shows
   the new version, and the schedule appears in the Worker's triggers.
3. **Watch the first tick.** After the first `08:00` UTC tick, read the `audit_log` rows written
   by the scheduled handler (`actor = 'system:cron'`; jobs `renewal-reminders`, `class-reminders`,
   `class-refund-window-notice`, `expire-stale-offers` from `src/jobs/registry.ts`). Verify: the
   send count is at or below the per-tick cap and there is no unexpected `send_cap_hit` row. A
   `send_cap_hit` on the first real tick means overdue touches queued up; investigate before the
   next tick rather than letting it drain.

**Rollback:** re-comment the trigger and redeploy `asc-site`.

## 8. The two-week soak

Geoff's ruling: two weeks, quiet. No member announcement. The site simply works.

Hold at this state for two clean weeks after the flip. The exit criteria:

1. **Two calendar weeks with no cutover-attributed incident.** A rollback or a corrective deploy
   restarts the clock.
2. **One full reminder-touch cycle completed cleanly.** The cron runs daily (`0 8 * * *`), so a
   "cycle" is the reminder system's touch cycle completing without a `send_cap_hit` surprise or a
   mis-send, observed across the soak's daily ticks. Wording reconciliation flag: the ruling said
   "one full weekly cron cycle"; the cron is daily, so read the intent as the reminder-touch
   cycle completing cleanly, not a literal weekly schedule. Confirm with Geoff if the distinction
   matters to his sign-off.
3. **At least one real member join or renewal** has flowed through the live site (not a smoke),
   confirmed in `audit_log` and, for a paid renewal, in the Stripe live dashboard.

Do not start the retirement tail until all three hold. During the soak, the legacy Worker stays
warm and rollback stays available.

## 9. Retirement tail

Run only after the soak's exit criteria are met. These steps are irreversible in practice; take
each deliberately.

1. **Cancel the MembershipWorks subscription.** Geoff cancels through MembershipWorks. Verify:
   the account confirms cancellation. This ends MembershipWorks as the system of record.
2. **Clean the MembershipWorks-tail DNS records.** These were out of scope at the flip and die
   only when MembershipWorks is gone: the SendGrid include in the apex SPF `TXT`
   (`u3300229`), and the `mw.*` SendGrid DKIM CNAMEs. Verify: `dig TXT aksailingclub.org` no
   longer shows the SendGrid include, and the `mw.*` records are removed. Leave the Google MX,
   the `cf-bounce` Email Routing record, and the DMARC `p=none` record untouched; they are not
   MembershipWorks records.
3. **Check for a running GCE instance.** The serving path has no GCE dependency, but a GCE-era IP
   lingered in the placeholder apex `A` record and the roadmap named GCE retirement. Geoff checks
   the club's GCP project for any still-running or still-billing instance (GCP creds exist via
   `GOOGLE_APPLICATION_CREDENTIALS`; treat this as Geoff's step). Decommission any instance found.
   Verify: no billable compute remains in the project.
4. **Normalize the apex placeholder record.** Under the route form the proxied apex record
   stays load-bearing (a Workers route serves only over a proxied DNS record), so do not
   remove it. To stop the GCE-era IP lingering, optionally replace `A 35.215.115.137` with
   the family-standard `AAAA 100::` placeholder (the `dev`/`staging` pattern), keeping it
   proxied. Verify: the apex still serves `200` from `asc-site` after the swap.
5. **Archive the legacy repo.** After the soak and once rollback is no longer wanted, archive
   `glw907/aksailingclub-legacy` on GitHub. Verify: the repo shows as archived. Do this last; it
   is the final removal of the warm rollback path.

## References

- `docs/verification-findings.md`: the phase-1 verification pass and the shape of the crawl.
- `scripts/import/mw-members.README.md`: the full delta-import mechanics.
- `docs/2026-07-15-payments-live-smoke-design.md`: the live-Stripe key mode and webhook procedure.
- `wrangler.toml`: the cron trigger (commented), the D1 bindings, and the 2026-07-14 incident note.
- ROADMAP.md, the `mw-cutover` entry: the governing rulings this runbook executes.
