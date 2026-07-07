-- asc-club migration 0012: `email_templates` gains `default_subject`/`default_body`, so
-- reset-to-default (the Email edit screen's own feature, pass 2.3) is a real DB-backed
-- operation, not a guess at what a template originally said.
--
-- Every row this database carries today came from `scripts/import/ops-email-templates.mjs`
-- (11 templates ported from asc-ops verbatim, plus the hand-authored `class_offer`) or a sibling
-- pass's own seed; none has ever been edited through a real admin screen, since the Email
-- section shipped read-only in pass 2.2 and this migration's own pass is what adds the first
-- write path. That makes each row's CURRENT `subject`/`body` the shipped default, exactly, so
-- backfilling `default_subject`/`default_body` from the current columns (below) is a documented
-- fact, not an approximation the way migration 0008's `method = 'card'` backfill had to reason
-- about which rows qualified.
--
-- `NOT NULL DEFAULT ''` (a constant, the only kind SQLite's `ADD COLUMN` accepts) rather than a
-- nullable column: the store layer (`email-templates-store.ts`) treats an empty
-- `default_subject`/`default_body` as "no default recorded" and refuses to reset against it
-- (fails closed rather than silently blanking a template), the same defensive posture as trusting
-- a `NOT NULL` guarantee elsewhere in this schema. A future template row inserted with no explicit
-- default (a hand-written `INSERT` that forgets the two new columns) lands in that same
-- fail-closed state rather than a live footgun.
--
-- The backfill's own `WHERE` guards re-run idempotency: a second run only touches a row whose
-- default is still unset, so it can never overwrite a default this migration (or a real reset)
-- already established.
--
-- Numbered 0012: 0011 is already claimed by two concurrent worktrees for unrelated tables
-- (`job-runner`'s `0011_job_runner`, `member-portal`'s `0011_member_portal`), the same collision
-- migration 0010's own header already worked around once; both are expected to renumber at merge
-- time, and this migration leaves 0011 to that resolution rather than colliding a third time.
ALTER TABLE email_templates ADD COLUMN default_subject TEXT NOT NULL DEFAULT '';
ALTER TABLE email_templates ADD COLUMN default_body TEXT NOT NULL DEFAULT '';

UPDATE email_templates SET default_subject = subject, default_body = body
  WHERE default_subject = '' AND default_body = '';

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.seed', 'email_template', NULL,
   '0012_template_defaults: default_subject/default_body backfilled from each row''s current subject/body');
