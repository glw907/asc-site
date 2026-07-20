// The one source of truth for the admin shell's three pending-work counts (pass-B sidebar-build
// T7, docs/2026-07-18-admin-sidebar-2-design.md decision 7: "Counts share the Overview
// needs-attention strip's sources so the two never disagree"). Both
// `src/routes/admin/club/+page.server.ts` (the Overview strip) and `src/chassis/cairn.server.ts`'s
// `attention` dependency (the nav badges) call `loadAttentionCounts`, so the strip and the badges
// read the same query results instead of two independent copies that could drift.
//
// Lives in $theme, not $admin-club/lib: `loadAttentionCounts` reads `listPendingAssetRequests`
// from `$member-portal/lib/assets` (the admin asset-request inbox lives there, alongside the
// portal's own household-scoped asset reads -- see that module's own header), and svelte.config.js
// documents `$member-portal` as built ON TOP OF `$admin-club`'s data-access layer. `$admin-club/lib`
// itself must never import back from `$member-portal`, so this module lives one layer up, in
// `$theme`, which already bridges chassis to site-specific admin logic the same way
// (`nav-defaults.ts`, wired into `cairn.server.ts` beside this module). `attentionItemsFor` below
// is that same bridge's other half: `cairn.server.ts` has only ever imported `$theme` (never
// `$admin-club` directly, per `src/chassis/README.md`'s "a theme file reaches chassis only
// through its exported seams" boundary read in the chassis-to-site direction too), so it resolves
// `CLUB_DB` and builds the engine's `AttentionItem[]` here rather than reaching into
// `$admin-club/lib/club-db.ts` itself.
import type { D1Database } from '@cloudflare/workers-types';
import type { AttentionItem } from '@glw907/cairn-cms/sveltekit';
import { listPendingAssetRequests } from '$member-portal/lib/assets';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { listClassesWithCounts } from '$admin-club/lib/classes-store';
import { listOutstandingOffers, toSqliteDatetime } from '$admin-club/lib/offers';
import { countPendingCommitteeMembers } from '$admin-club/lib/committees-store';
import { resolveClubDb } from '$admin-club/lib/club-db';

/** Offers nearing expiry: unresolved, expiring within this many hours -- the Overview strip's own
 *  pre-T7 early-warning window, unchanged and reused as-is so the strip and the badge agree on the
 *  same window. */
const NEAR_EXPIRY_HOURS = 24;

/** The three ruled attention sources (design decision 7), each also one of the Overview strip's
 *  own cards and one nav entry's badge (`href`s match `src/theme/cairn.config.ts`'s `navLayout`
 *  exactly: `/admin/club/asset-requests`, `/admin/club/committees`, `/admin/club/classes/waitlist`).
 *
 *  Confidentiality invariant (pass-B security review): the engine drops an item only when the
 *  session's resolved nav cannot see its `href`, and an href the access map has NO rule for is
 *  visible to every editor capability. Every href returned here must therefore stay covered by an
 *  access-map key (today all three inherit `/admin/club`); an unmapped href would leak its count
 *  to every editor. */
export interface AttentionCounts {
  /** Pending asset requests awaiting a decision. */
  pendingAssetRequests: number;
  /** Pending committee join requests, club-wide -- see `countPendingCommitteeMembers`'s own
   *  header (`$admin-club/lib/committees-store.ts`) for why no chair-only scope narrows this for
   *  an admin editor session. */
  pendingCommitteeRequests: number;
  /** Offers nearing expiry plus classes with a freed seat and no active offer out to fill it --
   *  see {@link countFreedSeatsAwaitingOffer}'s own header for the exact rule. */
  classWaitlistAttention: number;
}

/**
 * How many current-season classes have a free seat (`!isFull`) and at least one queued waitlist
 * entry with no active offer out to claim it: the same "freed seat with a waitlist behind it"
 * state `/admin/club/classes/waitlist`'s own load flags per row (`freedSeatNoOffer`), counted here
 * at the class level rather than the per-entry level that screen's fuller listing needs. The two
 * agree: `offers.ts`'s `activeOfferForWaitlist` refuses a second active offer for the same
 * waitlist entry, so a class's queued count exceeds its active-offer count exactly when at least
 * one queued entry has none -- the same fact `entries.some((e) => e.activeOffer === null)` checks
 * per row there.
 *
 * Deliberately does not sweep stale offers first, unlike that screen's own load: this read runs
 * inside the `attention` dependency, awaited fresh on EVERY `/admin/**` shell load (every admin
 * page view, not just a visit to the waitlist screen itself), and sweeping there would write an
 * `audit_log` row for every stale offer on every such view. Instead this excludes a not-yet-swept
 * stale offer by its own `expiresAt` in the read, the same conservative trade `offers.ts`'s
 * `hasActiveOfferForClass` already documents: an unswept stale row still reads as "active" for the
 * brief window before something else sweeps it, which can only ever under-count a freed seat here,
 * never over-count one.
 */
async function countFreedSeatsAwaitingOffer(db: D1Database, nowSqlite: string): Promise<number> {
  const [season, classes, outstandingOffers] = await Promise.all([
    getCurrentSeason(db),
    listClassesWithCounts(db),
    listOutstandingOffers(db),
  ]);
  const activeOfferCountByClass = new Map<string, number>();
  for (const offer of outstandingOffers) {
    if (offer.expiresAt <= nowSqlite) continue;
    activeOfferCountByClass.set(offer.classId, (activeOfferCountByClass.get(offer.classId) ?? 0) + 1);
  }
  return classes.filter(
    (cls) => cls.season === season && !cls.isFull && cls.waitlistCount > (activeOfferCountByClass.get(cls.id) ?? 0),
  ).length;
}

/**
 * The three ruled attention counts, read fresh every call (never cached): the Overview strip's own
 * load and `cairn.server.ts`'s `attention` dependency both call this one function, so the strip's
 * cards and the sidebar badges can never disagree.
 */
export async function loadAttentionCounts(db: D1Database): Promise<AttentionCounts> {
  const now = new Date();
  const soon = new Date(now.getTime() + NEAR_EXPIRY_HOURS * 60 * 60 * 1000);
  const nowSqlite = toSqliteDatetime(now);

  const [pendingRequests, nearExpiryRow, pendingCommitteeRequests, freedSeats] = await Promise.all([
    listPendingAssetRequests(db),
    db
      .prepare('SELECT COUNT(*) AS n FROM class_offers WHERE resolved IS NULL AND expires_at > ?1 AND expires_at <= ?2')
      .bind(nowSqlite, toSqliteDatetime(soon))
      .first<{ n: number }>(),
    countPendingCommitteeMembers(db),
    countFreedSeatsAwaitingOffer(db, nowSqlite),
  ]);

  return {
    pendingAssetRequests: pendingRequests.length,
    pendingCommitteeRequests,
    classWaitlistAttention: (nearExpiryRow?.n ?? 0) + freedSeats,
  };
}

/**
 * `cairn.server.ts`'s `attention` dependency, in full: resolve `CLUB_DB` off the platform env
 * (an unbound database degrades to no items, matching every other Club load's own missing-binding
 * posture), read {@link loadAttentionCounts}, and shape the three ruled sources (design decision
 * 7) into the engine's own `AttentionItem[]`. `href`s match `cairn.config.ts`'s `navLayout`
 * exactly; a `label` is supplied for every item since the engine's own default ("pending items")
 * is generic across all three.
 */
export async function attentionItemsFor(env: unknown): Promise<AttentionItem[]> {
  const db = resolveClubDb(env);
  if (!db) return [];
  const counts = await loadAttentionCounts(db);
  return [
    { href: '/admin/club/asset-requests', count: counts.pendingAssetRequests, label: 'pending asset requests' },
    { href: '/admin/club/committees', count: counts.pendingCommitteeRequests, label: 'pending committee join requests' },
    { href: '/admin/club/classes/waitlist', count: counts.classWaitlistAttention, label: 'class waitlist items needing attention' },
  ];
}
