# asc-club migration 0012: the class-reminder set and the refund-window-notice job

## What this does

Creates `class_reminders_sent` (`enrollment_id`, `touch`, `sent_at`; primary key
`(enrollment_id, touch)`), seeds two `settings` rows (`refund_window_days` = 14,
`refund_notice_lead_days` = 3), and seeds five `email_templates` rows: `class_welcome`,
`class_week_out`, `class_day_before`, `class_followup`, `class_refund_window`.

## Why

Folded in mid-pass (Geoff, 2026-07-08) alongside the job runner: the site's own published
copy promises "we'll follow up by email with anything you need before class" with no
sender built (the requirements review's item 2), and the education page's refund policy
had no reminder of its own approaching deadline. Five touches, one shared tracking table
so a future admin screen can read "has this participant received every touch" off one
place regardless of which code path sent which:

- `welcome` -- fires synchronously from an enrollment action itself (`enrollments.ts`'s
  `signUpForClass`, `offers.ts`'s `claimOffer`), never a cron job.
- `week_out`, `day_before`, `followup` -- driven by `src/jobs/class-reminders.ts` off a
  class's own `start_date`/`end_date`.
- `refund_window_notice` -- driven by `src/jobs/class-refund-window-notice.ts`, warning a
  PAID enrollee (`class_enrollments.fee_paid = 1`) `refund_notice_lead_days` days before
  the refund cutoff (`start_date` minus `refund_window_days`).

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0012_class_reminders/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0012_class_reminders/verify.sql)"
```

Expect the `class_reminders_sent` table's own `CREATE TABLE` text, the two settings rows,
and five template rows.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0012_class_reminders/rollback.sql
```

Safe only before either job (or the welcome touch) has run for real; see `rollback.sql`'s
own header.
