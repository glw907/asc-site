-- asc-club migration 0011: the renewal-reminder job's own tracking table, plus the
-- `renewal_reminder` email template it sends (docs/2026-07-07-requirements-adversarial-review.md's
-- "structural gap: nothing can act on time" -- the job runner pass).
--
-- `renewal_reminders_sent` is keyed by `(household_id, touch)`: the four-touch cadence
-- (`src/jobs/renewal-reminders.ts`'s own `TOUCH_ORDER`, 30 days before / 7 days before / the day
-- of / 30 days after a household's rolling renewal boundary) marks each touch exactly once so a
-- daily cron tick never double-fires a reminder a prior tick already sent. `household_id
-- REFERENCES households(id)` already has a real target: `households` landed in migration
-- 0005_member_domain, well ahead of this one.
--
-- `renewal_reminder` is authored fresh, not ported: `ops-email-templates.README.md`'s own template
-- inventory carries no renewal-cadence send (ops never automated one), so there is nothing to
-- import. It reads one `{{message}}` variable the job precomputes per touch rather than branching
-- inside the template text itself, the same "no conditional syntax" convention every ported
-- template already follows (that README's own "Nothing to adapt" section).
--
-- NUMBERED 0011 IN THIS WORKTREE ONLY: the `member-portal` worktree independently claims 0011
-- twice over (`0011_asset_requests`, `0011_member_portal`), unmerged as of this migration's own
-- authoring. Expect a merge-time renumbering the same way migration 0010's own header already
-- documents for an earlier collision; this migration adds no table any other worktree's own 0011
-- also touches, so the renumbering is a rename, not a conflict to resolve.
CREATE TABLE renewal_reminders_sent (
  household_id TEXT NOT NULL REFERENCES households(id),
  touch TEXT NOT NULL CHECK (touch IN ('30_before', '7_before', 'day_of', '30_after')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, touch)
);

INSERT INTO email_templates (id, subject, reply_to, body, updated_by) VALUES (
  'renewal_reminder',
  'Your Alaska Sailing Club membership',
  'membership-committee@aksailingclub.org',
  'Hi {{person_name}},

{{message}}

Renew or check your household''s standing any time: {{portal_url}}

Questions? Reply to this email or contact {{committee_email}}.

---
Alaska Sailing Club
aksailingclub.org',
  'authored:job-runner'
);

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.seed', 'email_template', 'renewal_reminder', '0011_job_runner: authored, no ops equivalent');
