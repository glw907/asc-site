-- asc-club migration 0007: the asset and email domains (pass 2.4 and pass 2.3's own tables,
-- landed together, same early-arrival pattern 0005_member_domain set for the member core).
--
-- Lands six tables from the ratified DDL
-- (cairn-cms/docs/superpowers/specs/assets/phase-2-reference/asc-club-schema.sql), verbatim in
-- structure, no seed rows: `asset_types`, `asset_assignments`, `asset_payments`,
-- `asset_waitlist` (the "ASSETS (pass 2.4)" section) and `email_templates`, `email_log` (the
-- "EMAIL (pass 2.3)" section). Neither domain has any admin screen or write path yet (both are
-- later passes' own work); this migration only lands the structure, the same early-landing
-- rationale 0005's own README documents: nothing downstream needs these tables to exist yet, but
-- landing all four schema-only migrations (0001, 0005, 0007) together keeps the full ratified
-- DDL's structure in one place rather than splitting an already-designed schema across
-- unrelated future passes.
--
-- Per the FK-enforcement lesson 0004_waitlist_integrity and 0005_member_domain both document
-- (real, remote D1 refuses an insert outright with `no such table` when a `REFERENCES` target
-- does not exist, not just when a referenced row is missing): every `REFERENCES` target below
-- already exists before this migration runs. `asset_types` is created first in this same file,
-- so `asset_assignments.asset_type` and `asset_waitlist.asset_type` (both `REFERENCES
-- asset_types(id)`) always have a target. `asset_assignments.membership_id` (`REFERENCES
-- memberships(id)`) and `asset_waitlist.member_id` (`REFERENCES members(id)`) both target tables
-- 0005_member_domain already landed. `asset_payments.assignment_id` (`REFERENCES
-- asset_assignments(id)`) targets the table created immediately above it in this same file.
-- `email_log.template_id` carries no `REFERENCES` clause at all in the ratified DDL (an
-- audit-style send log that must survive a template being edited or deleted later, unlike the
-- other domains here): landed verbatim, no FK to check.

CREATE TABLE asset_types (
  id TEXT PRIMARY KEY,             -- mooring / rv-parking / boat-parking / small-boat-rack
  name TEXT NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Assets attach to MEMBERSHIPS, never members (Geoff, canon). The household edge travels
-- through the membership; the by-person view is a JOIN, not an edge.
CREATE TABLE asset_assignments (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL REFERENCES asset_types(id),
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  description TEXT,                -- "Buoy M-14"
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  -- per-season fee state lives in payments rows, NOT as a mutable flag (anti-ops):
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_asset_assignments_type ON asset_assignments(asset_type);
CREATE INDEX idx_asset_assignments_membership ON asset_assignments(membership_id);

CREATE TABLE asset_payments (      -- the ledger ops's dead payments table intended
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES asset_assignments(id),
  season INTEGER NOT NULL,
  amount INTEGER NOT NULL,         -- snapshot of the fee at billing
  stripe_ref TEXT,
  paid_at TEXT,                    -- NULL = requested/outstanding (the dashboard's
                                   -- "chase list" reads exactly this)
  UNIQUE (assignment_id, season)
);
CREATE INDEX idx_asset_payments_assignment ON asset_payments(assignment_id);

-- The asset waitlist NEVER resets (multi-year physical queues), unlike the seasonal class
-- waitlist (0001_substrate's own comment on `class_waitlist` names the contrast).
CREATE TABLE asset_waitlist (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL REFERENCES asset_types(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  position INTEGER NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);
CREATE INDEX idx_asset_waitlist_type ON asset_waitlist(asset_type);
CREATE INDEX idx_asset_waitlist_member ON asset_waitlist(member_id);

CREATE TABLE email_templates (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  reply_to TEXT,
  body TEXT NOT NULL,              -- markdown-with-variables, edited in cairn's editor
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL
);

CREATE TABLE email_log (           -- ops's convention, carried: per-recipient rows
  id TEXT PRIMARY KEY,
  template_id TEXT,
  segment TEXT,                    -- 'current' | 'lapsed' | 'class:<id>' | NULL (single)
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error_detail TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
