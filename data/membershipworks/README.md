# MembershipWorks exports (age-encrypted)

Source data for the member import (`scripts/import/mw-members.mjs`), committed encrypted so the
club's member history survives independent of any one machine. Every file is member PII: only
`*.csv.age` is ever committed (`.gitignore` refuses plaintext `*.csv` here), encrypted to the ASC
age key. Decrypt with the key at `~/.config/age/asc-key.txt` (held in 1Password, never in git):

```sh
age -d -i "$AGE_KEY_FILE" 2026-07-13-members.csv.age > /tmp/members.csv
```

| File | Contents |
|---|---|
| `2026-07-07-members.csv.age` | The first MW member export: 146 rows, primary accounts only (no household sub-members). Basis of the 2026-07-07 import run. |
| `2026-07-13-members.csv.age` | The complete member export: 286 rows — 148 primaries plus 138 household sub-members (`Parent Account ID` populated). |
| `2026-07-13-accounting.csv.age` | The CANON accounting export: 401 transactions, Apr 2024 – Jul 2026 — every membership payment (239 rows, all 148 accounts, real dates and Stripe charge ids), every class-seat purchase (157 rows across three seasons), donations, refunds, voids. Supersedes the discarded 5-row export-3. |
| `attendees/<season>-<class-slug>.csv.age` | Per-event attendee lists, all 14 class events 2024–2026: `Primary=Y` buyer rows followed by per-attendee rows with names, experience/comments answers, and Check In. Named by the class event they belong to (identified 2026-07-13 by ticket name, year, and buyer overlap against accounting). |

Structural findings (aggregates, no PII) live in `docs/mw-export-findings.md`. To add a new
export: stash the plaintext at `~/.local/asc-data/` (attendee lists under
`~/.local/asc-data/mw-attendees/` with the `<season>-<class-slug>.csv` name), then
`age -r "$(age-keygen -y ~/.config/age/asc-key.txt)" -o data/membershipworks/<name>.csv.age <plaintext>`.
