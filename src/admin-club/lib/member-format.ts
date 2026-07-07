// Shared presentation helpers for the Members list and detail screens (the same extraction the
// scaffold pass already did for OfficeList/fields.ts once a second consumer needed the same
// recipe): the chip vocabularies and the two formatters both screens read off demo-members.ts's
// data. Kept out of demo-members.ts itself, which stays data-and-derivation only, no markup or
// CSS class strings.
import type { DirectoryVisibility, MemberSegment, MembershipTier } from './demo-members';

/** One chip's display: the label it reads, and the badge classes carrying its color. */
export interface ChipStyle {
  label: string;
  cls: string;
}

/** Segment chips, following the same vocabulary the Events/Classes screens already established
 *  (`docs/club-admin-scaffold.md`'s chip vocabulary): the one state a volunteer can act on
 *  (an active renewal) gets the filled primary tint, and `lapsed` (still a renewal prospect)
 *  stays a plain ghost chip. `archived` reads deliberately quieter still (a lower-opacity ghost
 *  chip): it isn't a state to act on at all, just a record of someone the club no longer
 *  contacts, and the dimmer treatment should read as "put away," not "needs attention." */
export const SEGMENT_CHIP: Record<MemberSegment, ChipStyle> = {
  current: { label: 'Current', cls: 'badge-sm border-transparent bg-primary/10 font-medium text-primary' },
  lapsed: { label: 'Lapsed', cls: 'badge-ghost badge-sm font-medium' },
  archived: { label: 'Archived', cls: 'badge-ghost badge-sm font-medium opacity-60' },
};

/** The small "payment due" note shown beside a `current`-segment member whose this-season
 *  invoice is unpaid: styled in the timeline/stats warning language (see the Member detail
 *  page's own header comment), not the segment chip's primary/ghost/opacity vocabulary above,
 *  since owing money this season is a different fact from which segment a member is in. */
export const PAYMENT_PENDING_LABEL = 'Payment due';
export const PAYMENT_PENDING_CLS = 'text-warning font-medium';

/** Display labels for the three membership tiers (the household's own membership tier, not a
 *  per-member fact; see demo-members.ts's design choice 2). */
export const TIER_LABEL: Record<MembershipTier, string> = {
  individual: 'Individual',
  family: 'Family',
  'young-adult': 'Young Adult',
};

/** Directory-visibility chips, mirroring MembershipWorks's own three states. */
export const VISIBILITY_CHIP: Record<DirectoryVisibility, ChipStyle> = {
  visible: { label: 'Visible', cls: 'badge-sm border-transparent bg-primary/10 font-medium text-primary' },
  partial: { label: 'Partial', cls: 'badge-ghost badge-sm font-medium' },
  hidden: { label: 'Hidden', cls: 'badge-ghost badge-sm font-medium' },
};

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** A civil date ("joined on the 2nd", "paid on the 14th") is a calendar day, not an instant, so
 *  it parses at local midnight on purpose: appending T00:00:00 keeps `Date` from reading a bare
 *  YYYY-MM-DD as UTC and shifting it a day west of Greenwich (the same note the Events screen's
 *  own `formatDate` carries). */
export function formatCivilDate(iso: string | null): string {
  if (!iso) return 'Not yet';
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? iso : dateFmt.format(parsed);
}

/** Dues are stored as whole dollars (the same plain-integer convention the Classes screen's own
 *  `fee` column uses), so this is string formatting, not currency math. */
export function formatDues(amount: number): string {
  return `$${amount}`;
}
