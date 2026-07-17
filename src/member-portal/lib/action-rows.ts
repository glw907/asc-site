// The member portal landing's own "Needs your attention" derivation (T2 of the portal redesign
// pass, docs/2026-07-16-portal-redesign-design.md): the weighted action rows mock D's main column
// shows -- icon, title, an optional dollar amount, and a real action -- built from data the
// caller already loaded (`listHouseholdAssignments`, `listHouseholdRequests`,
// `listMyWaitlistEntries`), never a database read of its own, matching `portal-state.ts`'s own
// pure/injected-data shape. `portalState`'s own `hasWeightedActionRows` argument is this
// function's result, filtered to `.length > 0`.
//
// Deliberately excludes an expiring standing: the masthead's fireweed renew CTA is that signal's
// own home (the design doc's binding precedence, "the only fireweed on the page, ever"), so
// surfacing it a second time here would duplicate the same fact in two places on the same screen.
import type { HouseholdAssignmentRow, HouseholdRequestRow } from './assets';
import type { MyWaitlistRow } from './classes';

/** One weighted action row: `formAction` is a route-relative SvelteKit action path. A row with no
 *  outstanding dollar amount (a live class-waitlist offer) carries `amountCents: null`, so the
 *  template omits the amount slot rather than rendering `$0`. */
export interface ActionRow {
  id: string;
  title: string;
  amountCents: number | null;
  actionLabel: string;
  formAction: string;
  fieldName: 'assignmentId' | 'requestId' | 'waitlistId';
  fieldValue: string;
}

/** {@link buildActionRows}'s own inputs, each already loaded by the caller. */
export interface ActionRowsArgs {
  /** The household's currently-held assets; only `paymentStanding === 'outstanding'` rows become
   *  a row (`getPayableAssignmentFee` re-verifies the amount server-side before ever building a
   *  Checkout Session, so this display amount is informational only). */
  assignments: HouseholdAssignmentRow[];
  /** The household's asset requests; only `status === 'approved_awaiting_payment'` rows become a
   *  row (a merely `'pending'` request has nothing to pay yet, and every other status is already
   *  resolved). */
  requests: HouseholdRequestRow[];
  /** The household's class waitlist entries; only a row carrying a live `offer` becomes a row. */
  waitlistEntries: MyWaitlistRow[];
}

/**
 * The landing's ordered action rows: a live class-waitlist offer first (the design doc's own "the
 * most urgent thing a member can have," since it expires), then an outstanding asset fee, then an
 * approved-and-awaiting-payment asset request. Returns an empty array when there is nothing real
 * to act on, never a placeholder row (the all-clear moment is the template's own job for that).
 */
export function buildActionRows(args: ActionRowsArgs): ActionRow[] {
  const rows: ActionRow[] = [];

  for (const entry of args.waitlistEntries) {
    if (!entry.offer) continue;
    rows.push({
      id: `offer-${entry.waitlistId}`,
      title: `${entry.className}: a spot opened up`,
      amountCents: null,
      actionLabel: 'Claim spot',
      formAction: '/my-account/classes?/claimOffer',
      fieldName: 'waitlistId',
      fieldValue: entry.waitlistId,
    });
  }

  for (const assignment of args.assignments) {
    if (assignment.paymentStanding !== 'outstanding') continue;
    rows.push({
      id: `asset-fee-${assignment.id}`,
      title: `${assignment.assetTypeName} fee outstanding`,
      amountCents: assignment.feeCents,
      actionLabel: 'Pay now',
      formAction: '?/payAssetFee',
      fieldName: 'assignmentId',
      fieldValue: assignment.id,
    });
  }

  for (const request of args.requests) {
    if (request.status !== 'approved_awaiting_payment') continue;
    rows.push({
      id: `request-fee-${request.id}`,
      title: `${request.assetTypeName} request approved`,
      amountCents: Math.round(request.fee * 100),
      actionLabel: 'Pay now',
      formAction: '?/payRequest',
      fieldName: 'requestId',
      fieldValue: request.id,
    });
  }

  return rows;
}
