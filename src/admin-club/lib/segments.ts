// Segment resolution for the Compose screen (`/admin/club/email/compose`, segment-email,
// docs/2026-07-14-segment-email-design.md): pure query functions that answer "who does this
// segment reach right now", never stored. Announce's own `currentMemberEmails`
// (`announcements.ts`) is a thin caller of `resolveSegment('current')` so the two screens can
// never disagree about who counts as a current member.
//
// Every segment reuses this repo's own standing math (`$member-auth/lib/standing`'s
// `renewalExpiryFrom` plus `club-settings.ts`'s `getRenewalGraceDays`) rather than re-deriving
// current/grace/lapsed boundaries, and the guardian-aware class-contact resolver
// (`class-contact.ts`'s `resolveClassContact`) for a class roster, the same resolver every other
// class-related send already routes through.
import type { D1Database } from '@cloudflare/workers-types';
import { renewalExpiryFrom } from '$member-auth/lib/standing';
import { resolveClassContact } from './class-contact';
import { getClass, listEnrollments, type ClassRow } from './classes-store';
import { getCurrentSeason, getRenewalGraceDays } from './club-settings';

/** Every resolvable segment key: the two membership segments, instructors, or a specific class's
 *  enrollment roster (`class:<id>`, the class's own `classes.id`). */
export type SegmentKey = 'current' | 'lapsed' | 'instructors' | `class:${string}`;

/** One recipient a segment resolves to: `personName` is who `{{person_name}}` renders as at send
 *  time, `memberId` the `members.id` row that name and email came from (the household primary
 *  when a youth enrollment's contact is guardian-routed, see {@link resolveClassContact}). */
export interface SegmentRecipient {
  email: string;
  personName: string;
  memberId: string;
}

/** A segment resolved at compose/review/send time: `label` is the human-readable description the
 *  review step and the blast history show, `recipients` already deduplicated case-insensitively
 *  by email. */
export interface ResolvedSegment {
  key: SegmentKey;
  label: string;
  recipients: SegmentRecipient[];
}

/** One picker option for the Compose screen's segment `<select>`. */
export interface SegmentOption {
  key: SegmentKey;
  label: string;
}

interface RecipientCandidate {
  memberId: string;
  name: string;
  email: string;
  /** Whether this candidate is the household primary member: the shared-email tie-break rule
   *  ({@link dedupeRecipients}) prefers a primary's name over a non-primary's when two candidates
   *  collide on the same email. */
  isPrimary: boolean;
}

/**
 * Deduplicate recipient candidates case-insensitively by email, keeping the first-seen address's
 * exact casing. A later candidate marked `isPrimary` always displaces an earlier non-primary one
 * for the same email (the design's own "household primary wins, else first member encountered"
 * rule); among candidates that are never marked primary (instructors, a class roster), the first
 * one encountered simply wins, which is already correct there since `resolveClassContact` itself
 * resolves every enrollee sharing one guardian's inbox to that guardian's own name.
 */
function dedupeRecipients(candidates: readonly RecipientCandidate[]): SegmentRecipient[] {
  const byKey = new Map<string, RecipientCandidate>();
  for (const candidate of candidates) {
    const trimmedEmail = candidate.email.trim();
    if (!trimmedEmail) continue;
    const key = trimmedEmail.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...candidate, email: trimmedEmail });
    } else if (candidate.isPrimary && !existing.isPrimary) {
      byKey.set(key, { ...candidate, email: existing.email });
    }
  }
  return [...byKey.values()].map(({ memberId, name, email }) => ({ memberId, personName: name, email }));
}

interface HouseholdGroundingRow {
  household_id: string;
  paid_at: string;
  primary_member_id: string | null;
}

/** Every household's own grounding row: its most recently paid, non-refunded `memberships` row
 *  (the same join `currentMemberEmails` used before this refactor), plus the household's
 *  `primary_member_id` for the shared-email tie-break. A household that has never had a
 *  non-refunded paid row (never-paid, or refunded-only) simply has no row here. */
async function householdGrounding(db: D1Database): Promise<HouseholdGroundingRow[]> {
  const { results } = await db
    .prepare(
      `SELECT h.id AS household_id, gm.paid_at, h.primary_member_id
       FROM households h
       JOIN memberships gm ON gm.id = (
         SELECT id FROM memberships mm
         WHERE mm.household_id = h.id AND mm.paid_at IS NOT NULL AND mm.refunded_at IS NULL
         ORDER BY mm.paid_at DESC LIMIT 1
       )`,
    )
    .all<HouseholdGroundingRow>();
  return results;
}

interface MemberContactRow {
  id: string;
  name: string;
  email: string;
  household_id: string;
}

/** D1's own documented cap is 100 bound parameters per query; the live club already has 148
 *  households, so a single `IN (...)` over every current household's id can exceed it. Chunked
 *  well under the cap (90, not 100) to leave room for a future query in this same family that
 *  binds a parameter or two alongside the household ids. */
const HOUSEHOLD_QUERY_CHUNK_SIZE = 90;

/** Every non-archived, emailed member in one of `householdIds`, queried in chunks of at most
 *  {@link HOUSEHOLD_QUERY_CHUNK_SIZE} household ids so the bound-parameter count never approaches
 *  D1's cap. */
async function membersInHouseholds(db: D1Database, householdIds: readonly string[]): Promise<MemberContactRow[]> {
  if (householdIds.length === 0) return [];
  const members: MemberContactRow[] = [];
  for (let i = 0; i < householdIds.length; i += HOUSEHOLD_QUERY_CHUNK_SIZE) {
    const chunk = householdIds.slice(i, i + HOUSEHOLD_QUERY_CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const { results } = await db
      .prepare(
        `SELECT id, name, email, household_id FROM members WHERE archived_at IS NULL AND email IS NOT NULL AND household_id IN (${placeholders})`,
      )
      .bind(...chunk)
      .all<MemberContactRow>();
    members.push(...results);
  }
  return members;
}

/**
 * The two membership segments: `'current'` is every non-archived member's email in a household
 * whose standing is `'current'` or `'grace'` (the same rolling boundary
 * `$member-auth/lib/standing.ts` derives, reused via `renewalExpiryFrom` and
 * `getRenewalGraceDays` rather than re-derived); `'lapsed'` is every such household past its
 * grace window. A household that has never had a non-refunded paid row (never-paid, or
 * refunded-only) is excluded from both: "lapsed" means "was a member, isn't now", never "never
 * was one".
 */
async function resolveMembershipSegment(db: D1Database, key: 'current' | 'lapsed'): Promise<ResolvedSegment> {
  const [grounding, graceDays] = await Promise.all([householdGrounding(db), getRenewalGraceDays(db)]);
  const now = new Date();

  const primaryByHousehold = new Map<string, string | null>();
  const householdIds: string[] = [];
  for (const row of grounding) {
    primaryByHousehold.set(row.household_id, row.primary_member_id);
    const expiry = renewalExpiryFrom(row.paid_at);
    const graceEnd = new Date(expiry.getTime() + graceDays * 24 * 60 * 60 * 1000);
    const isCurrentOrGrace = now <= graceEnd;
    if (key === 'current' ? isCurrentOrGrace : !isCurrentOrGrace) householdIds.push(row.household_id);
  }

  const members = await membersInHouseholds(db, householdIds);
  const recipients = dedupeRecipients(
    members.map((member) => ({
      memberId: member.id,
      name: member.name,
      email: member.email,
      isPrimary: member.id === primaryByHousehold.get(member.household_id),
    })),
  );

  return { key, label: key === 'current' ? 'Current members' : 'Lapsed members', recipients };
}

/** Everyone in `class_instructors` for the club's current season, deduplicated. */
async function resolveInstructorsSegment(db: D1Database): Promise<ResolvedSegment> {
  const currentSeason = await getCurrentSeason(db);
  const { results } = await db
    .prepare(
      `SELECT m.id, m.name, m.email
       FROM class_instructors ci
       JOIN classes c ON c.id = ci.class_id
       JOIN members m ON m.id = ci.member_id
       WHERE c.season = ?1 AND m.archived_at IS NULL AND m.email IS NOT NULL`,
    )
    .bind(currentSeason)
    .all<{ id: string; name: string; email: string }>();

  const recipients = dedupeRecipients(
    results.map((row) => ({ memberId: row.id, name: row.name, email: row.email, isPrimary: false })),
  );
  return { key: 'instructors', label: 'Instructors', recipients };
}

/** A class option's display label: the bare name in the current season, `"name (season)"` for an
 *  older one, so the picker and a resolved segment's own description read identically. */
function classSegmentLabel(cls: Pick<ClassRow, 'name' | 'season'>, currentSeason: number): string {
  return cls.season === currentSeason ? cls.name : `${cls.name} (${cls.season})`;
}

/** One class's enrolled roster, resolved through the guardian-aware `resolveClassContact` (a
 *  youth enrollment routes to its household's primary, exactly as every other class-related send
 *  does). Throws when `classId` does not resolve to a real `classes` row: an unknown segment is
 *  never silently empty. */
async function resolveClassSegment(db: D1Database, key: `class:${string}`): Promise<ResolvedSegment> {
  const classId = key.slice('class:'.length);
  const cls = classId ? await getClass(db, classId) : null;
  if (!cls) throw new Error(`Unknown segment key: ${key}`);

  const enrollments = await listEnrollments(db, classId);
  const contacts = await Promise.all(
    enrollments.map(async (enrollment): Promise<RecipientCandidate | null> => {
      const contact = await resolveClassContact(db, enrollment.memberId, cls.track);
      return contact ? { memberId: enrollment.memberId, name: contact.name, email: contact.email, isPrimary: false } : null;
    }),
  );
  const recipients = dedupeRecipients(contacts.filter((contact): contact is RecipientCandidate => contact !== null));

  const currentSeason = await getCurrentSeason(db);
  return { key, label: classSegmentLabel(cls, currentSeason), recipients };
}

/**
 * Resolve one segment to its label and deduplicated recipients. Never a silent empty segment: an
 * unrecognized key (including a `class:<id>` whose class does not exist) throws.
 */
export async function resolveSegment(db: D1Database, key: SegmentKey): Promise<ResolvedSegment> {
  if (key === 'current' || key === 'lapsed') return resolveMembershipSegment(db, key);
  if (key === 'instructors') return resolveInstructorsSegment(db);
  if (key.startsWith('class:')) return resolveClassSegment(db, key as `class:${string}`);
  throw new Error(`Unknown segment key: ${key}`);
}

/**
 * The Compose screen's segment picker options: the two membership segments, instructors, then
 * one `class:<id>` entry per class that has at least one enrollment, current-season classes
 * first and older seasons labeled with their year ({@link classSegmentLabel}). A class with no
 * enrollments yet is left off the picker: there is no roster to email.
 */
export async function listSegmentOptions(db: D1Database): Promise<SegmentOption[]> {
  const currentSeason = await getCurrentSeason(db);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.season
       FROM classes c
       WHERE EXISTS (SELECT 1 FROM class_enrollments e WHERE e.class_id = c.id)
       ORDER BY (c.season = ?1) DESC, c.season DESC, c.name ASC`,
    )
    .bind(currentSeason)
    .all<{ id: string; name: string; season: number }>();

  const classOptions: SegmentOption[] = results.map((row) => ({
    key: `class:${row.id}`,
    label: classSegmentLabel(row, currentSeason),
  }));

  return [
    { key: 'current', label: 'Current members' },
    { key: 'lapsed', label: 'Lapsed members' },
    { key: 'instructors', label: 'Instructors' },
    ...classOptions,
  ];
}
