// The member-domain chip vocabularies the Members list and detail screens read off
// demo-members.ts's data. Kept out of demo-members.ts itself, which stays data-and-derivation
// only (no markup or CSS class strings), and out of ui.ts, which holds the screen-agnostic
// primitives (`ChipStyle`, the civil-date and dollar formatters) these records build on.
import type { ChipStyle } from './ui';
import type { DirectoryVisibility, MemberSegment, MembershipTier } from './demo-members';

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
