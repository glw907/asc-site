-- asc-club migration 0015: the renewal-reminder job's own tracking table, plus the
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
-- RENUMBERED FROM 0011 TO 0015 AT MERGE TIME: this migration was authored as 0011 alongside
-- `member-portal`'s own concurrent `0011_member_portal` claim, the same collision migration
-- 0010's own header documents for an earlier three-way instance. `0011_member_portal` merged to
-- main first (`portal-capstone`) and kept the number; this migration merged second
-- (`job-runner`) and renumbers here, a pure rename since it adds no table any other worktree's
-- own 0011 also touches.
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
  ('system', 'migration.seed', 'email_template', 'renewal_reminder', '0015_job_runner: authored, no ops equivalent');
