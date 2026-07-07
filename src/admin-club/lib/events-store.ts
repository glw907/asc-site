// The Events screen's typed reads/writes against asc-club's own `events` table (Task 5): the
// events admin moves off the read-only EVENTS_DB scaffold (docs/club-admin-scaffold.md, now
// stale on this point) onto the site's own domain store, the same two-database strategy Task 1's
// migration and Task 2's import already set up. This module is a thin data-access layer only:
// validation lives in the route's own form-parsing helper (event-form-input.ts), and the audit
// emit stays in the action layer (adminAction's ctx.audit), never here, matching Task 4's
// club-settings.ts split. There is deliberately no `updatedBy`/editor-email parameter on the
// write functions: unlike `settings.updated_by`, the ratified `events` table (migrations/asc-club/
// 0001_substrate/forward.sql) carries no per-row attribution column, so there is nowhere for one
// to go; the acting editor's identity lives only in the audit record the action layer emits.
import type { D1Database } from '@cloudflare/workers-types';

/** The `events.category` CHECK constraint's exact vocabulary (forward.sql), owned here since
 *  every consumer (the list's chip, the detail form's select) reads the same five values. */
export const EVENT_CATEGORIES = ['racing', 'class', 'operations', 'social', 'governance'] as const;

/** One allowed `events.category` value. */
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** The display label for each category, so the list chip and the detail select share one
 *  vocabulary rather than each spelling it out. */
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  racing: 'Racing',
  class: 'Class',
  operations: 'Operations',
  social: 'Social',
  governance: 'Governance',
};

/** One `events` row, camelCased for the admin screens. Hero/thumbnail image fields are read
 *  here but never written by `createEvent`/`updateEvent`: the media-library picker reuse seam
 *  (design suite Part B) is not wired for a custom `/admin/club` screen this pass, so the detail
 *  form renders whatever image reference the ops import carried, read-only. */
export interface EventRow {
  id: string;
  title: string;
  slug: string;
  category: EventCategory;
  shortDescription: string | null;
  longDescription: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string | null;
  heroImage: string | null;
  heroImageAlt: string | null;
  thumbnailImage: string | null;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The create/edit form's payload: every column a Club screen may write. Excludes the hero and
 *  thumbnail image columns (read-only this pass, see `EventRow`'s own comment) and the audit
 *  columns (`created_at`/`updated_at`, store-owned). */
export interface EventWrite {
  title: string;
  slug: string;
  category: EventCategory;
  shortDescription: string | null;
  longDescription: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string | null;
  visible: boolean;
}

/** The raw shape a `SELECT` off `events` returns, before `toEventRow` camelCases it. */
interface EventRawRow {
  id: string;
  title: string;
  slug: string;
  category: string;
  short_description: string | null;
  long_description: string | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  hero_image: string | null;
  hero_image_alt: string | null;
  thumbnail_image: string | null;
  visible: 0 | 1;
  created_at: string;
  updated_at: string;
}

function toEventRow(row: EventRawRow): EventRow {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    category: row.category as EventCategory,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    endTime: row.end_time,
    location: row.location,
    heroImage: row.hero_image,
    heroImageAlt: row.hero_image_alt,
    thumbnailImage: row.thumbnail_image,
    visible: row.visible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `id, title, slug, category, short_description, long_description, start_date,
  start_time, end_date, end_time, location, hero_image, hero_image_alt, thumbnail_image, visible,
  created_at, updated_at`;

/** Every event, soonest first; an unscheduled event (a null `start_date`) sorts last, matching
 *  the ops-scaffold list's own ordering (see the retired `events/+page.server.ts` comment this
 *  replaces). */
export async function listEvents(db: D1Database): Promise<EventRow[]> {
  const { results } = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM events ORDER BY start_date IS NULL, start_date ASC`)
    .all<EventRawRow>();
  return results.map(toEventRow);
}

/** One event by id, or `null` if no such row (a stale link or a bad id, never thrown). */
export async function getEvent(db: D1Database, id: string): Promise<EventRow | null> {
  const row = await db.prepare(`SELECT ${SELECT_COLUMNS} FROM events WHERE id = ?1`).bind(id).first<EventRawRow>();
  return row ? toEventRow(row) : null;
}

/** Insert a new event row. `id` is the caller's chosen stable identifier: the create action
 *  derives it from the submitted slug, the same `id = slug` convention the ops-import script
 *  (`scripts/import/ops-events.mjs`) already uses, so an event's id and its original slug agree
 *  at creation even though `slug` may be edited independently afterward. */
export async function createEvent(db: D1Database, id: string, write: EventWrite): Promise<void> {
  await db
    .prepare(
      `INSERT INTO events (id, title, slug, category, short_description, long_description,
        start_date, start_time, end_date, end_time, location, visible)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      id,
      write.title,
      write.slug,
      write.category,
      write.shortDescription,
      write.longDescription,
      write.startDate,
      write.startTime,
      write.endDate,
      write.endTime,
      write.location,
      write.visible ? 1 : 0,
    )
    .run();
}

/** Update an existing event's editable columns; `id` never changes (see `createEvent`'s own
 *  comment on why `slug` can drift from it). */
export async function updateEvent(db: D1Database, id: string, write: EventWrite): Promise<void> {
  await db
    .prepare(
      `UPDATE events SET title = ?1, slug = ?2, category = ?3, short_description = ?4,
        long_description = ?5, start_date = ?6, start_time = ?7, end_date = ?8, end_time = ?9,
        location = ?10, visible = ?11, updated_at = datetime('now')
       WHERE id = ?12`,
    )
    .bind(
      write.title,
      write.slug,
      write.category,
      write.shortDescription,
      write.longDescription,
      write.startDate,
      write.startTime,
      write.endDate,
      write.endTime,
      write.location,
      write.visible ? 1 : 0,
      id,
    )
    .run();
}

/** Delete an event by id. The route gates this behind the detail screen's own confirm dialog
 *  (the mockups' build-tier refinement: no per-row trash on the list), never a bare click. */
export async function deleteEvent(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM events WHERE id = ?1').bind(id).run();
}
