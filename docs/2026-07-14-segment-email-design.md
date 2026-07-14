# Segment email (Initiative 4) — design

Status: approved by Geoff 2026-07-14 (brainstorm in-session; all four recommended forks
accepted). Scope ruling 2026-07-13: announce stays; add segment targeting and
compose-without-a-post on the email-templates/log substrate. Segments, not a campaign
product.

## What ships

One new admin screen, **Compose** (`/admin/club/email/compose`, linked from the Email
admin navigation), that sends a one-off email to a picked segment without a post.
Announce (`/admin/club/announce`) is untouched.

## Segments

Segments resolve live at compose time and are never stored. A new
`src/admin-club/lib/segments.ts` owns resolution as pure, unit-testable query functions.
Announce's `currentMemberEmails` refactors to call the same current-segment function so
the two screens cannot drift.

- **Current members**: households whose standing is `current` or `grace` per
  `src/member-auth/lib/standing.ts` (the same window that gates the rest of the site).
  Recipients are all non-archived members with emails in those households, deduplicated
  case-insensitively (announce's existing semantics).
- **Lapsed members**: households whose last non-refunded paid membership is beyond the
  grace window. Never-paid households (`none` standing) are excluded; lapsed means "was
  a member, isn't now."
- **Class roster**: a class picker (current-season classes first; older seasons listed
  with their year). Recipients are the enrollment roster's resolved contacts via the
  existing guardian-aware `resolveClassContact`, deduplicated.
- **Instructors**: everyone in `class_instructors` for current-season classes,
  deduplicated.

## Compose form

Subject plus markdown body, using the same minimal-markdown textarea and rendering path
the email templates use (`club-email.ts`: escape, `**bold**`, `---`, paragraphs). A
click-to-insert variable palette offers exactly three variables: `{{person_name}}`,
`{{portal_url}}`, `{{committee_email}}`. A live preview pane renders with sample data
through the same code path used at send time.

Variable resolution at send time is per recipient: `person_name` from the member row the
email resolved through, `portal_url` and `committee_email` as the existing template
sends resolve them. When a deduplicated shared email maps to more than one member, the
household primary's name wins; otherwise the first member encountered.

## Safety flow (the count-confirm + test-send gate)

1. **Compose → Review.** The review step shows the exact resolved recipient count, the
   segment description, a sample of resolved recipients, and the rendered email.
2. **Send test to me.** One email to the signed-in editor only, rendered with real
   variable substitution (the editor's own name where resolvable, sample values
   otherwise). Logged to `email_log` with `segment = 'blast-test'`; no blast row.
3. **Send.** Requires an explicit confirmation that acknowledges the count ("Send to N
   recipients"). No hard cap on deliberate admin sends. Delivery reuses announce's
   50-per-API-call chunking, factored into a shared bulk-send helper both screens use.

Rationale: the 2026-07-14 blast incident was a runaway cron, already guarded at the job
runner. The admin path's failure mode is a fat-finger; the gate that was missing is a
human seeing the number before mail goes out.

## Record keeping

Migration **0025**: new `email_blasts` table —

```sql
CREATE TABLE email_blasts (
  id TEXT PRIMARY KEY,
  segment_key TEXT NOT NULL,        -- 'current' | 'lapsed' | 'class:<id>' | 'instructors'
  segment_label TEXT NOT NULL,      -- human description at send time
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  sent_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Each per-recipient send logs to `email_log` with `segment = 'blast:<id>'`. The Compose
screen's landing view lists past blasts (segment, subject, counts, actor, date) — the
audit surface the blast incident made the case for. The migration is scratch-proven
(forward, rollback, verify) before applying to the live `asc-club`.

## Error handling

Per-recipient failures are counted, never fatal (announce's model). The blast row
records sent and failed counts honestly; a blast with failures shows them in the history
list. `sendClubEmail` already never throws and logs failures to `email_log`.

## Testing

Unit tests for every segment-resolution function against seeded local D1: standing
boundaries (current/grace/lapsed edges), refunded rows, archived members, never-paid
households, dedup across shared emails; plus variable rendering and blast recording.
No new e2e (admin e2e still lacks an editor-login helper — known debt); the visual gate
is the conductor's render read plus Geoff's dev walkthrough.

## Out of scope

No drafts or scheduling, no Discord on compose, no changes to announce's UI, no
open/click tracking, no per-member ad-hoc recipient lists. Announce could adopt the
segment picker later; nothing here blocks that.
