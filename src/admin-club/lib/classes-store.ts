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
// `class_instructors` assigns by email (see migration 0002_instructor_display_name's own header
// for why `member_id` holds the email rather than a real `members.id`, which does not exist
// until 2.2): this module's `ClassInstructor` type names that column `email`, not `memberId`, so
// the admin screen never has to re-explain the pre-2.2 workaround at its own call sites.
import type { D1Database } from '@cloudflare/workers-types';

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

/** One `classes` row, camelCased for the admin screens. */
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
  visible: boolean;
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
 *  this one's season in place). */
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
  visible: boolean;
}

/** One instructor assigned to a class: `email` is `class_instructors.member_id` (see this
 *  module's own header for why), `name` is the nullable `member_name` the assignment form
 *  collects alongside it. */
export interface ClassInstructor {
  email: string;
  name: string | null;
}

/** One `class_enrollments` row, read-only this pass (Task 8's public forms are the only write
 *  path, a later task): the roster section's own rows. */
export interface EnrollmentRow {
  id: string;
  memberId: string;
  enrolledAt: string;
  feePaid: boolean;
  guardianContact: string | null;
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
  visible: 0 | 1;
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
    visible: row.visible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `id, season, name, slug, track, capacity, fee, start_date, end_date,
  location, description, instructor_notes, visible, created_at, updated_at`;

const ORDER_BY = 'ORDER BY start_date IS NULL, start_date ASC, name ASC';

/** Every class, soonest first (an unscheduled class sorts last, matching `listEvents`' own
 *  ordering). */
export async function listClasses(db: D1Database): Promise<ClassRow[]> {
  const { results } = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM classes ${ORDER_BY}`).all<ClassRawRow>();
  return results.map(toClassRow);
}

/** Every class with its derived counts, one query: the triage list's own need, so the list
 *  screen never issues a per-row count query. */
export async function listClassesWithCounts(db: D1Database): Promise<ClassWithCounts[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS},
         (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = classes.id) AS enrolled_count,
         (SELECT COUNT(*) FROM class_waitlist w WHERE w.class_id = classes.id) AS waitlist_count
       FROM classes ${ORDER_BY}`,
    )
    .all<ClassRawRow & { enrolled_count: number; waitlist_count: number }>();
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

/** Insert a new class row. `id` is the caller's chosen stable identifier: the create action
 *  derives it from the submitted slug, the same `id = slug` convention `events-store.ts`'s
 *  `createEvent` already uses. `season` is read by the caller from `getCurrentSeason`
 *  (club-settings.ts) at creation time, never derived here. */
export async function createClass(db: D1Database, id: string, season: number, write: ClassWrite): Promise<void> {
  await db
    .prepare(
      `INSERT INTO classes (id, season, name, slug, track, capacity, fee, start_date, end_date,
        location, description, instructor_notes, visible)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
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
      write.visible ? 1 : 0,
    )
    .run();
}

/** Update an existing class's editable columns; `id` and `season` never change. */
export async function updateClass(db: D1Database, id: string, write: ClassWrite): Promise<void> {
  await db
    .prepare(
      `UPDATE classes SET name = ?1, slug = ?2, track = ?3, capacity = ?4, fee = ?5, start_date = ?6,
        end_date = ?7, location = ?8, description = ?9, instructor_notes = ?10, visible = ?11,
        updated_at = datetime('now')
       WHERE id = ?12`,
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
      write.visible ? 1 : 0,
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
 *  happen once the assignment form always collects one, sorts last by email instead). */
export async function listInstructors(db: D1Database, classId: string): Promise<ClassInstructor[]> {
  const { results } = await db
    .prepare(
      `SELECT member_id AS email, member_name AS name FROM class_instructors
       WHERE class_id = ?1 ORDER BY member_name IS NULL, member_name ASC, email ASC`,
    )
    .bind(classId)
    .all<{ email: string; name: string | null }>();
  return results;
}

/** Assign an instructor by email, with a display name. Re-assigning an email already on the
 *  class updates its stored name rather than erroring (the primary key is `(class_id,
 *  member_id)`, so a repeat email is a name correction, not a duplicate). */
export async function addInstructor(db: D1Database, classId: string, email: string, name: string | null): Promise<void> {
  await db
    .prepare(
      `INSERT INTO class_instructors (class_id, member_id, member_name) VALUES (?1, ?2, ?3)
       ON CONFLICT (class_id, member_id) DO UPDATE SET member_name = excluded.member_name`,
    )
    .bind(classId, email, name)
    .run();
}

/** Remove one instructor's assignment from a class; the row for any other email or any other
 *  class is untouched. */
export async function removeInstructor(db: D1Database, classId: string, email: string): Promise<void> {
  await db.prepare('DELETE FROM class_instructors WHERE class_id = ?1 AND member_id = ?2').bind(classId, email).run();
}

/** The class's enrolled roster, oldest enrollment first, read-only this pass (Task 8's public
 *  signup form is the only write path, a later task). */
export async function listEnrollments(db: D1Database, classId: string): Promise<EnrollmentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, member_id, enrolled_at, fee_paid, guardian_contact FROM class_enrollments
       WHERE class_id = ?1 ORDER BY enrolled_at ASC`,
    )
    .bind(classId)
    .all<{ id: string; member_id: string; enrolled_at: string; fee_paid: 0 | 1; guardian_contact: string | null }>();
  return results.map((row) => ({
    id: row.id,
    memberId: row.member_id,
    enrolledAt: row.enrolled_at,
    feePaid: row.fee_paid === 1,
    guardianContact: row.guardian_contact,
  }));
}
