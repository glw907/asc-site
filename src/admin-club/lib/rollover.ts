// The season rollover (Geoff, 2026-07-07: "unusual but important"): the redesign of ops's own
// `startNewSeason`, which the design suite documents as five independent, non-atomic, unaudited
// statements including a bare no-WHERE `UPDATE classes` and a wholesale `DELETE` of both waitlist
// tables. This module's own rollover fixes every one of those defects, but its shape is narrower
// than ops's ever was, because membership is no longer season-bound (a household's standing rolls
// on its own `paid_at + 1 year`, per Geoff's 2026-07-07 ruling superseding the design suite's
// original season-boundary renewal model): the ONLY thing a rollover does is advance
// `settings.current_season` and record why.
//
// The ratified schema's own closing comment settles what "the class side" of a rollover means:
// "NOTHING is UPDATEd or DELETEd by the yearly increment except the current_season setting -- one
// atomic batch: the setting write + the audit row." A season's classes and their class_waitlist
// rows are never touched here: they simply stop being CURRENT the moment `classes.season` no
// longer matches `current_season` (a derived read, the exact "standing derives" pattern
// `memberships` already uses for a household) -- creation, not a wipe, is the whole redesign in
// one sentence. `getRolloverPreview`'s counts are therefore informational only (what falls out of
// currency), never a set of rows this module writes to. Next season's classes are ordinary,
// separate admin work through the existing Classes screen (`classes-store.ts`'s `createClass`
// already reads `getCurrentSeason` at creation time); this module creates none automatically.
//
// Asset waitlists and memberships are not read or written here at all: an asset queue is
// multi-year and continuous by design (never resets), and a membership's standing is rolling, not
// season-bound, so neither one has anything for a season boundary to mean.
import type { D1Database } from '@cloudflare/workers-types';
import { getCurrentSeason } from './club-settings';

/** Thrown when the typed confirmation does not read back exactly `currentSeason + 1`: the single
 *  gate that is simultaneously the type-to-confirm dialog AND the forward-only check (see this
 *  module's own header on why the design suite treats these as one requirement, not two -- the
 *  only string that can ever pass this check IS the one correct next year). */
export class SeasonMismatchError extends Error {
  constructor(public readonly expectedSeason: number) {
    super(`Type ${expectedSeason} exactly to confirm the rollover.`);
  }
}

/** What a rollover is about to change, computed live and never stored: the settings screen's own
 *  preview requirement (the design suite's point 6), read before the owner ever sees the confirm
 *  dialog. */
export interface RolloverPreview {
  currentSeason: number;
  nextSeason: number;
  /** Classes whose `season` still equals `currentSeason`: not touched by the rollover itself, but
   *  no longer "this season's" classes once it runs -- the count of what a volunteer now needs to
   *  set up fresh for `nextSeason` through the ordinary Classes screen. */
  classesFallingOutOfCurrency: number;
  /** `class_waitlist` rows attached (via `class_id`) to one of those classes: archived only in the
   *  sense that they stop being a CURRENT season's waitlist the same way, never deleted or
   *  mutated. */
  waitlistFallingOutOfCurrency: number;
}

/** Compute the rollover preview for whatever season is current right now. Exported separately
 *  from {@link runSeasonRollover} so the settings screen's own `load` can show it before an owner
 *  ever opens the confirm dialog, with no side effect of its own. */
export async function getRolloverPreview(db: D1Database): Promise<RolloverPreview> {
  const currentSeason = await getCurrentSeason(db);
  const [classesRow, waitlistRow] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM classes WHERE season = ?1').bind(currentSeason).first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM class_waitlist w
         JOIN classes c ON c.id = w.class_id
         WHERE c.season = ?1`,
      )
      .bind(currentSeason)
      .first<{ n: number }>(),
  ]);
  return {
    currentSeason,
    nextSeason: currentSeason + 1,
    classesFallingOutOfCurrency: classesRow?.n ?? 0,
    waitlistFallingOutOfCurrency: waitlistRow?.n ?? 0,
  };
}

/** {@link runSeasonRollover}'s success shape: the settings screen's own flash-message need. */
export interface RolloverResult {
  nextSeason: number;
  classesFallingOutOfCurrency: number;
  waitlistFallingOutOfCurrency: number;
}

/**
 * Advance the club's current season by exactly one year, atomically (design suite point 2): one
 * `db.batch()` carries both the `settings` write and its own `audit_log` row, so a rollover either
 * fully happened or did not, and a caller can never observe the setting changed with no audit
 * trail for it (ops's own bug, the design suite's whole reason for this rewrite).
 *
 * `typedYear` is the owner's own confirm-dialog input, required to read back exactly
 * `currentSeason + 1` (throws {@link SeasonMismatchError} otherwise) -- this single check is both
 * the type-to-confirm gate every destructive club action uses and the forward-only validation
 * (design suite point 3): there is no separate "arbitrary year" branch to guard against, because
 * the only string that can ever pass is the one correct next year.
 *
 * This function never touches `classes`, `class_waitlist`, `asset_waitlist`, or `memberships` (see
 * this module's own header for why); a caller wanting the preview counts for its own audit detail
 * or a confirmation message calls {@link getRolloverPreview} itself, before or after, since neither
 * table this function writes changes what that preview reads.
 */
export async function runSeasonRollover(
  db: D1Database,
  args: { typedYear: string; confirmedBy: string },
): Promise<RolloverResult> {
  const preview = await getRolloverPreview(db);
  const expected = preview.nextSeason;
  if (args.typedYear.trim() !== String(expected)) {
    throw new SeasonMismatchError(expected);
  }

  const detail =
    `season ${preview.currentSeason} -> ${expected}; ` +
    `${preview.classesFallingOutOfCurrency} classes and ${preview.waitlistFallingOutOfCurrency} waitlist ` +
    'entries fall out of currency (never deleted or mutated -- archived only by the season no longer matching)';

  await db.batch([
    db
      .prepare("UPDATE settings SET value = ?1, updated_at = datetime('now'), updated_by = ?2 WHERE key = 'current_season'")
      .bind(String(expected), args.confirmedBy),
    db
      .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(args.confirmedBy, 'season-rollover', 'season', String(expected), detail),
  ]);

  return {
    nextSeason: expected,
    classesFallingOutOfCurrency: preview.classesFallingOutOfCurrency,
    waitlistFallingOutOfCurrency: preview.waitlistFallingOutOfCurrency,
  };
}
