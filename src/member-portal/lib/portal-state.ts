// The portal landing's own state machine (portal redesign pass, T1): pure derivations for the
// landing's four first-class states and its value-mirror line
// (docs/2026-07-16-portal-redesign-design.md, "States" and "The value mirror"). Every function
// here is pure and injected-clock: it takes already-loaded data (`MemberStanding`, a distilled
// season/settings read, household/asset/credit rows) and never touches D1 itself, so a route's
// own `load` stays the only place a database binding is read. `today` is an injected parameter
// throughout (this repo's own offer-fixture lesson: a `now()`-relative render is never
// deterministic in a test or a visual baseline).
import type { MemberStanding, MemberStandingStatus } from '$member-auth/lib/standing';
import { parseMemberDate } from '$member-auth/lib/format';
import type { HouseholdMemberRow } from './household';
import type { HouseholdAssignmentRow } from './assets';

/** The one of four first-class landing states (design doc's own "States" section, all binding). */
export type PortalStateKind = 'renewal-window' | 'off-season' | 'in-season-needs-you' | 'in-season-clear';

/**
 * The masthead's fireweed renew action shows only in this state (the design doc's "the only
 * fireweed on the page, ever"). `standingStatus` is the grounding standing's own status, `null`
 * only for the no-session/no-household edge case (see {@link portalState}'s header), so the
 * template can still choose between "Renew for {season}" and lapsed-adjusted copy without
 * re-deriving it from a separately loaded `standing` object.
 */
export interface RenewalWindowState {
  kind: 'renewal-window';
  standingStatus: MemberStandingStatus | null;
}

/**
 * The all-clear moment plus the anticipation line (design doc: "Class registration opens in
 * mid-March..."). `classRegistrationOpens` carries `getClassRegistrationOpens`'s own raw
 * `'YYYY-MM-DD' | ''` contract unchanged; the template derives the "mid-March" wording and the
 * schedule-year link from it, never a formatted sentence produced here.
 */
export interface OffSeasonState {
  kind: 'off-season';
  classRegistrationOpens: string;
}

/** The working area's "Needs your attention" section carries at least one real row (unpaid fees,
 *  a waitlist offer); which rows those are is a separate, kind-independent derivation the caller
 *  already owns (see {@link portalState}'s header), so this state adds no fields of its own. */
export interface InSeasonNeedsYouState {
  kind: 'in-season-needs-you';
}

/** Nothing needs the member; the all-clear moment renders with its "what's next" pointer, whose
 *  own event/class data the caller already has loaded separately. */
export interface InSeasonClearState {
  kind: 'in-season-clear';
}

export type PortalState = RenewalWindowState | OffSeasonState | InSeasonNeedsYouState | InSeasonClearState;

/**
 * How close to a `'current'` standing's own `expiresOn` counts as already "in the renewal
 * window" (Geoff's conductor ruling, docs/2026-07-16-portal-redesign-design.md): the boundary
 * day itself counts, so a member who opens the portal on their exact expiry date already sees
 * the renewal masthead, not one day late.
 */
export const RENEWAL_WINDOW_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The whole-calendar-day difference from `from` to `to`, both read as UTC midnights (this
 *  repo's own date discipline, matching `$member-auth/lib/format.ts`'s UTC parsing): negative
 *  when `to` is before `from`. */
function daysBetweenUtcDates(from: Date, to: Date): number {
  const fromMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toMidnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toMidnight - fromMidnight) / MS_PER_DAY);
}

/** Rule 1's own `'current'` arm: whether `today` sits on or before `standing.expiresOn`, within
 *  {@link RENEWAL_WINDOW_DAYS} days (inclusive both ends). `false` for anything else, including a
 *  `'current'` standing with no `expiresOn` (the schema shape {@link MemberStanding} allows but
 *  {@link portalState}'s real callers never produce for a genuinely `'current'` household). */
function isWithinRenewalWindow(standing: MemberStanding, today: Date): boolean {
  if (standing.status !== 'current' || standing.expiresOn === null) return false;
  const daysUntilExpiry = daysBetweenUtcDates(today, parseMemberDate(standing.expiresOn));
  return daysUntilExpiry >= 0 && daysUntilExpiry <= RENEWAL_WINDOW_DAYS;
}

/** {@link portalState}'s own inputs, each already loaded by the caller (a route's `load`, per
 *  this module's header): nothing here reaches a database. */
export interface PortalStateArgs {
  /** The signed-in household's own standing (`getMemberStanding`'s result); `null` only when the
   *  session resolves to no known household, a state {@link getMemberStanding} otherwise already
   *  folds into its own `'lapsed'` for every other no-membership case. */
  standing: MemberStanding | null;
  /** Whether the season calendar (`loadSeasonMonths`) carries at least one event or class on or
   *  after `today`; a distilled boolean rather than the full `SeasonMonth[]` shape, since that
   *  shape carries display-formatted date ranges, not the raw dates this decision needs. */
  seasonHasLiveEvents: boolean;
  /** `getClassRegistrationOpens`'s own raw value, carried straight through to
   *  {@link OffSeasonState} for the anticipation line's template to read. */
  classRegistrationOpens: string;
  /** Whether the working area's "Needs your attention" section has at least one real row (unpaid
   *  fees, a waitlist offer) once expiring-standing rows are excluded, since rule 1 already
   *  covers those; the caller owns the row list itself (it renders independently of `kind`, per
   *  this module's own header), this is only the yes/no this state machine needs. */
  hasWeightedActionRows: boolean;
  /** The clock to evaluate against; defaults to `new Date()` so a caller need not thread it
   *  through for a live render, while a test pins it for a deterministic boundary check. */
  today?: Date;
}

/**
 * `getClassRegistrationOpens`'s raw value, with a date already in the past treated as unscheduled
 * (the `''` "isn't scheduled yet" reading `AllClearMoment` already has a branch for). Nothing in
 * the system clears `class_registration_opens` across a season rollover (`rollover.ts`'s own
 * header: "the ONLY thing a rollover does is advance `settings.current_season`"), so a value left
 * over from last season is the natural steady state once the season turns over, not an edge case
 * -- rendering it unmodified would state a date nine months in the past as an upcoming promise.
 * Plain ISO string comparison, matching this module's own UTC date discipline.
 */
function unstaleClassRegistrationOpens(classRegistrationOpens: string, today: Date): string {
  if (classRegistrationOpens === '') return classRegistrationOpens;
  const todayIso = today.toISOString().slice(0, 10);
  return classRegistrationOpens < todayIso ? '' : classRegistrationOpens;
}

/**
 * The landing's one first-class state, by the conductor's own binding precedence: a household in
 * `'grace'` or `'lapsed'` standing, a `'current'` one within {@link RENEWAL_WINDOW_DAYS} days of
 * expiry, or no resolvable standing at all reads `'renewal-window'` before anything else is even
 * considered. Otherwise, a season with no live events left reads `'off-season'`. Otherwise, a
 * real weighted action row reads `'in-season-needs-you'`; failing that, `'in-season-clear'`.
 */
export function portalState(args: PortalStateArgs): PortalState {
  const today = args.today ?? new Date();
  const { standing } = args;

  if (!standing || standing.status === 'grace' || standing.status === 'lapsed' || isWithinRenewalWindow(standing, today)) {
    return { kind: 'renewal-window', standingStatus: standing?.status ?? null };
  }
  if (!args.seasonHasLiveEvents) {
    return { kind: 'off-season', classRegistrationOpens: unstaleClassRegistrationOpens(args.classRegistrationOpens, today) };
  }
  if (args.hasWeightedActionRows) {
    return { kind: 'in-season-needs-you' };
  }
  return { kind: 'in-season-clear' };
}

/** `count`, plus `noun` singular or `plural` (default `${noun}s`), e.g. `pluralize(1, 'class
 *  credit')` reads "1 class credit", `pluralize(2, 'class credit')` reads "2 class credits". */
function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** {@link valueMirror}'s own inputs, each already loaded by the caller. */
export interface ValueMirrorArgs {
  /** The household's own members (`listHouseholdMembers`'s result); an archived member never
   *  counts toward the displayed household size. */
  householdMembers: HouseholdMemberRow[];
  /** The household's currently-held assets (`listHouseholdAssignments`'s result), one segment
   *  per held asset, in the order given. */
  assets: HouseholdAssignmentRow[];
  /** The household's available class-credit balance (`getCreditBalance`'s result). */
  creditBalance: number;
}

/**
 * The masthead's value-mirror line (design doc: "This season: mooring B-Dock 12 · 2 household
 * members · 1 class credit available"), as an ordered array of already-worded segments; the
 * template joins them with a middot and renders nothing at all when the array is empty. A
 * segment with nothing to say (no assets held, no active household members, zero credits) is
 * simply omitted rather than rendered empty.
 */
export function valueMirror(args: ValueMirrorArgs): string[] {
  const segments: string[] = [];

  // The asset segment names the TYPE only, deduplicated, never the assignment's `description`.
  //
  // The ratified spec and mock D both read "This season: mooring B-Dock 12", which assumed
  // `description` carries a slot identifier. It does not. Checked against all 40 live
  // assignments (2026-07-16): `description` is free text about the member's own boat or vehicle,
  // in inconsistent register, and no slot identifier exists anywhere in the column. Real values
  // include "Sailboat", "sailboat", "BUCC", "DINGY", and 'Purple Buccaneer 18 "Dionysus"'. Naive
  // concatenation therefore renders "Mooring Sailboat" and "Trailered Boat Parking BUCC" into a
  // line whose whole job is calm recognition.
  //
  // The type name alone carries the recognition the mirror is for ("you have a mooring this
  // season"); the two-line rail row is where `description` belongs, and it still shows there.
  // Type names keep their stored casing rather than being lowercased to fit mid-sentence: this
  // column holds "Long-Term RV Parking", and case-folding an acronym reads worse than a capital.
  const seenAssetTypes = new Set<string>();
  for (const asset of args.assets) {
    if (seenAssetTypes.has(asset.assetTypeName)) continue;
    seenAssetTypes.add(asset.assetTypeName);
    segments.push(asset.assetTypeName);
  }

  const activeMemberCount = args.householdMembers.filter((member) => member.archivedAt === null).length;
  if (activeMemberCount > 0) {
    segments.push(pluralize(activeMemberCount, 'household member'));
  }

  if (args.creditBalance > 0) {
    segments.push(`${pluralize(args.creditBalance, 'class credit')} available`);
  }

  return segments;
}
