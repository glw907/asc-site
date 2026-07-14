// The Club section's Money & Renewals screen (Task 7, docs/plans/2026-07-14-membership-admin.md):
// the season-flat companion to the household-grouped Members screen, per the design doc's own
// screen-shape ruling. Every read comes off `money-store.ts`'s own Task 3 functions, all scoped by
// `season` -- the four stat tiles, the renewal-candidate and attention lists, and the recent-
// transactions list all read `getCurrentSeason(db)` (the settings' own truth of "this season"),
// while the season-flat memberships table alone takes its own `?season=` URL param (defaulting to
// the current season) since it is the one block the design doc's own season-picker applies to.
//
// The one write action, `recordPayment`, mirrors the household desk's own action
// (`members/[id]/+page.server.ts`) column for column, with one difference: the household comes
// from a form field (a picker over every household, per the design doc's own "household picker +
// the Task 5 form"), not the route's own `id` param, since this screen has no single household in
// its URL. Refunds are NOT re-implemented here: the design doc names this Task 6's refund action
// "reused or linked to the desk", and every refundable row on this screen already carries a link to
// its own household desk, where the refund dialog lives -- duplicating that form here would be two
// refund implementations to keep in sync for no reader benefit.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { getCurrentSeason, getTierPrices } from '$admin-club/lib/club-settings';
import { listHouseholds, type HouseholdListRow } from '$admin-club/lib/households-store';
import {
  getMoneyOverview,
  listAttentionItems,
  listRecentTransactions,
  listRenewalCandidates,
  listSeasonMemberships,
  type AttentionRow,
  type MoneyOverview,
  type RenewalCandidateRow,
  type SeasonMembershipRow,
  type TimelineTransaction,
} from '$admin-club/lib/money-store';
import { buildManualMembershipPayment, type ManualPaymentSource } from '$admin-club/lib/manual-payment';
import type { MembershipTier } from '$admin-club/lib/member-types';

/** How many of the most recent ledger transactions the screen shows and, on a `recordPayment`-
 *  adjacent refund click, the desk link routes to: generous enough that anything this screen ever
 *  displays a refund link for is a row the household desk's own timeline will still show too. */
const RECENT_TRANSACTIONS_LIMIT = 30;

function emptyLoad(currentSeason: number, error: string) {
  return {
    overview: { currentHouseholds: 0, totalHouseholds: 0, duesCollected: 0, renewalCandidates: 0, attentionCount: 0 } as MoneyOverview,
    renewalCandidates: [] as RenewalCandidateRow[],
    attentionItems: [] as AttentionRow[],
    seasonMemberships: [] as SeasonMembershipRow[],
    recentTransactions: [] as TimelineTransaction[],
    households: [] as HouseholdListRow[],
    tierPrices: null as Record<MembershipTier, number> | null,
    currentSeason,
    selectedSeason: currentSeason,
    error,
  };
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) return emptyLoad(new Date().getUTCFullYear(), 'CLUB_DB is not bound.');

  const currentSeason = await getCurrentSeason(db);
  const seasonParam = Number(event.url.searchParams.get('season'));
  const selectedSeason = Number.isInteger(seasonParam) && seasonParam > 0 ? seasonParam : currentSeason;

  const [overview, renewalCandidates, attentionItems, seasonMemberships, recentTransactions, households, tierPrices] = await Promise.all([
    getMoneyOverview(db, currentSeason),
    listRenewalCandidates(db, currentSeason),
    listAttentionItems(db, currentSeason),
    listSeasonMemberships(db, selectedSeason),
    listRecentTransactions(db, RECENT_TRANSACTIONS_LIMIT),
    listHouseholds(db, {}),
    getTierPrices(db),
  ]);

  return {
    overview,
    renewalCandidates,
    attentionItems,
    seasonMemberships,
    recentTransactions,
    households,
    tierPrices,
    currentSeason,
    selectedSeason,
    error: null as string | null,
  };
};

const DENIED_MESSAGE = 'A club role is required to manage membership money.';

function requiredField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const actions: Actions = {
  recordPayment: clubAdminAction(
    async ({ form, ctx }) => {
      const householdId = requiredField(form, 'householdId');
      const seasonRaw = requiredField(form, 'season');
      const amountRaw = requiredField(form, 'amount');
      const tier = form.get('tier');
      const source = form.get('source');
      const memo = optionalField(form, 'memo');
      const season = seasonRaw ? Number(seasonRaw) : NaN;
      const amountDollars = amountRaw ? Number(amountRaw) : NaN;
      const validTier = tier === 'individual' || tier === 'family' || tier === 'young-adult';
      const validSource = source === 'check' || source === 'cash' || source === 'comp';
      if (!householdId || !Number.isInteger(season) || !validTier || !Number.isFinite(amountDollars) || amountDollars < 0 || !validSource) {
        ctx.audit({ action: 'record-payment', entity: 'transaction', detail: 'rejected: invalid input' });
        return fail(400, { error: 'A household, season, tier, non-negative amount, and source are all required.' });
      }
      const result = await buildManualMembershipPayment(ctx.db, {
        householdId,
        season,
        tier: tier as MembershipTier,
        amountCents: Math.round(amountDollars * 100),
        source: source as ManualPaymentSource,
        memo,
      });
      if (!result.ok) {
        ctx.audit({ action: 'record-payment', entity: 'transaction', entityId: householdId, detail: `rejected: ${result.error}` });
        return fail(400, { error: result.error });
      }
      await ctx.db.batch(result.statements);
      ctx.audit({ action: 'record-payment', entity: 'transaction', entityId: result.membershipId, detail: `household=${householdId} season=${season}` });
      return { ok: true };
    },
    { action: 'record-payment', entity: 'transaction', deniedMessage: DENIED_MESSAGE },
  ),
};
