-- asc-club migration 0012: the class-reminder set's own per-enrollment tracking table, its five
-- email templates, and the refund-window-notice job's two settings (docs/2026-07-07-requirements-
-- adversarial-review.md's item 2, "We'll follow up by email with anything you need before class /
-- the weekend -- NO SENDER EXISTS", folded in as a mid-pass scope addition, Geoff 2026-07-08).
--
-- `class_reminders_sent` mirrors `renewal_reminders_sent`'s own shape (migration 0011_job_runner),
-- keyed one level finer: PER ENROLLMENT (`class_enrollments.id`, a participant's own seat) rather
-- than per household, since every touch here is about one person's own class, not a household-wide
-- renewal boundary. `enrollment_id REFERENCES class_enrollments(id)` already has a real target
-- (0001_substrate). Five touches share one CHECK vocabulary and one table, regardless of which code
-- path sends which: `welcome` fires synchronously from the enrollment action itself
-- (`enrollments.ts`'s `signUpForClass`, `offers.ts`'s `claimOffer`); `week_out`, `day_before`, and
-- `followup` are driven by `src/jobs/class-reminders.ts` off `classes.start_date`/`end_date`;
-- `refund_window_notice` is driven by `src/jobs/class-refund-window-notice.ts` off the same
-- `start_date` and the two settings rows this migration also seeds.
CREATE TABLE class_reminders_sent (
  enrollment_id TEXT NOT NULL REFERENCES class_enrollments(id),
  touch TEXT NOT NULL CHECK (touch IN ('welcome', 'week_out', 'day_before', 'followup', 'refund_window_notice')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (enrollment_id, touch)
);

INSERT INTO settings (key, value, updated_by) VALUES
  ('refund_window_days', '14', 'system'),
  ('refund_notice_lead_days', '3', 'system');

INSERT INTO email_templates (id, subject, reply_to, body, updated_by) VALUES
('class_welcome', 'You''re enrolled -- {{item_display_name}}', 'program-committee@aksailingclub.org',
'Hi {{person_name}},

Welcome aboard -- you''re enrolled in **{{item_display_name}}**!

**What to bring:** appropriate outdoor layers, closed-toe shoes, and a water bottle. We''ll follow up with any class-specific gear closer to the start date.

{{youth_note}}

Questions? Reply to this email or contact {{committee_email}}.

---
Alaska Sailing Club
aksailingclub.org', 'authored:job-runner'),

('class_week_out', 'One week out -- {{item_display_name}}', 'program-committee@aksailingclub.org',
'Hi {{person_name}},

**{{item_display_name}}** starts in about a week, on {{start_date}}.

We''ll send final logistics (meeting spot, weather line) the day before. In the meantime, reply to this email with any questions.

---
Alaska Sailing Club
aksailingclub.org', 'authored:job-runner'),

('class_day_before', 'Tomorrow -- {{item_display_name}}', 'program-committee@aksailingclub.org',
'Hi {{person_name}},

**{{item_display_name}}** starts tomorrow, {{start_date}}, at {{location}}.

Check for a weather or cancellation notice the morning of; otherwise we''ll see you there.

---
Alaska Sailing Club
aksailingclub.org', 'authored:job-runner'),

('class_followup', 'Thanks for sailing with us -- {{item_display_name}}', 'program-committee@aksailingclub.org',
'Hi {{person_name}},

Thanks for taking **{{item_display_name}}** with us! Any boat checkouts earned in class are now on file.

Ready for more? Check the classes page for what''s next, or reply to this email with questions.

---
Alaska Sailing Club
aksailingclub.org', 'authored:job-runner'),

('class_refund_window', 'Your refund window is closing -- {{item_display_name}}', 'program-committee@aksailingclub.org',
'Hi {{person_name}},

Just a heads up: the refund/voucher window for **{{item_display_name}}** closes on {{cutoff_date}}. Cancel by then for a refund, or convert to a voucher good for next year.

After that date the fee is no longer refundable. To withdraw, visit {{withdraw_url}}.

Questions? Reply to this email or contact {{committee_email}}.

---
Alaska Sailing Club
aksailingclub.org', 'authored:job-runner');

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.seed', 'settings', NULL, '0012_class_reminders: refund_window_days=14, refund_notice_lead_days=3'),
  ('system', 'migration.seed', 'email_template', NULL,
   '0012_class_reminders: seeded class_welcome, class_week_out, class_day_before, class_followup, class_refund_window');
