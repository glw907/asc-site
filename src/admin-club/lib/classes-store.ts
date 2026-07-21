// The Classes screen's typed reads/writes against asc-club's own `classes` (plus
// `class_instructors`, `class_enrollments`, `class_waitlist`) tables (Task 6): the same two-
// database strategy Task 1's migration and Task 2's import already set up for events
// (events-store.ts), extended here for the fullness-and-instructor-assignment domain. This
// module is a thin data-access layer only: validation lives in the route's own form-parsing
// helper (class-form-input.ts), and the audit emit stays in the action layer (clubAdminAction's
// ctx.audit), never here.
//
// Fullness is deliberately never a stored column: `classes.capacity` is a plain editable number,
// and every read here derives `enrolledCount`/`isFull` from a live `COUNT(*)` over
// `class_enrollments`. The ratified `class_enrollments` schema carries no per-row status column
// (unlike, say, an enrollment-vs-cancelled state machine elsewhere might), so every row for a
// class counts toward its cap; there is nothing to filter.
//
// `class_instructors` assigns by email: the assignment form only ever collects an email and a
// display name, never a member id directly. `0002_instructor_display_name`'s interim workaround
// (reusing `member_id` to hold the email itself, since `members` did not exist yet) is retired by
// migration 0005_member_domain's arrival (see that migration's own README for the full story);
// `addInstructor`/`removeInstructor` below now resolve a real `members.id` through `ensureMember`
// (`people.ts`) before writing or matching `member_id`. This module's `ClassInstructor` type still
// names its email field `email`, not `memberId`: the admin screen never has to know a real id
// exists underneath, since every read here joins back to `members` for the address to show.
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { ensureMember } from './people';
import { buildTransactionStatements, type TransactionSource } from './ledger';

/** The `classes.track` CHECK constraint's exact vocabulary (forward.sql). */
export const CLASS_TRACKS = ['adult-teen', 'youth'] as const;

/** One allowed `classes.track` value. */
export type ClassTrack = (typeof CLASS_TRACKS)[number];

/** The display label for each track, so the list chip and the detail select share one
 *  vocabulary rather than each spelling it out. */
export const CLASS_TRACK_LABEL: Record<ClassTrack, string> = {
  'adult-teen': 'Adult/Teen',
  youth: 'Youth',
};

/** One `classes` row, camelCased for the admin screens. Hero image fields are read here but
 *  never written by `createClass`/`updateClass`: the media-library picker reuse seam (design
 *  suite Part B) is not wired for a custom `/admin/club` screen this pass, the same reasoning
 *  `events-store.ts`'s own `EventRow` documents, so the detail form renders whatever image
 *  reference migration 0003's backfill carried, read-only. */
export interface ClassRow {
  id: string;
  season: number;
  name: string;
  slug: string;
  track: ClassTrack;
  capacity: number;
  fee: number;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  description: string | null;
  instructorNotes: string | null;
  /** A short, member-facing aside this one class wants surfaced in its own reminder email
   *  (migration 0013): "bring your own PFD", "meet at the north dock this week". The reminder
   *  templates interpolate it as `{{class_note}}`; that send is a later pass's own consumer
   *  (the job runner), so this column exists here purely as an editable field. `null` (the
   *  common case) sends no override. */
  customNote: string | null;
  heroImage: string | null;
  heroImageAlt: string | null;
  visible: boolean;
  /** A drop-in offering takes no registration at all (migration 0018): the public schedule
   *  shows "Just show up!" instead of a Register link. */
  dropIn: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A `ClassRow` plus the two counts fullness derives from: never stored, always read live. */
export interface ClassWithCounts extends ClassRow {
  enrolledCount: number;
  waitlistCount: number;
  /** `enrolledCount >= capacity`, the whole of "fullness": no separate flag anywhere. */
  isFull: boolean;
}

/** The create/edit form's payload: every column a Club screen may write. `season` is not here:
 *  it is assigned once at creation from `settings.current_season` (see `createClass`), never
 *  edited afterward (a season's rollover, a later pass, creates a new row rather than mutating
 *  this one's season in place). Excludes the hero image columns (read-only this pass, see
 *  `ClassRow`'s own comment). */
export interface ClassWrite {
  name: string;
  slug: string;
  track: ClassTrack;
  capacity: number;
  fee: number;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  description: string | null;
  instructorNotes: string | null;
  customNote: string | null;
  visible: boolean;
  dropIn: boolean;
}

/** One instructor assigned to a class: `email` is read off the real `members` row `member_id`
 *  now resolves to (a join, not the column's own stored value; see this module's own header),
 *  `name` is the nullable `member_name` display cache the assignment form collects alongside it. */
export interface ClassInstructor {
  email: string;
  name: string | null;
}

/** One `class_enrollments` row, joined to `members` for the roster's own display need (the
 *  Classes pass Task 4 detail rebuild: "a real named roster with ages"). Writes still route
 *  elsewhere (Task 8's public forms create the row; this task's own `buildClassPayment` only
 *  flips `feePaid`); this module's own header's "read-only" note now covers only the row's
 *  identity/enrollment columns, not `feePaid`. */
export interface EnrollmentRow {
  id: string;
  memberId: string;
  /** The enrolled member's own stored name, for the roster's display -- never re-derived from
   *  `memberId` by a caller, the same join-here-not-there convention `listRostersBySeason`'s own
   *  `ClassRosterMember` already established for the list screen. */
  memberName: string;
  /** Raw, never pre-computed into an age: the caller renders it through the toolkit's own
   *  `ageFromBirthdate`, matching `ClassRosterMember`'s own field. */
  birthdate: string | null;
  enrolledAt: string;
  feePaid: boolean;
  guardianContact: string | null;
  /** The enrollee's optional answer to "anything specific you'd like to learn?" (migration
   *  0019_enrollment_interests), `null` when they left it blank. */
  interests: string | null;
}

/** One `class_waitlist` row, camelCased. Exactly one of `memberId`/`applicantEmail` is set (the
 *  table's own `CHECK`): a public signup may not be a member yet. Read-only here; `offers.ts`
 *  owns every write (a new entry's own insert path is Task 8's public form, a later task). */
export interface WaitlistRow {
  id: string;
  classId: string;
  memberId: string | null;
  applicantName: string | null;
  applicantEmail: string | null;
  applicantPhone: string | null;
  position: number;
  requestedAt: string;
  notes: string | null;
}

/** The raw shape a `SELECT` off `classes` returns, before `toClassRow` camelCases it. */
interface ClassRawRow {
  id: string;
  season: number;
  name: string;
  slug: string;
  track: string;
  capacity: number;
  fee: number;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  description: string | null;
  instructor_notes: string | null;
  custom_note: string | null;
  hero_image: string | null;
  hero_image_alt: string | null;
  visible: 0 | 1;
  drop_in: 0 | 1;
  created_at: string;
  updated_at: string;
}

function toClassRow(row: ClassRawRow): ClassRow {
  return {
    id: row.id,
    season: row.season,
    name: row.name,
    slug: row.slug,
    track: row.track as ClassTrack,
    capacity: row.capacity,
    fee: row.fee,
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location,
    description: row.description,
    instructorNotes: row.instructor_notes,
    customNote: row.custom_note,
    heroImage: row.hero_image,
    heroImageAlt: row.hero_image_alt,
    visible: row.visible === 1,
    dropIn: row.drop_in === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `id, season, name, slug, track, capacity, fee, start_date, end_date,
  location, description, instructor_notes, custom_note, hero_image, hero_image_alt, visible,
  drop_in, created_at, updated_at`;

const ORDER_BY = 'ORDER BY start_date IS NULL, start_date ASC, name ASC';

/** Every class, soonest first (an unscheduled class sorts last, matching `listEvents`' own
 *  ordering). */
export async function listClasses(db: D1Database): Promise<ClassRow[]> {
  const { results } = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM classes ${ORDER_BY}`).all<ClassRawRow>();
  return results.map(toClassRow);
}

/** Every class with its derived counts, one query: the triage list's own need, so the list
 *  screen never issues a per-row count query. `season`, when given, scopes the read to one
 *  season (the list screen's own default-to-current-season, filter-for-history need); omitted,
 *  every season reads (the original contract, unchanged -- the Members screen's own class-filter
 *  options still read every class and scope in JS). */
export async function listClassesWithCounts(db: D1Database, season?: number): Promise<ClassWithCounts[]> {
  const seasonClause = season === undefined ? '' : ' WHERE classes.season = ?1';
  const stmt = db.prepare(
    `SELECT ${SELECT_COLUMNS},
       (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = classes.id) AS enrolled_count,
       (SELECT COUNT(*) FROM class_waitlist w WHERE w.class_id = classes.id) AS waitlist_count
     FROM classes${seasonClause} ${ORDER_BY}`,
  );
  const { results } = await (season === undefined ? stmt : stmt.bind(season)).all<
    ClassRawRow & { enrolled_count: number; waitlist_count: number }
  >();
  return results.map((row) => {
    const base = toClassRow(row);
    return {
      ...base,
      enrolledCount: row.enrolled_count,
      waitlistCount: row.waitlist_count,
      isFull: row.enrolled_count >= base.capacity,
    };
  });
}

/** Every season with at least one class, most recent first: the list screen's own season filter
 *  vocabulary (the current season is always offered even with zero classes yet, via the caller's
 *  own union with `getCurrentSeason` -- this function only ever reports what already exists). */
export async function listClassSeasons(db: D1Database): Promise<number[]> {
  const { results } = await db
    .prepare('SELECT DISTINCT season FROM classes ORDER BY season DESC')
    .all<{ season: number }>();
  return results.map((row) => row.season);
}

/** One roster member the list screen's expand panel renders: the same trio (name, birthdate,
 *  paid state) the detail page's `EnrollmentRow` carries, joined to `members` here since the list
 *  screen has no per-class follow-up read of its own. `birthdate` stays raw (never pre-computed
 *  into an age): the caller renders it through the toolkit's own `ageFromBirthdate`, the same
 *  convention the Members screen's panel already uses. */
export interface ClassRosterMember {
  enrollmentId: string;
  name: string;
  birthdate: string | null;
  feePaid: boolean;
}

/** Every enrolled roster member across every class in a season, one joined query for the whole
 *  season (never a per-class loop -- the list screen's own no-N+1 requirement), grouped by class
 *  id and ordered oldest-enrollment-first within each class, matching `listEnrollments`' own
 *  order. A class with no enrollments simply has no key in the returned map. */
export async function listRostersBySeason(db: D1Database, season: number): Promise<Map<string, ClassRosterMember[]>> {
  const { results } = await db
    .prepare(
      `SELECT e.class_id AS class_id, e.id AS id, m.name AS name, m.birthdate AS birthdate, e.fee_paid AS fee_paid
       FROM class_enrollments e
       JOIN classes c ON c.id = e.class_id
       JOIN members m ON m.id = e.member_id
       WHERE c.season = ?1
       ORDER BY e.class_id, e.enrolled_at ASC`,
    )
    .bind(season)
    .all<{ class_id: string; id: string; name: string; birthdate: string | null; fee_paid: 0 | 1 }>();
  const rosters = new Map<string, ClassRosterMember[]>();
  for (const row of results) {
    const roster = rosters.get(row.class_id) ?? [];
    roster.push({ enrollmentId: row.id, name: row.name, birthdate: row.birthdate, feePaid: row.fee_paid === 1 });
    rosters.set(row.class_id, roster);
  }
  return rosters;
}

/** One class's waitlist, reduced to what the list screen's expand panel states in a single line:
 *  how many are queued, and who is next (a member's stored name, or an applicant's own name for a
 *  not-yet-a-member signup). The active-offer half of that line is a separate join the route's own
 *  load performs against `listOutstandingOffers`, not this function's concern (this module cannot
 *  import `offers.ts`, which itself imports this module -- see this file's own header). */
export interface ClassWaitlistSummary {
  count: number;
  nextName: string | null;
}

/** Every class's waitlist summary in a season, one joined query for the whole season (the same
 *  no-N+1 requirement `listRostersBySeason` documents), position order within each class so the
 *  first row seen per class is genuinely the head of the line. A class with an empty waitlist
 *  simply has no key in the returned map. */
export async function listWaitlistSummariesBySeason(db: D1Database, season: number): Promise<Map<string, ClassWaitlistSummary>> {
  const { results } = await db
    .prepare(
      `SELECT w.class_id AS class_id, w.id AS id, w.position AS position, w.applicant_name AS applicant_name,
         m.name AS member_name
       FROM class_waitlist w
       JOIN classes c ON c.id = w.class_id
       LEFT JOIN members m ON m.id = w.member_id
       WHERE c.season = ?1
       ORDER BY w.class_id, w.position ASC`,
    )
    .bind(season)
    .all<{ class_id: string; id: string; position: number; applicant_name: string | null; member_name: string | null }>();
  const summaries = new Map<string, ClassWaitlistSummary>();
  for (const row of results) {
    const existing = summaries.get(row.class_id);
    if (existing) {
      existing.count += 1;
    } else {
      summaries.set(row.class_id, { count: 1, nextName: row.member_name ?? row.applicant_name });
    }
  }
  return summaries;
}

/**
 * Whether the list screen's contextual "Offer next seat" action should show, and the exact guard
 * `offerNext`'s own server action enforces: a free seat (never full), a nonempty waitlist, and no
 * offer already live. The same three-way-AND shape `isPubliclyOpen` documents for the public
 * signup gate, deliberately a separate function (a different third gate: `hasActiveOffer` here
 * is the caller's own per-class read, `isPubliclyOpen`'s own third gate instead folds in the
 * waitlist-empty case as the OPEN condition, not the OFFER condition) -- one fix point either way,
 * never a screen re-deriving its own copy of the guard the action already enforces.
 */
export function canOfferNextSeat(cls: ClassWithCounts, hasActiveOffer: boolean): boolean {
  return !cls.isFull && cls.waitlistCount > 0 && !hasActiveOffer;
}

/** One class by id, or `null` if no such row. */
export async function getClass(db: D1Database, id: string): Promise<ClassRow | null> {
  const row = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM classes WHERE id = ?1`).bind(id).first<ClassRawRow>();
  return row ? toClassRow(row) : null;
}

/** One class by id, plus its derived counts, or `null` if no such row: the detail screen's own
 *  read. */
export async function getClassWithCounts(db: D1Database, id: string): Promise<ClassWithCounts | null> {
  const row = await getClass(db, id);
  if (!row) return null;
  const [enrolledCount, waitlistCount] = await Promise.all([countEnrolled(db, id), countWaitlist(db, id)]);
  return { ...row, enrolledCount, waitlistCount, isFull: enrolledCount >= row.capacity };
}

/** The live enrolled count for one class: every `class_enrollments` row for it, the schema
 *  carrying no status column to filter by (see this module's own header). */
export async function countEnrolled(db: D1Database, classId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM class_enrollments WHERE class_id = ?1').bind(classId).first<{ n: number }>();
  return row?.n ?? 0;
}

/** The live waitlist count for one class. */
export async function countWaitlist(db: D1Database, classId: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM class_waitlist WHERE class_id = ?1').bind(classId).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * The freed-spot rule (`docs/2026-07-07-member-portal-design.md`): a class is publicly open for a
 * fresh signup iff it is not full, its waitlist is empty, and no offer is currently outstanding —
 * never the naive `enrolled < capacity` alone. A freed spot with anyone still queued (a waitlist
 * entry or a live offer) stays closed to the public while the offer chain works the queue
 * privately; only a drop that empties the queue re-opens it. `hasActiveOffer` is the caller's own
 * read (`offers.ts`'s `hasActiveOfferForClass`), kept as a plain argument here so this stays a
 * pure function every consumer (the public signup route, the portal, the events listing SQL) can
 * reason about without each re-deriving the same three-way AND.
 */
export function isPubliclyOpen(cls: ClassWithCounts, hasActiveOffer: boolean): boolean {
  return !cls.isFull && cls.waitlistCount === 0 && !hasActiveOffer;
}

/** Insert a new class row. `id` is the caller's chosen stable identifier: the create action
 *  derives it from the submitted slug, the same `id = slug` convention `events-store.ts`'s
 *  `createEvent` already uses. `season` is read by the caller from `getCurrentSeason`
 *  (club-settings.ts) at creation time, never derived here. */
export async function createClass(db: D1Database, id: string, season: number, write: ClassWrite): Promise<void> {
  await db
    .prepare(
      `INSERT INTO classes (id, season, name, slug, track, capacity, fee, start_date, end_date,
        location, description, instructor_notes, custom_note, visible, drop_in)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
    )
    .bind(
      id,
      season,
      write.name,
      write.slug,
      write.track,
      write.capacity,
      write.fee,
      write.startDate,
      write.endDate,
      write.location,
      write.description,
      write.instructorNotes,
      write.customNote,
      write.visible ? 1 : 0,
      write.dropIn ? 1 : 0,
    )
    .run();
}

/** Update an existing class's editable columns; `id` and `season` never change. */
export async function updateClass(db: D1Database, id: string, write: ClassWrite): Promise<void> {
  await db
    .prepare(
      `UPDATE classes SET name = ?1, slug = ?2, track = ?3, capacity = ?4, fee = ?5, start_date = ?6,
        end_date = ?7, location = ?8, description = ?9, instructor_notes = ?10, custom_note = ?11,
        visible = ?12, drop_in = ?13, updated_at = datetime('now')
       WHERE id = ?14`,
    )
    .bind(
      write.name,
      write.slug,
      write.track,
      write.capacity,
      write.fee,
      write.startDate,
      write.endDate,
      write.location,
      write.description,
      write.instructorNotes,
      write.customNote,
      write.visible ? 1 : 0,
      write.dropIn ? 1 : 0,
      id,
    )
    .run();
}

/** Delete a class by id. The route gates this behind the detail screen's own confirm dialog,
 *  the same recipe `events-store.ts`'s `deleteEvent` documents. */
export async function deleteClass(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM classes WHERE id = ?1').bind(id).run();
}

/** Every instructor assigned to a class, alphabetical by name (an unnamed row, which should not
 *  happen once the assignment form always collects one, sorts last by email instead). Joins
 *  `members` for the real email `class_instructors.member_id` now resolves to (this module's own
 *  header): the column itself stopped holding the email directly once migration 0005_member_domain
 *  retired 0002_instructor_display_name's interim workaround. */
export async function listInstructors(db: D1Database, classId: string): Promise<ClassInstructor[]> {
  const { results } = await db
    .prepare(
      `SELECT m.email AS email, ci.member_name AS name FROM class_instructors ci
       JOIN members m ON m.id = ci.member_id
       WHERE ci.class_id = ?1 ORDER BY ci.member_name IS NULL, ci.member_name ASC, m.email ASC`,
    )
    .bind(classId)
    .all<{ email: string; name: string | null }>();
  return results;
}

/** Assign an instructor by email, with a display name: resolves (or creates) a real `members.id`
 *  through `ensureMember` first, then writes it as `class_instructors.member_id` (this module's own
 *  header). A missing display name falls back to the email itself for `ensureMember`'s own
 *  required `name` (only relevant the first time this email is ever seen; an existing member's
 *  stored name is untouched either way, `ensureMember`'s own contract). Re-assigning an email
 *  already on the class updates its stored `member_name` rather than erroring (the primary key is
 *  `(class_id, member_id)`, so a repeat email is a name correction, not a duplicate). */
export async function addInstructor(db: D1Database, classId: string, email: string, name: string | null): Promise<void> {
  const member = await ensureMember(db, { name: name ?? email, email });
  await db
    .prepare(
      `INSERT INTO class_instructors (class_id, member_id, member_name) VALUES (?1, ?2, ?3)
       ON CONFLICT (class_id, member_id) DO UPDATE SET member_name = excluded.member_name`,
    )
    .bind(classId, member.memberId, name)
    .run();
}

/** Remove one instructor's assignment from a class by email; the row for any other email or any
 *  other class is untouched. Resolves `member_id` from `email` in the same statement (a subquery
 *  against `members`, this module's own header) rather than calling `ensureMember`: unassigning
 *  someone who was never a member at all is simply a no-op delete, not a reason to create one. */
export async function removeInstructor(db: D1Database, classId: string, email: string): Promise<void> {
  await db
    .prepare('DELETE FROM class_instructors WHERE class_id = ?1 AND member_id = (SELECT id FROM members WHERE email = ?2)')
    .bind(classId, email)
    .run();
}

/** The class's enrolled roster, oldest enrollment first, joined to `members` for the name and
 *  birthdate the detail screen's roster table renders (Task 4). */
export async function listEnrollments(db: D1Database, classId: string): Promise<EnrollmentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT e.id AS id, e.member_id AS member_id, m.name AS member_name, m.birthdate AS birthdate,
         e.enrolled_at AS enrolled_at, e.fee_paid AS fee_paid, e.guardian_contact AS guardian_contact,
         e.interests AS interests
       FROM class_enrollments e JOIN members m ON m.id = e.member_id
       WHERE e.class_id = ?1 ORDER BY e.enrolled_at ASC`,
    )
    .bind(classId)
    .all<{
      id: string;
      member_id: string;
      member_name: string;
      birthdate: string | null;
      enrolled_at: string;
      fee_paid: 0 | 1;
      guardian_contact: string | null;
      interests: string | null;
    }>();
  return results.map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    birthdate: row.birthdate,
    enrolledAt: row.enrolled_at,
    feePaid: row.fee_paid === 1,
    guardianContact: row.guardian_contact,
    interests: row.interests,
  }));
}

/** Sources a manual, no-checkout class-fee payment can carry: the same trio `manual-payment.ts`'s
 *  own `ManualPaymentSource` names for membership dues (Stripe/PayPal payments arrive through
 *  their own reconciler, not this path). */
export type ClassPaymentSource = Extract<TransactionSource, 'check' | 'cash' | 'comp'>;

export type ClassPaymentResult =
  | { ok: true; statements: D1PreparedStatement[]; amountCents: number }
  | { ok: false; error: string };

/**
 * Build the enrollment's `fee_paid` flip plus the ledger `charge` transaction for the class's own
 * fee, as unrun statements for one `db.batch()` -- the same build-only shape `manual-payment.ts`'s
 * own `buildManualMembershipPayment` established, so the route action owns the one atomic write
 * and its own audit call. The amount is always the class's current `fee`, never an admin-typed
 * figure: a manual recording is rare but real (design doc's own "Manual payments" section), not a
 * promoted flow with its own amount-entry surface. Refuses an unknown enrollment or one already
 * marked paid, rather than double-charging it.
 */
export async function buildClassPayment(
  db: D1Database,
  input: { enrollmentId: string; source: ClassPaymentSource; memo?: string | null },
): Promise<ClassPaymentResult> {
  const row = await db
    .prepare(
      `SELECT e.fee_paid AS fee_paid, c.fee AS fee, c.name AS class_name, m.household_id AS household_id
       FROM class_enrollments e JOIN classes c ON c.id = e.class_id JOIN members m ON m.id = e.member_id
       WHERE e.id = ?1`,
    )
    .bind(input.enrollmentId)
    .first<{ fee_paid: 0 | 1; fee: number; class_name: string; household_id: string }>();
  if (!row) return { ok: false, error: 'No such enrollment.' };
  if (row.fee_paid === 1) return { ok: false, error: 'This enrollment is already paid.' };

  const amountCents = Math.round(row.fee * 100);
  const { statements: ledgerStatements } = buildTransactionStatements(
    db,
    {
      kind: 'charge',
      source: input.source,
      // The same UTC-shaped-string construction `offers.ts`'s own `toSqliteDatetime` performs
      // (member-portal/lib/classes.ts's own `now` variables use the identical inline form): this
      // module cannot import `offers.ts`, which itself imports this module (see this file's own
      // header), so the one-liner is inlined here rather than creating a circular import for it.
      occurredAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      amountTotalCents: amountCents,
      householdId: row.household_id,
      memo: input.memo ?? null,
    },
    [{ item: 'class-fee', description: `${row.class_name} fee`, amountCents, enrollmentId: input.enrollmentId }],
  );
  return {
    ok: true,
    statements: [db.prepare('UPDATE class_enrollments SET fee_paid = 1 WHERE id = ?1').bind(input.enrollmentId), ...ledgerStatements],
    amountCents,
  };
}

/** The class's waitlist, position order: the offer machine's own read of who is next in line,
 *  and the detail screen's per-entry state (Task 7). */
export async function listWaitlist(db: D1Database, classId: string): Promise<WaitlistRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, class_id, member_id, applicant_name, applicant_email, applicant_phone, position,
        requested_at, notes
       FROM class_waitlist WHERE class_id = ?1 ORDER BY position ASC`,
    )
    .bind(classId)
    .all<{
      id: string;
      class_id: string;
      member_id: string | null;
      applicant_name: string | null;
      applicant_email: string | null;
      applicant_phone: string | null;
      position: number;
      requested_at: string;
      notes: string | null;
    }>();
  return results.map((row) => ({
    id: row.id,
    classId: row.class_id,
    memberId: row.member_id,
    applicantName: row.applicant_name,
    applicantEmail: row.applicant_email,
    applicantPhone: row.applicant_phone,
    position: row.position,
    requestedAt: row.requested_at,
    notes: row.notes,
  }));
}

/**
 * Every queued waitlist member's own display name, keyed by `memberId`: a small side query
 * scoped to the caller's own `memberIds` (never more than one class's own waitlist worth of
 * rows), so the detail screen's own "member vs applicant" distinction (Task 4) needs no
 * structural change to `listWaitlist`'s shared `WaitlistRow` shape -- that read serves the
 * cross-class waitlist overview, the offer machine, the public claim flow, and the reminder job
 * as well, so widening its own `SELECT` would ripple far past this one screen's own display need.
 * Returns an empty map for an empty input rather than issuing a query with no rows to bind.
 */
export async function getWaitlistMemberNames(db: D1Database, memberIds: string[]): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map();
  const placeholders = memberIds.map((_, index) => `?${index + 1}`).join(', ');
  const { results } = await db
    .prepare(`SELECT id, name FROM members WHERE id IN (${placeholders})`)
    .bind(...memberIds)
    .all<{ id: string; name: string }>();
  return new Map(results.map((row) => [row.id, row.name]));
}
