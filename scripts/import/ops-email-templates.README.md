# ops-email-templates: import asc-ops.email_templates into asc-club.email_templates

## What this does

Reads every row of the read-only `asc-ops` database's `email_templates` table (bound as
`EVENTS_DB`, never altered by this or any other script) and upserts it into `asc-club`'s
`email_templates` table (bound as `CLUB_DB`) by natural key: `id` is already the same
stable string on both sides (`class_signup`, `payment_request`, and so on), so no
slug-style remapping is needed. Also seeds one row this script authors rather than ports,
`class_offer` (see "The one authored template" below). Re-running is safe: a row whose
mapped columns already match is skipped, a row that differs is updated, and no row is ever
duplicated.

## Field mapping

| asc-club `email_templates` column | asc-ops source | Notes |
|---|---|---|
| `id` | `id` | verbatim, the natural key |
| `subject` | `subject` | verbatim |
| `reply_to` | `reply_to` | verbatim; a literal committee address, never a variable |
| `body` | `body` | verbatim (see "Nothing to adapt" below) |
| `updated_by` | `updated_by` | `'import:ops'` when the source is `NULL` (most rows: no admin has ever hand-edited one on the ops side), since asc-club's own column is `NOT NULL` |
| `updated_at` | not mapped | asc-club's own `DEFAULT (datetime('now'))` stamps the import moment instead of carrying ops's history forward, since (unlike `events`/`classes`) a template's edit history was never the point of this port |

## Nothing to adapt: the templates are already markdown-with-variables

Every ops template body is already exactly the shape asc-club's design wants: plain
markdown, `{{variable}}` placeholders, no HTML and no Resend-specific markup. Confirmed by
reading ops's own rendering code (`~/Projects/aksailingclub-legacy`), not assumed from the
stored text alone:

- `shared/template.js`'s `renderTemplate` is a bare `String.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g,
  ...)`: a plain mustache-lite substitution, no conditional syntax of its own.
- What LOOK like conditionals inside a template (`{{fee_section}}`,
  `{{description_section}}`, `{{comment_section}}`, `{{note_section}}`) are ordinary
  variables: `ops/src/services/email.js`'s own `buildSection`/`buildFeeSection` helpers
  precompute either an empty string or a filled block of markdown BEFORE calling
  `renderTemplate`, so the template text itself never branches.
- `shared/markdown.js`'s `markdownToHtml` (bold, `---` as `<hr>`, paragraph breaks) is what
  ops fed the rendered body through before handing it to Resend; `shared/email.js` did the
  actual send (`api.resend.com/emails`, a `from`/`to`/`subject`/`html`/`text` JSON body).
  None of that is template SYNTAX, only send-time plumbing this port replaces with
  `club-email.ts`'s own equivalents.

## The variable vocabulary, template by template

(`{{committee_email}}` resolves per waitlist type in ops's own code, `program-committee@`
for classes and `membership-committee@`/`finance-committee@`/`board@` elsewhere; asc-club's
`sendClubEmail` passes it explicitly per call site rather than re-deriving it.)

| Template | Variables |
|---|---|
| `asset_approval` | `person_name`, `item_display_name`, `fee_section`, `description_section`, `committee_email` |
| `asset_denial` | `person_name`, `item_display_name`, `committee_email` |
| `asset_signup` | `person_name`, `item_display_name`, `position`, `description_section`, `committee_email` |
| `billing_inquiry` | `person_name`, `person_email`, `person_phone`, `message` |
| `class_approval` | `person_name`, `item_display_name`, `registration_url` (ops-only: MW registration, retired by the no-port ruling; a template consumer that no longer has a registration URL to fill omits it rather than sending a broken link) |
| `class_denial` | `person_name`, `item_display_name`, `committee_email` |
| `class_signup` | `person_name`, `item_display_name`, `position`, `comment_section`, `committee_email` |
| `donation_receipt` | `donor_name`, `date`, `amount`, `reference`, `note_section` |
| `payment_notification` | `person_name`, `person_email`, `asset_type_name`, `amount`, `payment_date` |
| `payment_receipt` | `person_name`, `asset_type_name`, `season`, `amount`, `reference` |
| `payment_request` | `person_name`, `asset_type_name`, `season`, `fee_display`, `payment_url` |
| `class_offer` (authored, below) | `person_name`, `item_display_name`, `claim_url`, `expires_at`, `committee_email` |

## The one authored template: `class_offer`

Ops has no equivalent notification for the redesigned time-limited waitlist offer
(`offers.ts`'s `offerSpot`): ops's own `class_approval` announces open registration to
EVERYONE via a `registration_url` (the MW-backed flow the design suite's no-port ruling
retires entirely), not a single-use claim link sent to one specific waitlisted person.
`class_offer` is authored fresh in `ops-email-templates.mjs` itself (not a migration seed),
because it belongs in the same table alongside its ported siblings and the same idempotent
upsert already handles "does this row need to change" for it too. Audited under a distinct
actor (`authored:pass-2-2`, never `import:ops`) so the audit trail is honest about which
rows are real ops history and which is new.

## Audit trail

Every insert or update is audited: `actor='import:ops'` for a ported row (`'authored:pass-2-2'`
for `class_offer`), `action='import.insert'` or `'import.update'`, `entity='email_template'`,
`entity_id=<the id>`, `detail` carrying the run's batch id
(`ops-email-templates-<UTC timestamp>`) and the source. Every run, even a complete no-op,
also audits one `action='import.batch'` summary row (`entity_id=NULL`, always
`actor='import:ops'`) recording the source count and the inserted/updated/unchanged
totals.

## How to run

```sh
node scripts/import/ops-email-templates.mjs --dry-run   # prints the planned SQL, executes nothing
node scripts/import/ops-email-templates.mjs             # applies it to the real asc-club
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and
network access to the real `asc-ops` and `asc-club` databases; both are always `--remote`,
there is no local-D1 mode for this script.

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/ops-email-templates.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

Expect 12 rows total: the 11 ids ported from asc-ops, plus `class_offer`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/ops-email-templates.rollback.sql
```

Removes every template row this importer has ever created or authored, in full (see the
rollback file's own header for why this is not scoped to a single run's batch id). Only
safe before the Email screen's own template-editing feature (2.3's full scope) has ever
written a real edit into one of these rows.
