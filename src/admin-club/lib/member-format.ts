// The member-domain chip vocabularies the Members list and household desk read off live
// `asc-club` data. Kept out of the stores themselves (`households-store.ts`, `money-store.ts`
// stay data-and-derivation only, no markup or CSS class strings) and out of ui.ts, which holds
// the screen-agnostic primitives (`ChipStyle`, the civil-date and dollar formatters) these
// records build on.
import type { ChipStyle } from './ui';
import type { DirectoryVisibility, MemberSegment, MembershipTier } from './member-types';
import type { HouseholdStandingStatus } from './households-store';
import type { LineItem, TransactionKind, TransactionSource } from './ledger';

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

/** Display labels for the three membership tiers (a household's own membership tier, not a
 *  per-member fact: a `Membership` is one household's per-season purchase). */
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

/** The household-grouped Members list's own standing chips (Task 4, docs/plans/2026-07-14-
 *  membership-admin.md), keyed by `households-store.ts`'s `HouseholdStandingStatus` rather than
 *  the per-member `MemberSegment` above: the design doc's four-state vocabulary (current/grace/
 *  lapsed/none) replaces the fixture screen's three-state segment badge on this screen. `grace`
 *  reads in the warning language (a renewal window still open, but worth a volunteer's notice);
 *  `none` reads the quietest of all, dimmer even than `lapsed` (a household that has simply never
 *  paid is a different fact from one that used to be current). The list and the household desk
 *  both read this one map, so the two screens can never render the same status two different
 *  colors. */
export const STANDING_CHIP: Record<HouseholdStandingStatus, ChipStyle> = {
  current: { label: 'Current', cls: 'badge-sm border-transparent bg-primary/10 font-medium text-primary' },
  grace: { label: 'Grace', cls: 'badge-sm border-transparent bg-warning/15 font-medium text-warning-content' },
  lapsed: { label: 'Lapsed', cls: 'badge-ghost badge-sm font-medium' },
  none: { label: 'No membership', cls: 'badge-ghost badge-sm font-medium opacity-60' },
};

/** Display labels for the money ledger's own three-part vocabulary (`ledger.ts`): a transaction's
 *  kind, its source, and a line's item. Shared by the household desk's money timeline (Task 4)
 *  and the Money & Renewals screen's recent-transactions list (Task 7), so both read one set of
 *  words for the same ledger data. */
export const TRANSACTION_KIND_LABEL: Record<TransactionKind, string> = {
  charge: 'Charge',
  refund: 'Refund',
  void: 'Void',
};

export const TRANSACTION_SOURCE_LABEL: Record<TransactionSource, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  check: 'Check',
  cash: 'Cash',
  comp: 'Comp',
  other: 'Other',
};

export const LINE_ITEM_LABEL: Record<LineItem, string> = {
  dues: 'Dues',
  'class-fee': 'Class fee',
  'asset-fee': 'Asset fee',
  donation: 'Donation',
  discount: 'Discount',
  other: 'Other',
};
