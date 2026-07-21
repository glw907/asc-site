// The member-domain chip vocabularies the Members list and household desk read off live
// `asc-club` data. Kept out of the stores themselves (`households-store.ts`, `money-store.ts`
// stay data-and-derivation only, no markup or CSS class strings) and out of ui.ts, which holds
// the screen-agnostic primitives (`ChipStyle`, the civil-date and dollar formatters) these
// records build on.
import type { ChipStyle } from './ui';
import type { DirectoryVisibility, MemberSegment, MembershipTier } from './member-types';
import type { HouseholdStandingStatus } from '$member-auth/lib/standing';
import type { LineItem, TransactionKind, TransactionSource } from './ledger';
import type { StatusChipTone } from '$admin-club/toolkit/StatusChip.svelte';

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

/**
 * The household standing chip, shared by the Members list and the household desk
 * (`/admin/club/members/[id]`): both screens key off `$member-auth/lib/standing`'s own
 * `HouseholdStandingStatus` (Members pass T3 unifies what used to be two independently-derived
 * vocabularies -- `households-store.ts`'s own list-screen standing and this module's desk-only
 * chip -- into the one classifier every consumer now shares, so the two screens can never render
 * the same status two different colors). `overdue` reads in the warning language (a still-open
 * renewal window, worth a volunteer's notice, full benefits regardless); `former` reads the
 * quietest ghost chip short of `none`, which is dimmer still (a household that has simply never
 * paid is a different fact from one that used to be current).
 */
// `overdue` reads `badge-warning` (a solid, compiled fill), not `bg-warning/15 text-warning-content`
// (the Members pass coherence round's own a11y finding): neither `bg-warning/15` nor
// `text-warning-content` compiles in the packaged `cairn-admin.css` (only bare, unmodified
// `bg-warning` does), so the pair silently rendered as plain, uncolored body text on an admin
// route -- no warning tint at all, and no contrast pairing to check. `badge-warning` is in the
// safelist (`StatusChip`'s own header comment verifies the same four colored `badge-<tone>`
// modifiers), and daisyUI ships its `warning`/`warning-content` pair pre-checked for contrast.
export const HOUSEHOLD_STANDING_CHIP: Record<HouseholdStandingStatus, ChipStyle> = {
  current: { label: 'Current', cls: 'badge-sm border-transparent bg-primary/10 font-medium text-primary' },
  overdue: { label: 'Overdue', cls: 'badge-warning badge-sm font-medium' },
  former: { label: 'Former', cls: 'badge-ghost badge-sm font-medium' },
  none: { label: 'No membership', cls: 'badge-ghost badge-sm font-medium opacity-60' },
};

/** The same household standing, as a `StatusChip` tone (Members pass T7, the toolkit's first
 *  consumer): `current` reads `success` (in good standing), `overdue` reads `warning` (worth a
 *  volunteer's notice, full benefits regardless), `former`/`none` both read `neutral` (no longer,
 *  or never, an active member -- no alarm color, just a quiet fact). This mapping is a reasonable
 *  first choice, not a ratified one: `StatusChip`'s own color mapping onto the admin palette is
 *  still an open probe-round item (`docs/design-benchmark/decisions.md`, "OPEN at pass close").
 *  `HOUSEHOLD_STANDING_CHIP` above stays the household desk's own vocabulary (out of this pass's
 *  scope; the desk only picks up toolkit components a later pass wires it to). */
export const HOUSEHOLD_STANDING_TONE: Record<HouseholdStandingStatus, StatusChipTone> = {
  current: 'success',
  overdue: 'warning',
  former: 'neutral',
  none: 'neutral',
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
