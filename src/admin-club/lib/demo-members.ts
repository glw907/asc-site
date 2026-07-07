// DEMO DATA -- pass 2.2 (docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md, Part A)
// replaces this whole module with the real D1 member store. Nothing here is a mock of a live
// system: the types below ARE the schema proposal, and the values are hand-authored so the
// Members screens render against realistic content while that store doesn't exist yet.
//
// PRODUCTION SCALE: the club runs roughly 180 current members across on the order of a hundred
// households (an earlier "~35" estimate was asset-holders only, a much narrower group). The
// Members list is designed for that scale (search and real pagination, not a flat unpaginated
// table; see the list screen's own header comment), but this fixture stays a readable sample --
// about twenty members across a dozen households, enough to cover every state at once without
// padding the file to look enterprise-dense for its own sake.
//
// The shape carries nine design choices worth recording, since a schema proposal is read as
// closely as code:
//
// 1. Households group members, and each household designates exactly one primary member
//    (`primaryMemberId`, a foreign key on the household rather than a boolean scattered across
//    members, which is the only shape that structurally enforces "exactly one"). The primary is
//    the household's billing and renewal contact, not necessarily its most senior member.
// 2. A Member and a Membership are two different entities (this distinction is canon, not a
//    naming nicety): a `Member` is a person; a `Membership` is a HOUSEHOLD's per-season
//    purchase, not a per-person one. A family's one Family-tier membership covers every member
//    of that household for the season; there is no such thing as "Kaija's own membership"
//    separate from "the Larsen household's membership." Code and UI copy keep the two words for
//    the two different things.
// 3. `directoryVisibility` mirrors MembershipWorks's own three-state semantics (Visible/Hidden/
//    Partial) rather than a simple boolean, since "partial" (name and city, no contact details)
//    is a real state members choose today and pass 2.3's directory needs it preserved.
// 4. `Payment` is its own row, referencing a `Membership` by id, following the ops-Stripe
//    pattern the design suite's Part A calls out (a payment link generated per invoice, its id
//    recorded, paid or still outstanding).
// 5. Signup activates a membership IMMEDIATELY on payment. The club's board still reviews new
//    signups, but that review is a post-hoc background check, never a gate: a `pending` payment
//    status means "invoiced, not yet paid," and nothing in this schema models an
//    approval-blocks-membership state, because there isn't one.
// 6. `MemberSegment` is a member-level field, not a per-season derived value: `archivedAt` is a
//    deliberate override (see {@link segmentForMember}) an admin sets when a member has left for
//    good, distinct from their household simply not having renewed. A household's own
//    current/lapsed status is shared by all its (non-archived) members, since they share one
//    membership; `archivedAt` is the one way an individual member's segment can diverge from
//    their household's.
// 7. Three membership tiers, source-verified against the club's own published pricing:
//    Individual $250/year (1 class credit), Family $500/year (2 credits, covers the whole
//    household), Young Adult $100/year for an independent member aged 18-25 buying their own
//    membership (1 credit). A dependent covered under a Family membership (a minor, for
//    instance) carries no tier or price of their own; the household's one membership covers
//    them. Prices are admin-adjustable, so a `Membership` row snapshots `pricePaid` at the
//    moment it's created; this fixture has no verified historical price changes to reproduce, so
//    every season here charges today's published rate.
// 8. `birthdate` makes age-based eligibility (Young Adult's 18-25 window) computable rather than
//    guessed. It is never rendered in any screen this pass, and a future public directory (pass
//    2.3) must never show it either.
// 9. Class credits are a durable ledger attached to the HOUSEHOLD, not a mutable counter on it:
//    a `CreditGrant` records crediting the household when it joins at a credit-bearing tier
//    (sized by that tier), and a `CreditRedemption` records spending one against a class
//    enrollment. The balance is always `grants - redemptions`, computed fresh (see
//    {@link creditBalance}), never stored. Today the club's committee tracks this by hand; the
//    ledger automates an existing chore, not a new one. The published promise this ledger must
//    hold to, verbatim: "credits never expire, even if your membership lapses" -- neither row
//    type carries a season field, and `creditBalance` never checks a household's current segment,
//    so a lapsed or even archived household's unspent credits stay exactly as redeemable as a
//    current one's. A future pass 2.4 (asset assignments) attaches an assignment to a
//    `Membership`, never to an individual `Member`, the same household-not-person seam this
//    ledger already uses.

/** MembershipWorks's own three-state semantics for how a member appears in the public
 *  directory: fully visible, name-and-city only, or not listed at all. */
export type DirectoryVisibility = 'visible' | 'partial' | 'hidden';

/**
 * The batch-email segment vocabulary (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
 * suite.md, Part B): pass 2.3's segment sends read this exact vocabulary directly ("nudge every
 * `lapsed` member to renew", "announce to every `current` member"). `archived` is distinct from
 * `lapsed`: a lapsed member's household is still a renewal prospect, while an archived member has
 * deliberately left for good (moved away, resigned, and so on) and is excluded from the active
 * list, the future public directory, and every batch segment by default, even though their
 * history stays intact and readable.
 */
export type MemberSegment = 'current' | 'lapsed' | 'archived';

/** The three membership tiers, source-verified against the club's published pricing (see design
 *  choice 7): `individual` ($250/year, one person, one class credit), `family` ($500/year, the
 *  whole household, two credits), `young-adult` ($100/year, an independent member aged 18-25,
 *  one credit). Sizes the class-credit grant a household receives when it joins at that tier;
 *  see {@link CREDIT_GRANT_AMOUNT}. */
export type MembershipTier = 'individual' | 'family' | 'young-adult';

/** A Stripe payment's own lifecycle, as the bolt-on ops flow already tracks it: a payment link
 *  is generated when the invoice is issued, and its status flips to `paid` once Stripe confirms
 *  it. `pending` means unpaid, not "awaiting approval": see design choice 5. */
export type PaymentStatus = 'paid' | 'pending';

/** One family or shared address the club bills and lists as a unit. */
export interface Household {
  id: string;
  /** The household's own name, as a volunteer would say it ("the Larsens"), not a formal legal
   *  name. */
  name: string;
  /** The home city (Alaska is small enough that city alone is a useful at-a-glance signal). */
  city: string;
  /** The one member (every household has exactly one) who manages this household's membership:
   *  billing contact, renewal decisions. See design choice 1 above for why this lives here
   *  rather than as a flag on `Member`. */
  primaryMemberId: string;
}

/** One person: a household's member, whether or not their household's current-season dues are
 *  paid. See design choice 2: a `Member` never holds its own `Membership`. */
export interface Member {
  id: string;
  householdId: string;
  name: string;
  email: string;
  phone: string;
  directoryVisibility: DirectoryVisibility;
  /** The civil date (YYYY-MM-DD) this member first joined the club, not necessarily the
   *  household's own founding date (a household can add a member years after it forms). */
  joined: string;
  /** The civil date an admin deliberately archived this member ("not coming back"), or `null`
   *  while they're still current-or-lapsed with their household. See {@link MemberSegment}. */
  archivedAt: string | null;
  /** Never rendered (see design choice 8 above); present only so Young Adult eligibility is a
   *  computed fact, not a guess. */
  birthdate: string;
}

/** A HOUSEHOLD's dues record for one season (see design choice 2: not a per-member record). Its
 *  existence means an invoice was issued for the whole household; whether it was paid lives on
 *  the linked {@link Payment}, not here. */
export interface Membership {
  id: string;
  householdId: string;
  /** The dues year, e.g. `2026`. */
  season: number;
  tier: MembershipTier;
  /** The price actually charged for this season, snapshotted from {@link TIER_PRICING} at the
   *  moment this row was created (design choice 7). */
  pricePaid: number;
}

/** One dues payment, referencing the membership it settles. `stripePaymentLinkId` stands in for
 *  the ops-Stripe pattern's payment-link id: present once the invoice goes out, whether or not
 *  it has been paid yet. */
export interface Payment {
  id: string;
  membershipId: string;
  /** Whole US dollars, matching the plain-integer convention the club's other D1 tables already
   *  use for fees (see the Classes screen's own `fee` column). Equal to the membership's own
   *  `pricePaid` in every real case; kept as its own field because a payment record and an
   *  invoice record are still two different facts (a partial payment or a manual adjustment
   *  would show up here without needing to rewrite the invoice). */
  amount: number;
  status: PaymentStatus;
  /** The civil date Stripe confirmed payment, or `null` while still pending. */
  paidDate: string | null;
  stripePaymentLinkId: string;
}

/** One addition to a household's class-credit ledger, recorded when the household joins at a
 *  credit-bearing tier (see {@link CREDIT_GRANT_AMOUNT}). */
export interface CreditGrant {
  id: string;
  householdId: string;
  /** The member whose joining triggered this grant, kept for audit purposes only; the credit
   *  itself belongs to the household. */
  memberId: string;
  grantedAt: string;
  tier: MembershipTier;
  amount: number;
}

/** One spend against a household's class-credit ledger. `classEnrollmentRef` is an opaque
 *  stand-in id for this schema preview: the real Classes enrollment identity (a different
 *  concept, in `EVENTS_DB`) is pass 2.4's join to design, not this one's. */
export interface CreditRedemption {
  id: string;
  householdId: string;
  /** The member who actually redeemed the credit (any household member can, since the ledger is
   *  shared, not tied to whoever triggered the original grant). */
  memberId: string;
  classEnrollmentRef: string;
  redeemedAt: string;
}

/** The season these screens treat as "current" for segment and payment-status purposes. A real
 *  store would read this from wherever the club's season boundary lives (the design suite's
 *  Part A leaves the exact date to a future pass); this fixture fixes it so the demo data stays
 *  stable. */
export const CURRENT_SEASON = 2026;

/** The club's own published per-tier dues (design choice 7), admin-adjustable in a real store;
 *  a `Membership` row snapshots from this table into its own `pricePaid` at creation time, so a
 *  later change here never rewrites a season that already happened. */
export const TIER_PRICING: Record<MembershipTier, number> = {
  individual: 250,
  family: 500,
  'young-adult': 100,
};

/** How many class credits, each worth $100 toward a class fee, a household receives when it
 *  joins at each tier (design choice 9): two for Family, one for either individual tier. */
export const CREDIT_GRANT_AMOUNT: Record<MembershipTier, number> = {
  individual: 1,
  family: 2,
  'young-adult': 1,
};

/** The dollar value of one class credit (design choice 9), for a future redemption UI that
 *  needs to show what a credit is worth against a class fee; unused by these screens today. */
export const CREDIT_VALUE_USD = 100;

/** A Young Adult membership's eligibility window, source-verified against the club's published
 *  pricing page. */
export const YOUNG_ADULT_MIN_AGE = 18;
export const YOUNG_ADULT_MAX_AGE = 25;

export const households: Household[] = [
  { id: 'hh-larsen', name: 'The Larsens', city: 'Anchorage', primaryMemberId: 'mem-erik-larsen' },
  { id: 'hh-petrov', name: 'The Petrovs', city: 'Fairbanks', primaryMemberId: 'mem-dimitri-petrov' },
  // Carol, not Tom, manages the Whitfield household's membership: the primary is a billing
  // designation, not automatically whichever member has been more engaged lately.
  { id: 'hh-whitfield', name: 'The Whitfields', city: 'Wasilla', primaryMemberId: 'mem-carol-whitfield' },
  { id: 'hh-chen', name: 'The Chens', city: 'Sitka', primaryMemberId: 'mem-mei-chen' },
  { id: 'hh-sundberg', name: 'The Sundbergs', city: 'Juneau', primaryMemberId: 'mem-astrid-sundberg' },
  { id: 'hh-okonkwo', name: 'The Okonkwos', city: 'Eagle River', primaryMemberId: 'mem-ada-okonkwo' },
  { id: 'hh-halvorsen', name: 'The Halvorsens', city: 'Homer', primaryMemberId: 'mem-bjorn-halvorsen' },
  { id: 'hh-kowalski', name: 'The Kowalskis', city: 'Palmer', primaryMemberId: 'mem-rosalind-kowalski' },
  { id: 'hh-yamada', name: 'The Yamadas', city: 'Ketchikan', primaryMemberId: 'mem-priya-yamada' },
  { id: 'hh-tanaka', name: 'The Tanakas', city: 'Valdez', primaryMemberId: 'mem-haruto-tanaka' },
  { id: 'hh-ivanov', name: 'The Ivanovs', city: 'Seward', primaryMemberId: 'mem-nikita-ivanov' },
  { id: 'hh-nguyen', name: 'The Nguyens', city: 'Wasilla', primaryMemberId: 'mem-linh-nguyen' },
];

export const members: Member[] = [
  // The Larsens: Family tier, current. The delayed-use credit case (see creditGrants below).
  { id: 'mem-erik-larsen', householdId: 'hh-larsen', name: 'Erik Larsen', email: 'erik.larsen@example.com', phone: '(907) 555-0142', directoryVisibility: 'visible', joined: '2015-04-02', archivedAt: null, birthdate: '1978-11-02' },
  { id: 'mem-kaija-larsen', householdId: 'hh-larsen', name: 'Kaija Larsen', email: 'kaija.larsen@example.com', phone: '(907) 555-0143', directoryVisibility: 'visible', joined: '2015-04-02', archivedAt: null, birthdate: '1980-02-19' },
  // The Petrovs: Family tier, current, four members -- a dependent (Nikolai) carries no tier of
  // his own, and Vera is individually archived (moved away) despite the household staying
  // current, the one way a member's segment can diverge from their household's.
  { id: 'mem-dimitri-petrov', householdId: 'hh-petrov', name: 'Dimitri Petrov', email: 'dimitri.petrov@example.com', phone: '(907) 555-0298', directoryVisibility: 'visible', joined: '2008-05-30', archivedAt: null, birthdate: '1965-03-11' },
  { id: 'mem-yelena-petrov', householdId: 'hh-petrov', name: 'Yelena Petrov', email: 'yelena.petrov@example.com', phone: '(907) 555-0299', directoryVisibility: 'visible', joined: '2008-05-30', archivedAt: null, birthdate: '1967-08-05' },
  { id: 'mem-nikolai-petrov', householdId: 'hh-petrov', name: 'Nikolai Petrov', email: 'nikolai.petrov@example.com', phone: '(907) 555-0301', directoryVisibility: 'partial', joined: '2022-05-01', archivedAt: null, birthdate: '2009-09-20' },
  { id: 'mem-vera-petrova', householdId: 'hh-petrov', name: 'Vera Petrova', email: 'vera.petrova@example.com', phone: '(907) 555-0302', directoryVisibility: 'hidden', joined: '2008-05-30', archivedAt: '2025-09-12', birthdate: '1942-12-01' },
  // The Whitfields: Family tier, lapsed (didn't renew this season).
  { id: 'mem-tom-whitfield', householdId: 'hh-whitfield', name: 'Tom Whitfield', email: 'tom.whitfield@example.com', phone: '(907) 555-0410', directoryVisibility: 'hidden', joined: '2010-07-14', archivedAt: null, birthdate: '1972-06-18' },
  { id: 'mem-carol-whitfield', householdId: 'hh-whitfield', name: 'Carol Whitfield', email: 'carol.whitfield@example.com', phone: '(907) 555-0411', directoryVisibility: 'visible', joined: '2010-07-14', archivedAt: null, birthdate: '1974-10-09' },
  // The Chens: Family tier, current.
  { id: 'mem-mei-chen', householdId: 'hh-chen', name: 'Mei Chen', email: 'mei.chen@example.com', phone: '(907) 555-0630', directoryVisibility: 'partial', joined: '2017-09-09', archivedAt: null, birthdate: '1979-01-30' },
  { id: 'mem-wei-chen', householdId: 'hh-chen', name: 'Wei Chen', email: 'wei.chen@example.com', phone: '(907) 555-0631', directoryVisibility: 'visible', joined: '2017-09-09', archivedAt: null, birthdate: '1981-07-07' },
  // A single-member household, Individual tier, current.
  { id: 'mem-astrid-sundberg', householdId: 'hh-sundberg', name: 'Astrid Sundberg', email: 'astrid.sundberg@example.com', phone: '(907) 555-0187', directoryVisibility: 'partial', joined: '2019-06-11', archivedAt: null, birthdate: '1985-09-30' },
  // Individual tier, lapsed for two seasons running.
  { id: 'mem-ada-okonkwo', householdId: 'hh-okonkwo', name: 'Ada Okonkwo', email: 'ada.okonkwo@example.com', phone: '(907) 555-0233', directoryVisibility: 'hidden', joined: '2012-03-19', archivedAt: null, birthdate: '1970-01-22' },
  // Joined this season; the invoice went out but Stripe hasn't confirmed it yet, the
  // payment-pending case a brand-new member hits before their first renewal.
  { id: 'mem-bjorn-halvorsen', householdId: 'hh-halvorsen', name: 'Björn Halvorsen', email: 'bjorn.halvorsen@example.com', phone: '(907) 555-0522', directoryVisibility: 'visible', joined: '2026-03-01', archivedAt: null, birthdate: '1990-05-25' },
  // Archived (the household's own membership lapsed years before the club formally archived her).
  { id: 'mem-rosalind-kowalski', householdId: 'hh-kowalski', name: 'Rosalind Kowalski', email: 'rosalind.kowalski@example.com', phone: '(907) 555-0745', directoryVisibility: 'hidden', joined: '2006-05-05', archivedAt: '2025-04-15', birthdate: '1955-11-11' },
  // Young Adult tier (23 years old): an independent member buying her own discounted membership,
  // not a family dependent.
  { id: 'mem-priya-yamada', householdId: 'hh-yamada', name: 'Priya Yamada', email: 'priya.yamada@example.com', phone: '(907) 555-0866', directoryVisibility: 'visible', joined: '2024-05-19', archivedAt: null, birthdate: '2003-04-10' },
  // Individual tier, lapsed.
  { id: 'mem-haruto-tanaka', householdId: 'hh-tanaka', name: 'Haruto Tanaka', email: 'haruto.tanaka@example.com', phone: '(907) 555-0921', directoryVisibility: 'hidden', joined: '2016-08-02', archivedAt: null, birthdate: '1976-02-14' },
  // The Ivanovs: Family tier, current, three members (one a young-adult-aged dependent who is
  // still covered under the family membership rather than buying his own Young Adult tier).
  { id: 'mem-nikita-ivanov', householdId: 'hh-ivanov', name: 'Nikita Ivanov', email: 'nikita.ivanov@example.com', phone: '(907) 555-1042', directoryVisibility: 'visible', joined: '2013-06-21', archivedAt: null, birthdate: '1969-04-08' },
  { id: 'mem-sofia-ivanova', householdId: 'hh-ivanov', name: 'Sofia Ivanova', email: 'sofia.ivanova@example.com', phone: '(907) 555-1043', directoryVisibility: 'partial', joined: '2013-06-21', archivedAt: null, birthdate: '1971-09-17' },
  { id: 'mem-pavel-ivanov', householdId: 'hh-ivanov', name: 'Pavel Ivanov', email: 'pavel.ivanov@example.com', phone: '(907) 555-1044', directoryVisibility: 'visible', joined: '2013-06-21', archivedAt: null, birthdate: '2005-08-01' },
  // The Nguyens: Family tier, current.
  { id: 'mem-linh-nguyen', householdId: 'hh-nguyen', name: 'Linh Nguyen', email: 'linh.nguyen@example.com', phone: '(907) 555-1155', directoryVisibility: 'visible', joined: '2021-04-27', archivedAt: null, birthdate: '1983-12-03' },
  { id: 'mem-duc-nguyen', householdId: 'hh-nguyen', name: 'Duc Nguyen', email: 'duc.nguyen@example.com', phone: '(907) 555-1156', directoryVisibility: 'partial', joined: '2021-04-27', archivedAt: null, birthdate: '1985-06-22' },
];

export const memberships: Membership[] = [
  { id: 'ms-larsen-2026', householdId: 'hh-larsen', season: 2026, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-larsen-2025', householdId: 'hh-larsen', season: 2025, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-larsen-2024', householdId: 'hh-larsen', season: 2024, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-petrov-2026', householdId: 'hh-petrov', season: 2026, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-petrov-2025', householdId: 'hh-petrov', season: 2025, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-petrov-2024', householdId: 'hh-petrov', season: 2024, tier: 'family', pricePaid: TIER_PRICING.family },
  // No 2026 row: the Whitfields haven't renewed this season.
  { id: 'ms-whitfield-2025', householdId: 'hh-whitfield', season: 2025, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-whitfield-2024', householdId: 'hh-whitfield', season: 2024, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-chen-2026', householdId: 'hh-chen', season: 2026, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-chen-2025', householdId: 'hh-chen', season: 2025, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-sundberg-2026', householdId: 'hh-sundberg', season: 2026, tier: 'individual', pricePaid: TIER_PRICING.individual },
  { id: 'ms-sundberg-2025', householdId: 'hh-sundberg', season: 2025, tier: 'individual', pricePaid: TIER_PRICING.individual },
  // No 2025/2026 row: Ada's household has been lapsed two seasons running.
  { id: 'ms-okonkwo-2024', householdId: 'hh-okonkwo', season: 2024, tier: 'individual', pricePaid: TIER_PRICING.individual },
  { id: 'ms-okonkwo-2023', householdId: 'hh-okonkwo', season: 2023, tier: 'individual', pricePaid: TIER_PRICING.individual },
  // Björn's only season so far: this year, invoiced, not yet paid.
  { id: 'ms-halvorsen-2026', householdId: 'hh-halvorsen', season: 2026, tier: 'individual', pricePaid: TIER_PRICING.individual },
  { id: 'ms-kowalski-2024', householdId: 'hh-kowalski', season: 2024, tier: 'individual', pricePaid: TIER_PRICING.individual },
  { id: 'ms-kowalski-2023', householdId: 'hh-kowalski', season: 2023, tier: 'individual', pricePaid: TIER_PRICING.individual },
  { id: 'ms-yamada-2026', householdId: 'hh-yamada', season: 2026, tier: 'young-adult', pricePaid: TIER_PRICING['young-adult'] },
  { id: 'ms-yamada-2025', householdId: 'hh-yamada', season: 2025, tier: 'young-adult', pricePaid: TIER_PRICING['young-adult'] },
  // No 2026 row: Haruto's household lapsed this season.
  { id: 'ms-tanaka-2025', householdId: 'hh-tanaka', season: 2025, tier: 'individual', pricePaid: TIER_PRICING.individual },
  { id: 'ms-tanaka-2024', householdId: 'hh-tanaka', season: 2024, tier: 'individual', pricePaid: TIER_PRICING.individual },
  { id: 'ms-ivanov-2026', householdId: 'hh-ivanov', season: 2026, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-ivanov-2025', householdId: 'hh-ivanov', season: 2025, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-nguyen-2026', householdId: 'hh-nguyen', season: 2026, tier: 'family', pricePaid: TIER_PRICING.family },
  { id: 'ms-nguyen-2025', householdId: 'hh-nguyen', season: 2025, tier: 'family', pricePaid: TIER_PRICING.family },
];

export const payments: Payment[] = [
  { id: 'pay-larsen-2026', membershipId: 'ms-larsen-2026', amount: 500, status: 'paid', paidDate: '2026-01-14', stripePaymentLinkId: 'plink_8f2a1c' },
  { id: 'pay-larsen-2025', membershipId: 'ms-larsen-2025', amount: 500, status: 'paid', paidDate: '2025-01-09', stripePaymentLinkId: 'plink_5b9e3d' },
  { id: 'pay-larsen-2024', membershipId: 'ms-larsen-2024', amount: 500, status: 'paid', paidDate: '2024-01-11', stripePaymentLinkId: 'plink_2c7f40' },
  { id: 'pay-petrov-2026', membershipId: 'ms-petrov-2026', amount: 500, status: 'paid', paidDate: '2026-01-06', stripePaymentLinkId: 'plink_2b7a57' },
  { id: 'pay-petrov-2025', membershipId: 'ms-petrov-2025', amount: 500, status: 'paid', paidDate: '2025-01-05', stripePaymentLinkId: 'plink_9c6b48' },
  { id: 'pay-petrov-2024', membershipId: 'ms-petrov-2024', amount: 500, status: 'paid', paidDate: '2024-01-08', stripePaymentLinkId: 'plink_5d4a39' },
  { id: 'pay-whitfield-2025', membershipId: 'ms-whitfield-2025', amount: 500, status: 'paid', paidDate: '2025-02-11', stripePaymentLinkId: 'plink_6a5257' },
  { id: 'pay-whitfield-2024', membershipId: 'ms-whitfield-2024', amount: 500, status: 'paid', paidDate: '2024-02-09', stripePaymentLinkId: 'plink_3b4148' },
  { id: 'pay-chen-2026', membershipId: 'ms-chen-2026', amount: 500, status: 'paid', paidDate: '2026-01-30', stripePaymentLinkId: 'plink_9a8c93' },
  { id: 'pay-chen-2025', membershipId: 'ms-chen-2025', amount: 500, status: 'paid', paidDate: '2025-01-27', stripePaymentLinkId: 'plink_6b7b84' },
  { id: 'pay-sundberg-2026', membershipId: 'ms-sundberg-2026', amount: 250, status: 'paid', paidDate: '2026-02-02', stripePaymentLinkId: 'plink_7e4b93' },
  { id: 'pay-sundberg-2025', membershipId: 'ms-sundberg-2025', amount: 250, status: 'paid', paidDate: '2025-01-28', stripePaymentLinkId: 'plink_4f2c84' },
  { id: 'pay-okonkwo-2024', membershipId: 'ms-okonkwo-2024', amount: 250, status: 'paid', paidDate: '2024-03-05', stripePaymentLinkId: 'plink_1a9d75' },
  { id: 'pay-okonkwo-2023', membershipId: 'ms-okonkwo-2023', amount: 250, status: 'paid', paidDate: '2023-03-01', stripePaymentLinkId: 'plink_0e8c66' },
  { id: 'pay-halvorsen-2026', membershipId: 'ms-halvorsen-2026', amount: 250, status: 'pending', paidDate: null, stripePaymentLinkId: 'plink_2f9d02' },
  { id: 'pay-kowalski-2024', membershipId: 'ms-kowalski-2024', amount: 250, status: 'paid', paidDate: '2024-04-02', stripePaymentLinkId: 'plink_4f3748' },
  { id: 'pay-kowalski-2023', membershipId: 'ms-kowalski-2023', amount: 250, status: 'paid', paidDate: '2023-04-01', stripePaymentLinkId: 'plink_1a2639' },
  { id: 'pay-yamada-2026', membershipId: 'ms-yamada-2026', amount: 100, status: 'paid', paidDate: '2026-03-11', stripePaymentLinkId: 'plink_6f0a84' },
  { id: 'pay-yamada-2025', membershipId: 'ms-yamada-2025', amount: 100, status: 'paid', paidDate: '2025-03-09', stripePaymentLinkId: 'plink_3e9b75' },
  { id: 'pay-tanaka-2025', membershipId: 'ms-tanaka-2025', amount: 250, status: 'paid', paidDate: '2025-05-14', stripePaymentLinkId: 'plink_0d5966' },
  { id: 'pay-tanaka-2024', membershipId: 'ms-tanaka-2024', amount: 250, status: 'paid', paidDate: '2024-05-12', stripePaymentLinkId: 'plink_7e4857' },
  { id: 'pay-ivanov-2026', membershipId: 'ms-ivanov-2026', amount: 500, status: 'paid', paidDate: '2026-02-20', stripePaymentLinkId: 'plink_4c8f84' },
  { id: 'pay-ivanov-2025', membershipId: 'ms-ivanov-2025', amount: 500, status: 'paid', paidDate: '2025-02-18', stripePaymentLinkId: 'plink_1d7075' },
  { id: 'pay-nguyen-2026', membershipId: 'ms-nguyen-2026', amount: 500, status: 'paid', paidDate: '2026-01-22', stripePaymentLinkId: 'plink_9e6166' },
  { id: 'pay-nguyen-2025', membershipId: 'ms-nguyen-2025', amount: 500, status: 'paid', paidDate: '2025-01-19', stripePaymentLinkId: 'plink_0c3039' },
];

export const creditGrants: CreditGrant[] = [
  // The delayed-use case: the Larsens joined at the Family tier in 2015, granting 2 credits.
  // Only one has ever been redeemed (below); the other has simply sat unspent for years, which
  // is the ledger surviving rollover (and would survive a lapse too) by construction, not a
  // special carry-forward step.
  { id: 'grant-larsen-2015', householdId: 'hh-larsen', memberId: 'mem-erik-larsen', grantedAt: '2015-04-02', tier: 'family', amount: CREDIT_GRANT_AMOUNT.family },
  // The both-spent case: the Petrovs joined at the Family tier in 2008, granting 2 credits, and
  // both are long since redeemed (below).
  { id: 'grant-petrov-2008', householdId: 'hh-petrov', memberId: 'mem-dimitri-petrov', grantedAt: '2008-05-30', tier: 'family', amount: CREDIT_GRANT_AMOUNT.family },
  // A fresh, unredeemed Individual-tier grant (1 credit): Björn just joined this season.
  { id: 'grant-halvorsen-2026', householdId: 'hh-halvorsen', memberId: 'mem-bjorn-halvorsen', grantedAt: '2026-03-01', tier: 'individual', amount: CREDIT_GRANT_AMOUNT.individual },
  // A fresh, unredeemed Young Adult-tier grant (1 credit), showing that tier's own grant size.
  { id: 'grant-yamada-2024', householdId: 'hh-yamada', memberId: 'mem-priya-yamada', grantedAt: '2024-05-19', tier: 'young-adult', amount: CREDIT_GRANT_AMOUNT['young-adult'] },
];

export const creditRedemptions: CreditRedemption[] = [
  { id: 'redeem-larsen-1', householdId: 'hh-larsen', memberId: 'mem-kaija-larsen', classEnrollmentRef: 'class-2019-summer-clinic', redeemedAt: '2019-06-08' },
  { id: 'redeem-petrov-1', householdId: 'hh-petrov', memberId: 'mem-dimitri-petrov', classEnrollmentRef: 'class-2010-keelboat-basics', redeemedAt: '2010-05-20' },
  { id: 'redeem-petrov-2', householdId: 'hh-petrov', memberId: 'mem-yelena-petrov', classEnrollmentRef: 'class-2011-heavy-weather', redeemedAt: '2011-07-14' },
];

/** The household a member belongs to, or `undefined` for a bad id (there is no such thing as a
 *  member without a household in this schema, so a miss here is a data bug, not a valid state). */
export function getHousehold(householdId: string): Household | undefined {
  return households.find((household) => household.id === householdId);
}

/** Every other member sharing a household, in the order they're declared (Larsens, Petrovs,
 *  etc. read in the household's own natural order rather than alphabetically). */
export function getHouseholdMembers(householdId: string): Member[] {
  return members.filter((member) => member.householdId === householdId);
}

export function getMember(id: string): Member | undefined {
  return members.find((member) => member.id === id);
}

/** A household's membership rows, most recent season first: exactly the order the detail
 *  page's timeline renders in. See design choice 2: this is keyed by household, not member. */
export function getMembershipsForHousehold(householdId: string): Membership[] {
  return memberships
    .filter((membership) => membership.householdId === householdId)
    .sort((a, b) => b.season - a.season);
}

export function getPaymentForMembership(membershipId: string): Payment | undefined {
  return payments.find((payment) => payment.membershipId === membershipId);
}

function currentSeasonMembership(householdId: string): Membership | undefined {
  return memberships.find((membership) => membership.householdId === householdId && membership.season === CURRENT_SEASON);
}

/**
 * A member's batch-email segment (see {@link MemberSegment}). `archivedAt` is checked first,
 * since it's a deliberate per-member override, never automatic; otherwise every member shares
 * their household's own segment: `current` if the household has a {@link CURRENT_SEASON}
 * membership row (paid or still invoiced), `lapsed` if it doesn't. Whether that current-season
 * invoice is actually paid is a separate fact (see {@link currentSeasonPaymentStatus}), not
 * folded into the segment.
 */
export function segmentForMember(memberId: string): MemberSegment {
  const member = getMember(memberId);
  if (!member) return 'lapsed';
  if (member.archivedAt) return 'archived';
  return currentSeasonMembership(member.householdId) ? 'current' : 'lapsed';
}

/**
 * Whether {@link CURRENT_SEASON}'s own household invoice, if one exists, is paid or still
 * pending: the "payment-pending member" case the list and detail screens surface alongside the
 * segment chip. `null` when there's no current-season membership row at all (a lapsed or
 * archived member).
 */
export function currentSeasonPaymentStatus(memberId: string): PaymentStatus | null {
  const member = getMember(memberId);
  if (!member) return null;
  const membership = currentSeasonMembership(member.householdId);
  if (!membership) return null;
  return getPaymentForMembership(membership.id)?.status ?? 'pending';
}

/** Whether the given member is their household's own primary (billing/renewal) contact. */
export function isHouseholdPrimary(memberId: string): boolean {
  const member = getMember(memberId);
  if (!member) return false;
  return getHousehold(member.householdId)?.primaryMemberId === memberId;
}

export function getCreditGrantsForHousehold(householdId: string): CreditGrant[] {
  return creditGrants.filter((grant) => grant.householdId === householdId);
}

export function getCreditRedemptionsForHousehold(householdId: string): CreditRedemption[] {
  return creditRedemptions.filter((redemption) => redemption.householdId === householdId);
}

/**
 * A household's class-credit balance: total granted minus total redeemed, computed fresh every
 * time (design choice 9). Deliberately does not check the household's segment: the published
 * promise is that credits never expire, not even if the membership lapses. Never negative in
 * valid data, but this function doesn't clamp, since a negative result would mean the ledger
 * itself is wrong and clamping would hide that.
 */
export function creditBalance(householdId: string): number {
  const granted = getCreditGrantsForHousehold(householdId).reduce((sum, grant) => sum + grant.amount, 0);
  const redeemed = getCreditRedemptionsForHousehold(householdId).length;
  return granted - redeemed;
}

/**
 * A member's age as of a given season, counting only whether their birthday has landed by
 * July 1 of that year (the club's own season midpoint, a reasonable stand-in absent a real
 * membership-year boundary). Exported so Young Adult-tier eligibility ({@link
 * YOUNG_ADULT_MIN_AGE}-{@link YOUNG_ADULT_MAX_AGE}) is demonstrably computed from
 * {@link Member.birthdate}, not asserted.
 */
export function ageInSeason(birthdate: string, season: number): number {
  const born = new Date(`${birthdate}T00:00:00`);
  const midpoint = new Date(`${season}-07-01T00:00:00`);
  let age = midpoint.getFullYear() - born.getFullYear();
  const beforeBirthdayThisYear =
    midpoint.getMonth() < born.getMonth() ||
    (midpoint.getMonth() === born.getMonth() && midpoint.getDate() < born.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}
