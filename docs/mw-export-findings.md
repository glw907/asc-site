# The MW export's shape (aggregates only; the file itself stays out of git)

Source: Geoff's MembershipWorks export, 2026-07-07, stashed machine-local at
`~/.local/asc-data/mw-export-2026-07-07.csv` (member PII; never commit it). This note keeps
the structural findings the 2.2 import and portal design depend on.

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
