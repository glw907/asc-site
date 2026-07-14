// The member-domain vocabulary: three type unions every membership consumer needs (tier,
// directory visibility, batch-email segment), the one definition every live store and screen
// imports (`docs/plans/2026-07-14-membership-admin.md`).

/** The three membership tiers, source-verified against the club's published pricing:
 *  `individual` ($250/year, one person, one class credit), `family` ($500/year, the whole
 *  household, two credits), `young-adult` ($100/year, an independent member aged 18-25, one
 *  credit). */
export type MembershipTier = 'individual' | 'family' | 'young-adult';

/** MembershipWorks's own three-state semantics for how a member appears in the public
 *  directory: fully visible, name-and-city only, or not listed at all. */
export type DirectoryVisibility = 'visible' | 'partial' | 'hidden';

/** The batch-email segment vocabulary: `current` (household has a paid-or-invoiced
 *  current-season membership), `lapsed` (a renewal prospect), or `archived` (a member an admin
 *  has deliberately marked as gone for good, distinct from simply not having renewed). */
export type MemberSegment = 'current' | 'lapsed' | 'archived';
