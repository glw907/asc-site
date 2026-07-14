# The MW exports' shape (aggregates only; plaintext stays out of git)

Sources: Geoff's MembershipWorks exports, plaintext machine-local at `~/.local/asc-data/`
(member PII; never commit plaintext) with age-encrypted archival copies committed at
`data/membershipworks/` (see its README). This note keeps the structural findings the
import scripts and portal design depend on.

## The 2026-07-13 export pair (the complete picture)

`mw-export-2026-07-13.csv` (286 rows) plus `mw-transactions-2026-07-13.csv` (5 rows).
Basis of the full import (`docs/plans/2026-07-13-mw-full-import.md`).

- **286 member rows: 148 primaries + 138 household sub-members.** `Parent Account ID` is now
  populated; every sub-member's parent resolves to a primary in the same file. This closes the
  July 7 export's sub-member gap (the ~210-members estimate undershot: the real total is 286).
- **Primaries carry exactly one tier flag each (69 Family / 66 Single / 13 Young adult); zero
  flags on every sub-member.** Standing by renewal date on 2026-07-13: 87 active (43 Single /
  40 Family / 4 Young adult), 61 lapsed (34 with 2026 renewals, 27 with 2025).
- **Two primaries are new since July 7** — both matched by the transaction log's two Membership
  rows (real Stripe charge ids, real payment dates, amounts matching the tier prices), so their
  membership rows import with real `paid_at`/`stripe_ref`, not the renewal-date approximation.
  Zero renewal dates changed for the other 146.
- **Sub-member contact coverage: 76/138 emails, 58/138 phones.** 48 sub-member emails are
  already claimed (31 by a primary, 17 within sub-members — families sharing one address);
  those import with `NULL` email, the covered-child shape. Every phone in the file parses
  under the 10/11-digit E.164 rule.
- **Directory flags: 5 do-not-list on primaries, 120 on sub-members** (MW's additional-contact
  default) — sub-members overwhelmingly import as `hidden`.
- **`Position/relation` is messy free text** ("Spouse"/"Son" but also "Man of the House",
  "Extra daughter", one "Dog"). Ruled 2026-07-13: not stored as a column (audit-row provenance
  only; recoverable from the archive); the Dog row is refused (a pet, not a member).
- **Name capitalization needs ~15 fixes** (ALL-CAPS and all-lowercase entries). Ruled
  2026-07-13: MW names are canonical going forward, case-fixed only, and normalization
  (email/phone/name) applies on every write path, import and live alike.
- **The CANON accounting export (export-4, superseding the 5-row export-3)** spans Apr 2024 –
  Jul 2026: 239 Membership transactions covering ALL 148 accounts (real payment dates, 220
  Stripe/PayPal charge ids), 157 Event rows across 14 class events in three seasons, 5
  donations, 9 refunds, 14 voided items, 75 zero-total comped seats (all discount-coded).
  Membership `Items` bundle asset add-ons into one charge, so membership money reads from
  `Membership Sub-Total`; 4 historical `Youth membership` rows predate the current 3-tier
  vocabulary. Full history imports (Geoff's call): per-season membership rows, minted
  historical class rows, and enrollments for all 14 events.
- **Per-event attendee lists (14 files, 2026-07-13, ALL 14 class events covered)** carry what
  accounting can't: the actual attendee names, signup answers (experience, instructor
  comments), and check-in flags, as buyer groups (`Primary=Y` row + per-attendee rows sharing
  the buyer's account id). Rosters are SUPERSETS of accounting (comped/manual registrations),
  so they are the enrollment source of truth; accounting supplies the money.
- **`Renewal Date` is the expiry, not the payment date** — confirmed by the transaction log
  (`Renewal Date After Transaction` = payment date + 1 year). The July 7 import's
  `paid_at`-equals-renewal-date approximation therefore reads every household current a year
  too long under the rolling standing derivation; the full import corrects stored `paid_at` to
  renewal minus one year.
- **The three ops-assets unmatched holders all exist in this export**: one as a sub-member with
  the exact ops email (matches automatically once sub-members land), two under a different
  email than ops held (resolved by an explicit ops-person → MW-account override map in
  `scripts/import/ops-assets.mjs`).

## The 2026-07-07 export (superseded; primaries only)

Source: `~/.local/asc-data/mw-export-2026-07-07.csv`. Basis of the first import run
(2026-07-07). The findings below described this file; deltas above supersede where they
conflict.

- **146 rows, all primary accounts.** `Parent Account ID` is empty throughout: household
  sub-members ("Additional Contacts" in MW's model) are NOT in this export. Consequence:
  the import seeds households + primary members + memberships; household members arrive
  either from a second MW export (Geoff's MW contact, with the accounting export) or
  through the portal's own household management, which the welcome page already instructs
  families to use. The 210-members figure vs 146 accounts is consistent with ~64
  sub-members living outside this file.
- **Tier flags: 68 Family, 65 Single, 13 Young adult; zero unflagged.** The columns are
  one-hot; the import derives one `tier` per account and refuses a row with two flags.
- **Billing method: 137 one-time, 8 recurring, 1 unassigned/manual.** The 8 auto-billed
  members lose their recurrence when MW retires; the cutover plan owes them a dedicated
  path (a flag on import, the renewal flow's normal path thereafter, and one courteous
  email explaining the change). No card data migrates, by design.
- **Contact fields: 146/146 emails, 146/146 phones; phone formats vary** (bare 11-digit,
  spaced, already-E.164). Confirms the E.164-normalize-on-import ruling (+1 default).
- **Directory: 5 `Do not list` flags** (plus per-field suppression columns). Import maps:
  do-not-list → hidden; any per-field suppression → partial; else visible.
- **Student columns (80 Intro, 18 Intermediate, 21 Youth)** are class-history marks at
  account level; import them as notes/history evidence only, never as enrollments.
- **Asset columns are vestigial (7 flags total vs ops's 36 asset-holders).** asc-ops
  remains the sole asset authority; the import ignores MW's asset columns.
- **Renewal dates cluster Mar-May** (57 Apr, 31 May, 28 Mar of 146), consistent with the
  season-boundary renewal rhythm the reminder cadence anchors to.
- Dropped whole per the lean-data ruling: all social columns, business-card and gallery
  URLs, profile description, autocorrect/IP columns, `Address (Full)` (the parts are
  kept at household level).
