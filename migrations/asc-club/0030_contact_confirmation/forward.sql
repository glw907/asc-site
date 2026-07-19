-- asc-club migration 0030: the contact-confirmation record (member-waivers T4,
-- docs/2026-07-17-member-waivers-design.md "The Mat-Su Borough flow-down" and "Signing
-- experience"). The signing moment for a mooring or dry-storage holder ends with a
-- glance-and-confirm of the member's contact info, because the Borough flow-down's 72-hour
-- relocation clock is only survivable if the club can reach the member. That confirmation is a
-- record in its own right: the club needs to prove, per season, that the member affirmed their
-- contact info was current at signing time, independent of any later profile edit.
--
-- One additive table, the same shape 0027_directory_domain used for its own new domain tables (a
-- child table referencing `members`/`households`, no recreate-and-copy needed since nothing
-- pre-existing changes). The row snapshots the confirmed values (email, phone, and the full
-- mailing address) so the record stands on its own even if the member later changes their
-- profile, the same self-contained-record principle 0029's `content_snapshot`/`auth_*` columns
-- follow for the signature itself.
--
-- `context` reuses 0029's own widened five-value vocabulary (join / renewal / mooring-fee /
-- storage-fee / class-signup), so a confirmation names the same money moment its sibling
-- signatures were signed at. `season` scopes the confirmation to the year it covers, matching the
-- annual re-sign cadence. `member_id` is the confirming member (the household's responsible adult
-- for the asset); `household_id` is denormalized alongside it so the admin rollup (T6) can group
-- confirmations by household without a join back through `members`.
CREATE TABLE contact_confirmations (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  season INTEGER NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('class-signup', 'join', 'renewal', 'mooring-fee', 'storage-fee')),
  email TEXT,                      -- the confirmed contact values, snapshotted at confirmation time
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  confirmed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contact_confirmations_member ON contact_confirmations(member_id);
CREATE INDEX idx_contact_confirmations_household ON contact_confirmations(household_id);
