// The education page's class schedule: the pure status derivation behind the `class-schedule`
// island (ClassSchedule.svelte, read through class-schedule.remote.ts). The lifecycle goes
// past events-data.ts's open/full/closed CASE because the schedule stays truthful year-round:
// a finished class says so, a drop-in clinic never grows a Register link, and before the
// club-wide registration-opens date (settings key `class_registration_opens`, migration 0018)
// a listed class is neither open nor full. Kept pure, with "today" passed in, so every state
// is unit-testable without a clock or a database.
import type { RegStatusKind } from './events-data';
import { formatDateRange } from './season-data';

/** One `classes` row plus its two live counts, as the remote query's SQL returns it. `queued`
 *  folds the waitlist count and live unresolved offers together: either one keeps a freed spot
 *  from reopening to the public (the same rule events-data.ts's CASE and the signup page's own
 *  load apply). */
export interface ScheduleClassRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  capacity: number;
  drop_in: 0 | 1;
  enrolled: number;
  queued: number;
}

/** One display-ready schedule row. Exactly one of `action`/`note` is set for rows that carry
 *  either: an action is a real link (Register, Join waitlist), a note is the action column's
 *  human line for a row with nothing to click (a drop-in clinic's "Just show up!"). */
export interface ScheduleEntry {
  id: string;
  name: string;
  dateDisplay: string;
  statusLabel: string;
  statusKind: RegStatusKind;
  action?: { href: string; label: string };
  note?: string;
}

export interface ClassSchedule {
  entries: ScheduleEntry[];
  /** True only when every listed class has dates and they have all passed: the component's cue
   *  for the season-wrapped line. */
  seasonComplete: boolean;
  /** True when the read succeeded but the season has no class rows yet (the window right after
   *  a year increment, before the new schedule is entered): the component's cue for the
   *  schedule-pending line rather than the error fallback. */
  pending: boolean;
  /** The season the entries belong to (settings `current_season`), for display. */
  season: string | null;
}

const DROP_IN_NOTE = 'Just show up!';

/** "Opens Mar 15", reusing the season spine's month-day formatting for a single date. */
function opensLabel(opensIso: string): string {
  return `Opens ${formatDateRange(opensIso, null)}`;
}

function deriveEntry(row: ScheduleClassRow, todayIso: string, opensIso: string): ScheduleEntry {
  const base = {
    id: row.id,
    name: row.name,
    dateDisplay: row.start_date ? formatDateRange(row.start_date, row.end_date) : 'Dates TBD',
  };
  const signupHref = `/classes/${row.id}/signup`;

  // ISO calendar dates compare correctly as strings, the same property the SQL side relies on.
  if (!row.start_date || !row.end_date) {
    return { ...base, statusLabel: 'Dates TBD', statusKind: 'muted' };
  }
  if (row.end_date < todayIso) {
    return { ...base, statusLabel: 'Completed', statusKind: 'muted' };
  }
  if (row.start_date <= todayIso) {
    return row.drop_in
      ? { ...base, statusLabel: 'Drop-in', statusKind: 'info', note: DROP_IN_NOTE }
      : { ...base, statusLabel: 'In session', statusKind: 'info' };
  }
  if (row.drop_in) {
    return { ...base, statusLabel: 'Drop-in', statusKind: 'info', note: DROP_IN_NOTE };
  }
  if (opensIso && todayIso < opensIso) {
    return { ...base, statusLabel: opensLabel(opensIso), statusKind: 'info' };
  }
  if (row.enrolled >= row.capacity || row.queued > 0) {
    return {
      ...base,
      statusLabel: 'Full',
      statusKind: 'warning',
      action: { href: signupHref, label: 'Join waitlist' },
    };
  }
  return {
    ...base,
    statusLabel: 'Open',
    statusKind: 'success',
    action: { href: signupHref, label: 'Register' },
  };
}

/** Derive the display-ready schedule. `todayIso` and `opensIso` are calendar dates in the
 *  club's own timezone (the remote query computes today in America/Anchorage, since a Worker's
 *  runtime clock is UTC); `opensIso` empty means no registration gate is configured. */
export function buildClassSchedule(
  rows: ScheduleClassRow[],
  todayIso: string,
  opensIso: string,
  season: string | null,
): ClassSchedule {
  const entries = rows.map((row) => deriveEntry(row, todayIso, opensIso));
  const seasonComplete =
    entries.length > 0 && rows.every((row) => row.end_date !== null && row.end_date < todayIso);
  return { entries, seasonComplete, pending: entries.length === 0, season };
}
