# 0018_class_lifecycle

Adds the two lifecycle facts the education page's public class schedule derives its status
line from, neither of which any existing column or live count can supply:

- `classes.drop_in` (INTEGER 0/1, default 0): a drop-in offering takes no registration at
  all — Fleet Tune-Up Weekend on the live site reads "Drop-in / Just show up!". Stored as a
  fact rather than inferred from `fee = 0`, so a future free-but-rostered class can't
  misread as drop-in. The forward flags `fleet_tuneup`, the one existing drop-in row.
- `settings.class_registration_opens` (YYYY-MM-DD, seeded empty): the club opens class
  registration in mid-March each season. Before that date a listed class shows "opens
  later" rather than open/full. Empty means no gate is configured.

The status derivation itself lives in `src/theme/class-schedule-data.ts`; this migration
only stores the facts. Applied with the standard pattern (scratch-proven, then
`npx wrangler d1 execute asc-club --remote --file .../forward.sql`, then `verify.sql`).
