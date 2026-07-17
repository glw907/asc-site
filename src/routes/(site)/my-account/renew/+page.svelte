<!-- @component
/my-account/renew: the renewal door (T2c of the portal redesign pass, decisions.md's own "the
renewal door" ruling). The masthead's fireweed CTA links here instead of posting a hidden tier
field, so the household sees its current tier and price plainly, and the other tiers at their real
settings prices, before committing to a purchase. Handles every standing shape the masthead can
send it (current-but-in-window, grace, lapsed, no-membership-on-file) by reading straight off
`standing.statusLine`/`standing.tier`, the same plain-words, no-alarm-color sentence the masthead
itself shows -- no separate per-status copy branches to keep in sync.

The submit button stays NAVY, not fireweed: the redesign's own binding constraint reserves
fireweed for the masthead's renewal-window link alone ("nowhere else, ever"), so the actual
money-committing step here reads the same as every other portal payment action
(`ActionRow.svelte`'s own "money actions on this landing render NAVY" precedent). -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import type { MembershipTier } from '$member-auth/lib/standing';
  import { formatMemberCents } from '$member-auth/lib/format';
  import { untrack } from 'svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // `load`'s full branch (a real session AND a resolved CLUB_DB binding) sets `standing`,
  // `currentSeason`, and `tiers` together; the db-missing branch sets none of them. The generated
  // `PageData` union loses that correlation per field (this repo's own established lesson, see
  // `/my-account/+page.svelte`'s own `isFullPortalData`), so one type predicate re-asserts it here.
  type FullRenewData = PageData & {
    standing: NonNullable<PageData['standing']>;
    currentSeason: NonNullable<PageData['currentSeason']>;
    renewalSeason: NonNullable<PageData['renewalSeason']>;
    tiers: NonNullable<PageData['tiers']>;
  };
  function isFullRenewData(d: PageData): d is FullRenewData {
    return d.tiers !== null;
  }

  let selectedTier = $state<MembershipTier>(untrack(() => data.standing?.tier ?? 'individual'));

  /** Tier prices are stored in DOLLARS (`settings.tier_price_*`), while the portal's one
   *  member-facing money formatter takes cents, so the price crosses to cents here rather than
   *  growing a second formatter. The live prices are all whole today (250/500/100), but
   *  `setTierPrice` accepts any number: a bare `dollars.toLocaleString()` would print a $247.50
   *  tier as "$247.5" on the one screen where a member commits to a price. */
  function formatTierPrice(dollars: number): string {
    return formatMemberCents(Math.round(dollars * 100));
  }
</script>

<svelte:head>
  <title>Renew · My Account · {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="portal-back-link">&larr; My account</a>

<h1 class="portal-page-title">Renew your membership</h1>
<p class="mt-s max-w-measure-wide text-step-0 text-muted">
  {data.standing?.statusLine ?? 'No membership on file yet.'}
</p>

{#if !isFullRenewData(data)}
  <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
    This isn't available right now. Please try again shortly.
  </p>
{:else}
  <form method="POST" action="?/renew" class="mt-l max-w-measure-wide">
    <input type="hidden" name="csrf" value={data.csrf} />

    <fieldset class="fieldset">
      <legend class="fieldset-legend portal-field-label">Membership tier</legend>
      <div class="renew-tiers">
        {#each data.tiers as option (option.tier)}
          <label class="renew-tier-row" class:renew-tier-row-selected={selectedTier === option.tier}>
            <input
              type="radio"
              class="radio"
              name="tier"
              value={option.tier}
              checked={selectedTier === option.tier}
              onchange={() => (selectedTier = option.tier)}
            />
            <span class="renew-tier-text">
              <span class="renew-tier-name">
                {option.label}
                {#if data.standing.tier === option.tier}<span class="asc-availability-chip">Current plan</span>{/if}
              </span>
              <span class="renew-tier-price">{formatTierPrice(option.priceDollars)} / season</span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <button type="submit" class="btn btn-primary mt-m">Renew for {data.renewalSeason} season</button>

    {#if form && 'renewStubbed' in form && form.renewStubbed}
      <p class="mt-xs mb-0 text-step--1 text-base-content">
        Online payment isn't available yet; the club will follow up by email with how to pay.
      </p>
    {/if}
    {#if form && 'error' in form && form.error}
      <p class="mt-xs mb-0 text-step--1 text-error">{form.error}</p>
    {/if}
  </form>
{/if}

<style>
  /* One bordered row per tier, radio-first (the label's own `for`-less click target is the whole
     row via the wrapping `<label>`): a real 44px+ tap target throughout, since this is a money
     screen and mobile is co-primary. Selection reads through a primary-tinted border and a faint
     wash rather than color alone (a screen reader and a color-blind member both still have the
     radio's own checked state). */
  .renew-tiers {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
  }
  .renew-tier-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-s);
    min-height: 2.75rem;
    padding: var(--spacing-s) var(--spacing-m);
    border: 1px solid var(--color-card-border);
    border-radius: var(--radius-box);
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .renew-tier-row:hover {
    border-color: color-mix(in oklab, var(--color-primary) 40%, var(--color-card-border));
  }
  .renew-tier-row-selected {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-primary) 6%, var(--color-base-100));
  }
  .renew-tier-text {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--spacing-2xs) var(--spacing-s);
  }
  .renew-tier-name {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2xs);
    font-weight: 600;
    color: var(--color-base-content);
  }
  .renew-tier-price {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    color: var(--color-muted);
  }
</style>
