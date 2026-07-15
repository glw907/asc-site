# Segment email (Initiative 4) — implementation plan

> Executes `docs/2026-07-14-segment-email-design.md` (the approved spec; read it first —
> it is the contract). Execution: a Workflow of Sonnet implementer tasks, serial, each
> gated by the conductor's diff review, then the Opus review-lens fan-out. Tasks specify
> outcomes and acceptance criteria, never code; the implementer chooses the code.

**Goal:** the `/admin/club/email/compose` screen — segment-targeted one-off member
email (current, lapsed, class roster, instructors) with the count-confirm + test-send
safety gate and an `email_blasts` audit record. Announce is untouched.

**Architecture:** three serial tasks. (1) The data layer: migration 0025 and the pure
segment-resolution library, with announce's `currentMemberEmails` refactored onto it.
(2) The send layer: a shared bulk-send helper factored out of announce, blast recording,
test sends. (3) The screen: compose → review → send, history list, nav link.

## Global constraints

- Gate for every task: `npm run check` 0 errors / 0 warnings, `npm test` green,
  `npm run build` green. The implementer runs all three before reporting done.
- TDD: failing test first for every behavior with a testable seam.
- Comments/docs follow `ts-conventions` and `svelte-conventions` (TSDoc; `@component`).
- Announce's UI and behavior are unchanged (its current-members recipient set must
  resolve identically before and after the refactor — prove with a test).
- `EVENTS_DB` is read-only and untouched. All new tables live in `asc-club` (CLUB_DB).
- The email from-address, rendering pipeline, and `sendClubEmail` contract are reused,
  not modified (extend only if a task says so).
- No new e2e (admin e2e lacks an editor login helper). No drafts, scheduling, Discord,
  or tracking — see the spec's out-of-scope list.

---

### Task 1: Migration 0025 + the segments library

**Files:**
- Create: `migrations/0025_email_blasts.sql`
- Create: `src/admin-club/lib/segments.ts`
- Create: `src/admin-club/lib/segments.test.ts` (follow the existing seeded-local-D1
  unit-test harness used by the standing/announcements tests)
- Modify: `src/admin-club/lib/announcements.ts` (`currentMemberEmails`, ~lines 185-214)

**Outcome:** the `email_blasts` table exists exactly as the spec's DDL defines it, and
`segments.ts` exports pure resolution functions:

- `type SegmentKey` covering `'current' | 'lapsed' | 'instructors' | 'class:<id>'`.
- `resolveSegment(db, key)` → `{ key, label, recipients }` where each recipient is
  `{ email, personName, memberId }`, deduplicated case-insensitively by email. Unknown
  key → a thrown error, never a silent empty segment.
- `listSegmentOptions(db)` → the picker's option list: the two membership segments,
  instructors, and one `class:<id>` entry per class that has enrollments
  (current-season classes first, older seasons labeled with their year).

**Semantics (from the spec, binding):** current = household standing `current` or
`grace` via `standing.ts`'s window (reuse `renewalExpiryFrom`/the grace-days setting;
do not re-derive the math); lapsed = last non-refunded paid membership beyond grace,
never-paid households excluded; class roster = enrollment contacts via the existing
guardian-aware `resolveClassContact`; instructors = `class_instructors` for
current-season classes. Non-archived members with emails only. Shared-email name rule:
household primary wins, else first member encountered.

**Refactor:** `currentMemberEmails` becomes a thin call through
`resolveSegment('current')`. A test pins that its result set is unchanged against a
seed containing: a current household, a grace household, a lapsed household, a
refunded-only household, a never-paid household, an archived member, and two members
sharing one email.

**Acceptance:** unit tests cover every segment at its standing boundaries plus the
dedup and name rules above; migration applies and rolls back cleanly against local D1
(`wrangler d1 migrations apply --local`); full gate green.

### Task 2: The bulk-send helper and blast recording

**Files:**
- Create: `src/admin-club/lib/bulk-email.ts`
- Create: `src/admin-club/lib/bulk-email.test.ts`
- Modify: `src/admin-club/lib/announcements.ts` (`sendAnnouncementEmails`, ~lines
  263-281, and `RECIPIENT_CHUNK_SIZE`)

**Interfaces (later tasks rely on these):**
- `sendSegmentBlast(env, db, { segment, subject, body, actor })` →
  `{ blastId, sentCount, failedCount }`. Takes a `ResolvedSegment` from Task 1.
- `sendBlastTest(env, db, { recipient, subject, body })` → `{ ok, error? }`. One send
  to the given editor address.
- `listBlasts(db, limit)` → the history rows for the landing view.

**Outcome:** the 50-per-call chunked delivery loop moves out of announce into a shared
helper; announce calls the shared helper and its behavior is unchanged (existing
announce tests keep passing untouched, or with mechanical import updates only).
`sendSegmentBlast` writes one `email_blasts` row (counts honest: recipient_count from
the resolved segment, sent/failed from actual outcomes) and logs each per-recipient
send to `email_log` with `segment = 'blast:<id>'`. Per-recipient variable substitution
renders `{{person_name}}` from the recipient, `{{portal_url}}` and
`{{committee_email}}` exactly as the renewal-reminders job resolves them (read
`src/jobs/renewal-reminders.ts` for the pattern) — reuse `club-email.ts`'s existing
rendering functions; export them if they are currently module-private, do not duplicate
them. Test sends log with `segment = 'blast-test'` and write no blast row.
Per-recipient failures never abort the run.

**Acceptance:** tests cover blast recording (counts, log rows, `blast:<id>` linkage),
per-recipient variable rendering incl. the shared-email name rule, failure counting
(a send that reports `ok: false` increments failed_count and the run continues), and
the test-send path; announce's suite green; full gate green.

### Task 3: The Compose screen

**Files:**
- Create: `src/routes/admin/club/email/compose/+page.server.ts`
- Create: `src/routes/admin/club/email/compose/+page.svelte`
- Modify: the Email admin nav/landing (`src/routes/admin/club/email/…`) to link Compose
- Test: server-action unit coverage per the repo's existing route-test pattern (where
  announce's actions are tested); pure helpers extracted where that makes them testable

**Outcome:** the flow the spec defines, using Task 1/2's interfaces verbatim:

- **Landing:** the blast history list (`listBlasts`) — segment label, subject, counts
  (failures visible), actor, date — plus the "New email" entry point.
- **Compose step:** segment picker from `listSegmentOptions`; subject; markdown body
  textarea; click-to-insert palette with exactly `{{person_name}}`, `{{portal_url}}`,
  `{{committee_email}}`; live preview through the same rendering path used at send
  time (sample data).
- **Review step:** exact resolved recipient count, segment description, a sample of
  resolved recipients, the rendered email. "Send test to me" emails only the signed-in
  editor via `sendBlastTest`. The send button requires explicit count-acknowledging
  confirmation ("Send to N recipients") and calls `sendSegmentBlast`.
- Segment resolution happens server-side at review time; the send action re-resolves
  (never trusts a count or recipient list from the client). Access control matches the
  other `/admin/club` screens' role gating exactly.
- Styling: the existing admin screens' composition (DaisyUI classes already in the
  compiled set — note from initiative 3: `stats` is NOT compiled; check before using
  any new component class).

**Acceptance:** action tests cover the re-resolution rule (a stale client count never
leaks into the send), the confirm requirement, test-send targeting only the session
editor, and role gating; full gate green; screenshots of the three steps captured for
the conductor's render read (landing, compose with preview, review) at desktop + 390px.

---

## After the tasks (conductor-owned settle)

Review-lens fan-out (web-auth-security-reviewer, svelte-reviewer,
cloudflare-workers-reviewer — Opus pins) → fix round(s) → code-simplifier →
conductor render read of the three steps → migration 0025 scratch-proven then applied
LIVE to asc-club → full gate → merge to main → manual wrangler deploy to dev →
STATUS/memory/ROADMAP updates. Geoff's walkthrough of the screen rides his existing
dev-walkthrough queue (the initiative-3 screens + this one).
