// DEMO DATA -- pass 2.2 (docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md, Part A)
// replaces this whole module with the real D1 member store. Nothing here is a mock of a live
// system: the types below ARE the schema proposal, and the values are hand-authored so the
// Members screens render against realistic content while that store doesn't exist yet. The
// club's own scale is a design input (~8 households, a few dozen members total), so this data
// stays at that scale rather than padded to look enterprise-dense; the fixture doesn't try to
// simulate volume the real club doesn't have.
//
// The shape carries four design choices worth recording, since a schema proposal is read as
// closely as code:
//
// 1. Households group members. A household is its own row (name, home city), and each member
//    carries a `householdId` foreign key rather than embedding address fields per member. This
//    mirrors how MembershipWorks itself models a family membership (see the design suite's
//    evidence on MW's footprint) and lets the member detail page show "who else lives here"
//    without a join back through a shared last name or address string.
// 2. Memberships are per-member-per-season rows, not one row per member. Dues are an annual
//    renewal, and a household's members do not necessarily renew together (a Membership
//    scaffold's own scenario data below), so `Membership` carries `memberId` + `season` as its
//    natural key, and a member's standing for any given year reads off whichever row (if any)
//    matches that season.
// 3. `directoryVisibility` mirrors MembershipWorks's own three-state semantics (Visible/Hidden/
//    Partial) rather than a simple boolean, since "partial" (name and city, no contact details)
//    is a real state members choose today and Part C's directory (pass 2.3) needs it preserved,
//    not flattened to a yes/no.
// 4. `Payment` is its own row, referencing a `Membership` by id, following the ops-Stripe
//    pattern the design suite's Part A calls out (a payment link generated per invoice, its id
//    recorded, paid or still outstanding). Keeping payment separate from membership means a
//    membership can exist (an invoice was issued) before it is paid, which is exactly the
//    "payment-pending member" state the list and detail screens both need to show honestly.

/** MembershipWorks's own three-state semantics for how a member appears in the public
 *  directory: fully visible, name-and-city only, or not listed at all. */
export type DirectoryVisibility = 'visible' | 'partial' | 'hidden';

/** A member's standing for the current season, derived from their most recent membership row
 *  (see {@link standingForMember}): a paid current-season membership, an issued-but-unpaid one,
 *  or no current-season membership at all. */
export type SeasonStanding = 'current' | 'pending' | 'lapsed';

/** A Stripe payment's own lifecycle, as the bolt-on ops flow already tracks it: a payment link
 *  is generated when the invoice is issued, and its status flips to `paid` once Stripe confirms
 *  it, with no other state in between. */
export type PaymentStatus = 'paid' | 'pending';

/** One family or shared address the club bills and lists as a unit. */
export interface Household {
  id: string;
  /** The household's own name, as a volunteer would say it ("the Larsens"), not a formal legal
   *  name. */
  name: string;
  /** The home city (Alaska is small enough that city alone is a useful at-a-glance signal). */
  city: string;
}

/** One person the club can bill, list, and email, whether or not their current-season dues are
 *  paid. */
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
}

/** One member's dues record for one season. Its existence means an invoice was issued; whether
 *  it was paid lives on the linked {@link Payment}, not here. */
export interface Membership {
  id: string;
  memberId: string;
  /** The dues year, e.g. `2026`. */
  season: number;
}

/** One dues payment, referencing the membership it settles. `stripePaymentLinkId` stands in for
 *  the ops-Stripe pattern's payment-link id: present once the invoice goes out, whether or not
 *  it has been paid yet. */
export interface Payment {
  id: string;
  membershipId: string;
  /** Whole US dollars, matching the plain-integer convention the club's other D1 tables already
   *  use for fees (see the Classes screen's own `fee` column). */
  amount: number;
  status: PaymentStatus;
  /** The civil date Stripe confirmed payment, or `null` while still pending. */
  paidDate: string | null;
  stripePaymentLinkId: string;
}

/** The season these screens treat as "current" for standing purposes. A real store would read
 *  this from wherever the club's season boundary lives (the design suite's Part A leaves the
 *  exact date to a future pass); this fixture fixes it so the demo data's standings stay stable. */
export const CURRENT_SEASON = 2026;

export const households: Household[] = [
  { id: 'hh-larsen', name: 'The Larsens', city: 'Anchorage' },
  { id: 'hh-sundberg', name: 'The Sundbergs', city: 'Juneau' },
  { id: 'hh-okonkwo', name: 'The Okonkwos', city: 'Eagle River' },
  { id: 'hh-petrov', name: 'The Petrovs', city: 'Fairbanks' },
  { id: 'hh-whitfield', name: 'The Whitfields', city: 'Wasilla' },
  { id: 'hh-halvorsen', name: 'The Halvorsens', city: 'Homer' },
  { id: 'hh-chen', name: 'The Chens', city: 'Sitka' },
  { id: 'hh-kowalski', name: 'The Kowalskis', city: 'Palmer' },
];

export const members: Member[] = [
  // The Larsens: a two-member household, both current, both listed.
  { id: 'mem-erik-larsen', householdId: 'hh-larsen', name: 'Erik Larsen', email: 'erik.larsen@example.com', phone: '(907) 555-0142', directoryVisibility: 'visible', joined: '2015-04-02' },
  { id: 'mem-kaija-larsen', householdId: 'hh-larsen', name: 'Kaija Larsen', email: 'kaija.larsen@example.com', phone: '(907) 555-0143', directoryVisibility: 'visible', joined: '2015-04-02' },
  // A single-member household, current, partial directory listing.
  { id: 'mem-astrid-sundberg', householdId: 'hh-sundberg', name: 'Astrid Sundberg', email: 'astrid.sundberg@example.com', phone: '(907) 555-0187', directoryVisibility: 'partial', joined: '2019-06-11' },
  // Lapsed, hidden from the directory entirely.
  { id: 'mem-ada-okonkwo', householdId: 'hh-okonkwo', name: 'Ada Okonkwo', email: 'ada.okonkwo@example.com', phone: '(907) 555-0233', directoryVisibility: 'hidden', joined: '2012-03-19' },
  // The Petrovs: the multi-member household (four), spanning current, pending, and lapsed
  // standings across one family so the household card shows real variety.
  { id: 'mem-dimitri-petrov', householdId: 'hh-petrov', name: 'Dimitri Petrov', email: 'dimitri.petrov@example.com', phone: '(907) 555-0298', directoryVisibility: 'visible', joined: '2008-05-30' },
  { id: 'mem-yelena-petrov', householdId: 'hh-petrov', name: 'Yelena Petrov', email: 'yelena.petrov@example.com', phone: '(907) 555-0299', directoryVisibility: 'visible', joined: '2008-05-30' },
  { id: 'mem-nikolai-petrov', householdId: 'hh-petrov', name: 'Nikolai Petrov', email: 'nikolai.petrov@example.com', phone: '(907) 555-0301', directoryVisibility: 'partial', joined: '2022-05-01' },
  { id: 'mem-vera-petrova', householdId: 'hh-petrov', name: 'Vera Petrova', email: 'vera.petrova@example.com', phone: '(907) 555-0302', directoryVisibility: 'hidden', joined: '2008-05-30' },
  // The Whitfields: one current, one lapsed.
  { id: 'mem-tom-whitfield', householdId: 'hh-whitfield', name: 'Tom Whitfield', email: 'tom.whitfield@example.com', phone: '(907) 555-0410', directoryVisibility: 'hidden', joined: '2010-07-14' },
  { id: 'mem-carol-whitfield', householdId: 'hh-whitfield', name: 'Carol Whitfield', email: 'carol.whitfield@example.com', phone: '(907) 555-0411', directoryVisibility: 'visible', joined: '2010-07-14' },
  // Joined this season; the invoice went out but Stripe hasn't confirmed it yet, the
  // payment-pending case a brand-new member hits before their first renewal.
  { id: 'mem-bjorn-halvorsen', householdId: 'hh-halvorsen', name: 'Björn Halvorsen', email: 'bjorn.halvorsen@example.com', phone: '(907) 555-0522', directoryVisibility: 'visible', joined: '2026-03-01' },
  // The Chens: one current, one lapsed.
  { id: 'mem-mei-chen', householdId: 'hh-chen', name: 'Mei Chen', email: 'mei.chen@example.com', phone: '(907) 555-0630', directoryVisibility: 'partial', joined: '2017-09-09' },
  { id: 'mem-wei-chen', householdId: 'hh-chen', name: 'Wei Chen', email: 'wei.chen@example.com', phone: '(907) 555-0631', directoryVisibility: 'visible', joined: '2017-09-09' },
  // Lapsed for two seasons running, the club's longest-dormant member in this fixture.
  { id: 'mem-rosalind-kowalski', householdId: 'hh-kowalski', name: 'Rosalind Kowalski', email: 'rosalind.kowalski@example.com', phone: '(907) 555-0745', directoryVisibility: 'hidden', joined: '2006-05-05' },
];

export const memberships: Membership[] = [
  { id: 'ms-erik-larsen-2026', memberId: 'mem-erik-larsen', season: 2026 },
  { id: 'ms-erik-larsen-2025', memberId: 'mem-erik-larsen', season: 2025 },
  { id: 'ms-erik-larsen-2024', memberId: 'mem-erik-larsen', season: 2024 },
  { id: 'ms-kaija-larsen-2026', memberId: 'mem-kaija-larsen', season: 2026 },
  { id: 'ms-kaija-larsen-2025', memberId: 'mem-kaija-larsen', season: 2025 },
  { id: 'ms-kaija-larsen-2024', memberId: 'mem-kaija-larsen', season: 2024 },
  { id: 'ms-astrid-sundberg-2026', memberId: 'mem-astrid-sundberg', season: 2026 },
  { id: 'ms-astrid-sundberg-2025', memberId: 'mem-astrid-sundberg', season: 2025 },
  // Ada's last paid season was 2024; no 2025 or 2026 row at all, so she reads as lapsed.
  { id: 'ms-ada-okonkwo-2024', memberId: 'mem-ada-okonkwo', season: 2024 },
  { id: 'ms-ada-okonkwo-2023', memberId: 'mem-ada-okonkwo', season: 2023 },
  { id: 'ms-dimitri-petrov-2026', memberId: 'mem-dimitri-petrov', season: 2026 },
  { id: 'ms-dimitri-petrov-2025', memberId: 'mem-dimitri-petrov', season: 2025 },
  { id: 'ms-dimitri-petrov-2024', memberId: 'mem-dimitri-petrov', season: 2024 },
  { id: 'ms-yelena-petrov-2026', memberId: 'mem-yelena-petrov', season: 2026 },
  { id: 'ms-yelena-petrov-2025', memberId: 'mem-yelena-petrov', season: 2025 },
  { id: 'ms-yelena-petrov-2024', memberId: 'mem-yelena-petrov', season: 2024 },
  // Nikolai's 2026 invoice is out but unpaid: the season's other payment-pending member.
  { id: 'ms-nikolai-petrov-2026', memberId: 'mem-nikolai-petrov', season: 2026 },
  { id: 'ms-nikolai-petrov-2025', memberId: 'mem-nikolai-petrov', season: 2025 },
  { id: 'ms-vera-petrova-2025', memberId: 'mem-vera-petrova', season: 2025 },
  { id: 'ms-vera-petrova-2024', memberId: 'mem-vera-petrova', season: 2024 },
  { id: 'ms-tom-whitfield-2025', memberId: 'mem-tom-whitfield', season: 2025 },
  { id: 'ms-tom-whitfield-2024', memberId: 'mem-tom-whitfield', season: 2024 },
  { id: 'ms-carol-whitfield-2026', memberId: 'mem-carol-whitfield', season: 2026 },
  { id: 'ms-carol-whitfield-2025', memberId: 'mem-carol-whitfield', season: 2025 },
  { id: 'ms-carol-whitfield-2024', memberId: 'mem-carol-whitfield', season: 2024 },
  // Björn's only season so far: this year, invoiced, not yet paid.
  { id: 'ms-bjorn-halvorsen-2026', memberId: 'mem-bjorn-halvorsen', season: 2026 },
  { id: 'ms-mei-chen-2026', memberId: 'mem-mei-chen', season: 2026 },
  { id: 'ms-mei-chen-2025', memberId: 'mem-mei-chen', season: 2025 },
  { id: 'ms-mei-chen-2024', memberId: 'mem-mei-chen', season: 2024 },
  { id: 'ms-wei-chen-2025', memberId: 'mem-wei-chen', season: 2025 },
  { id: 'ms-wei-chen-2024', memberId: 'mem-wei-chen', season: 2024 },
  { id: 'ms-rosalind-kowalski-2024', memberId: 'mem-rosalind-kowalski', season: 2024 },
  { id: 'ms-rosalind-kowalski-2023', memberId: 'mem-rosalind-kowalski', season: 2023 },
];

export const payments: Payment[] = [
  { id: 'pay-erik-larsen-2026', membershipId: 'ms-erik-larsen-2026', amount: 85, status: 'paid', paidDate: '2026-01-14', stripePaymentLinkId: 'plink_8f2a1c' },
  { id: 'pay-erik-larsen-2025', membershipId: 'ms-erik-larsen-2025', amount: 80, status: 'paid', paidDate: '2025-01-09', stripePaymentLinkId: 'plink_5b9e3d' },
  { id: 'pay-erik-larsen-2024', membershipId: 'ms-erik-larsen-2024', amount: 75, status: 'paid', paidDate: '2024-01-11', stripePaymentLinkId: 'plink_2c7f40' },
  { id: 'pay-kaija-larsen-2026', membershipId: 'ms-kaija-larsen-2026', amount: 85, status: 'paid', paidDate: '2026-01-14', stripePaymentLinkId: 'plink_9a3e21' },
  { id: 'pay-kaija-larsen-2025', membershipId: 'ms-kaija-larsen-2025', amount: 80, status: 'paid', paidDate: '2025-01-09', stripePaymentLinkId: 'plink_6c1f52' },
  { id: 'pay-kaija-larsen-2024', membershipId: 'ms-kaija-larsen-2024', amount: 75, status: 'paid', paidDate: '2024-01-11', stripePaymentLinkId: 'plink_3d8061' },
  { id: 'pay-astrid-sundberg-2026', membershipId: 'ms-astrid-sundberg-2026', amount: 85, status: 'paid', paidDate: '2026-02-02', stripePaymentLinkId: 'plink_7e4b93' },
  { id: 'pay-astrid-sundberg-2025', membershipId: 'ms-astrid-sundberg-2025', amount: 80, status: 'paid', paidDate: '2025-01-28', stripePaymentLinkId: 'plink_4f2c84' },
  { id: 'pay-ada-okonkwo-2024', membershipId: 'ms-ada-okonkwo-2024', amount: 75, status: 'paid', paidDate: '2024-03-05', stripePaymentLinkId: 'plink_1a9d75' },
  { id: 'pay-ada-okonkwo-2023', membershipId: 'ms-ada-okonkwo-2023', amount: 70, status: 'paid', paidDate: '2023-03-01', stripePaymentLinkId: 'plink_0e8c66' },
  { id: 'pay-dimitri-petrov-2026', membershipId: 'ms-dimitri-petrov-2026', amount: 85, status: 'paid', paidDate: '2026-01-06', stripePaymentLinkId: 'plink_2b7a57' },
  { id: 'pay-dimitri-petrov-2025', membershipId: 'ms-dimitri-petrov-2025', amount: 80, status: 'paid', paidDate: '2025-01-05', stripePaymentLinkId: 'plink_9c6b48' },
  { id: 'pay-dimitri-petrov-2024', membershipId: 'ms-dimitri-petrov-2024', amount: 75, status: 'paid', paidDate: '2024-01-08', stripePaymentLinkId: 'plink_5d4a39' },
  { id: 'pay-yelena-petrov-2026', membershipId: 'ms-yelena-petrov-2026', amount: 85, status: 'paid', paidDate: '2026-01-06', stripePaymentLinkId: 'plink_8e3b20' },
  { id: 'pay-yelena-petrov-2025', membershipId: 'ms-yelena-petrov-2025', amount: 80, status: 'paid', paidDate: '2025-01-05', stripePaymentLinkId: 'plink_6f2c11' },
  { id: 'pay-yelena-petrov-2024', membershipId: 'ms-yelena-petrov-2024', amount: 75, status: 'paid', paidDate: '2024-01-08', stripePaymentLinkId: 'plink_3a1d02' },
  { id: 'pay-nikolai-petrov-2026', membershipId: 'ms-nikolai-petrov-2026', amount: 85, status: 'pending', paidDate: null, stripePaymentLinkId: 'plink_7b9e93' },
  { id: 'pay-nikolai-petrov-2025', membershipId: 'ms-nikolai-petrov-2025', amount: 80, status: 'paid', paidDate: '2025-04-19', stripePaymentLinkId: 'plink_4c8f84' },
  { id: 'pay-vera-petrova-2025', membershipId: 'ms-vera-petrova-2025', amount: 80, status: 'paid', paidDate: '2025-01-15', stripePaymentLinkId: 'plink_1d7075' },
  { id: 'pay-vera-petrova-2024', membershipId: 'ms-vera-petrova-2024', amount: 75, status: 'paid', paidDate: '2024-01-17', stripePaymentLinkId: 'plink_9e6166' },
  { id: 'pay-tom-whitfield-2025', membershipId: 'ms-tom-whitfield-2025', amount: 80, status: 'paid', paidDate: '2025-02-11', stripePaymentLinkId: 'plink_6a5257' },
  { id: 'pay-tom-whitfield-2024', membershipId: 'ms-tom-whitfield-2024', amount: 75, status: 'paid', paidDate: '2024-02-09', stripePaymentLinkId: 'plink_3b4148' },
  { id: 'pay-carol-whitfield-2026', membershipId: 'ms-carol-whitfield-2026', amount: 85, status: 'paid', paidDate: '2026-01-20', stripePaymentLinkId: 'plink_0c3039' },
  { id: 'pay-carol-whitfield-2025', membershipId: 'ms-carol-whitfield-2025', amount: 80, status: 'paid', paidDate: '2025-01-18', stripePaymentLinkId: 'plink_8d1f20' },
  { id: 'pay-carol-whitfield-2024', membershipId: 'ms-carol-whitfield-2024', amount: 75, status: 'paid', paidDate: '2024-01-16', stripePaymentLinkId: 'plink_5e0e11' },
  { id: 'pay-bjorn-halvorsen-2026', membershipId: 'ms-bjorn-halvorsen-2026', amount: 85, status: 'pending', paidDate: null, stripePaymentLinkId: 'plink_2f9d02' },
  { id: 'pay-mei-chen-2026', membershipId: 'ms-mei-chen-2026', amount: 85, status: 'paid', paidDate: '2026-01-30', stripePaymentLinkId: 'plink_9a8c93' },
  { id: 'pay-mei-chen-2025', membershipId: 'ms-mei-chen-2025', amount: 80, status: 'paid', paidDate: '2025-01-27', stripePaymentLinkId: 'plink_6b7b84' },
  { id: 'pay-mei-chen-2024', membershipId: 'ms-mei-chen-2024', amount: 75, status: 'paid', paidDate: '2024-01-25', stripePaymentLinkId: 'plink_3c6a75' },
  { id: 'pay-wei-chen-2025', membershipId: 'ms-wei-chen-2025', amount: 80, status: 'paid', paidDate: '2025-01-27', stripePaymentLinkId: 'plink_0d5966' },
  { id: 'pay-wei-chen-2024', membershipId: 'ms-wei-chen-2024', amount: 75, status: 'paid', paidDate: '2024-01-25', stripePaymentLinkId: 'plink_7e4857' },
  { id: 'pay-rosalind-kowalski-2024', membershipId: 'ms-rosalind-kowalski-2024', amount: 75, status: 'paid', paidDate: '2024-04-02', stripePaymentLinkId: 'plink_4f3748' },
  { id: 'pay-rosalind-kowalski-2023', membershipId: 'ms-rosalind-kowalski-2023', amount: 70, status: 'paid', paidDate: '2023-04-01', stripePaymentLinkId: 'plink_1a2639' },
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

/** A member's membership rows, most recent season first: exactly the order the detail page's
 *  timeline renders in. */
export function getMembershipsForMember(memberId: string): Membership[] {
  return memberships.filter((membership) => membership.memberId === memberId).sort((a, b) => b.season - a.season);
}

export function getPaymentForMembership(membershipId: string): Payment | undefined {
  return payments.find((payment) => payment.membershipId === membershipId);
}

/**
 * A member's standing for {@link CURRENT_SEASON}: `current` if this season's membership is
 * paid, `pending` if it's invoiced but not yet paid, `lapsed` if there's no membership row for
 * this season at all (the member simply hasn't renewed).
 */
export function standingForMember(memberId: string): SeasonStanding {
  const currentSeasonMembership = memberships.find(
    (membership) => membership.memberId === memberId && membership.season === CURRENT_SEASON,
  );
  if (!currentSeasonMembership) return 'lapsed';
  const payment = getPaymentForMembership(currentSeasonMembership.id);
  return payment?.status === 'paid' ? 'current' : 'pending';
}
