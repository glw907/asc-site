// The class-schedule island's read (see class-schedule-data.ts for the derivation and the
// reasoning). A query rather than a form, unlike the rest of the .remote.ts family: the island
// only reads. Degrades to an empty schedule on any D1 failure, the same safe failure
// season-data.ts's loadSeasonMonths uses; the component renders its events-page pointer then.
import { query, getRequestEvent } from '$app/server';
import { buildClassSchedule, type ClassSchedule, type ScheduleClassRow } from './class-schedule-data';

const EMPTY: ClassSchedule = { entries: [], seasonComplete: false, pending: false, season: null };

const ROWS_QUERY = `SELECT c.id, c.name, c.start_date, c.end_date, c.capacity, c.drop_in,
    (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.id) AS enrolled,
    (SELECT COUNT(*) FROM class_waitlist w WHERE w.class_id = c.id)
      + (SELECT COUNT(*) FROM class_offers o
         WHERE o.class_id = c.id AND o.resolved IS NULL AND o.expires_at > datetime('now')) AS queued
  FROM classes c
  WHERE c.visible = 1 AND c.season = ?1
  ORDER BY c.start_date IS NULL, c.start_date`;

/** Today as a calendar date in the club's timezone: a Worker's clock is UTC, and an Alaska
 *  evening is already tomorrow in UTC, which would flip a class to Completed nine hours early. */
function anchorageTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Anchorage' }).format(new Date());
}

export const getClassSchedule = query(async (): Promise<ClassSchedule> => {
  const db = getRequestEvent().platform?.env.CLUB_DB;
  if (!db) return EMPTY;
  try {
    const settings = await db
      .prepare("SELECT key, value FROM settings WHERE key IN ('current_season', 'class_registration_opens')")
      .all<{ key: string; value: string }>();
    const byKey = new Map(settings.results.map((r) => [r.key, r.value]));
    const season = byKey.get('current_season') ?? null;
    if (!season) return EMPTY;
    const rows = await db.prepare(ROWS_QUERY).bind(Number(season)).all<ScheduleClassRow>();
    return buildClassSchedule(rows.results, anchorageTodayIso(), byKey.get('class_registration_opens') ?? '', season);
  } catch {
    return EMPTY;
  }
});
