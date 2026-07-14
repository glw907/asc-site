// MembershipPricing.svelte's own pure render text (Task 3): factored out so it is unit-testable
// without the island runtime, the same `*-data.ts` split `class-schedule-data.ts` already
// establishes for a hydrated island's derivation logic.
import { formatDollars } from '$admin-club/lib/ui';
import type { MembershipTier } from '$admin-club/lib/member-types';

/**
 * The tier's current settings price, formatted the same way every other dollar figure on the
 * site is (`ui.ts`'s own `formatDollars`): the design's own "so a settings change can never
 * strand the prose again" rule depends on this being the ONLY place a tier's price turns into
 * display text, never a hand-typed dollar sign in markdown.
 */
export function formatTierPrice(prices: Record<MembershipTier, number>, tier: MembershipTier): string {
  return formatDollars(prices[tier] ?? null);
}
