<!--
@component
The Club section's Member detail (Part B): a two-pane read, sized to what the club actually needs
per record, not a CRM's forty-field wall. The pane split (`grid-cols-1 lg:grid-cols-3`, identity
as the one-column card, activity as the two-column card) is the shape a Stripe-style record page
and the community DaisyUI templates both converge on for "essentials up front, the long tail
behind the second pane" (see docs/internal/daisyui-v5-hard-components.md). The activity pane
mixes two different facts on purpose, oldest to newest reversed: the HOUSEHOLD's membership and
payment history (a Member never has its own Membership; see demo-members.ts's design choice 2)
and its class-credit redemptions, using DaisyUI's native `timeline` component rather than a
hand-rolled list. Paid/pending rides the colored `<hr>` spine and the middle marker, always
paired with visible text (color alone is never the only signal); a redemption entry uses a
neutral primary marker, since spending an already-granted credit is neither a payment success
nor a thing to warn about. The standing summary reuses the timeline's own success/warning color
language in a `stats` block, deliberately a different palette from the list screen's own
primary/warning/ghost chip vocabulary: the list's chips answer "what state is this row in, at a
glance, among many rows", while the timeline and its summary answer "was this season's payment
good", the same green/amber a Stripe-adjacent record page already trains a volunteer to read.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { HEADER_CELL, formatCivilDate, formatDollars } from '$admin-club/lib/ui';
  import { SEGMENT_CHIP, VISIBILITY_CHIP, TIER_LABEL } from '$admin-club/lib/member-format';

  let { data }: { data: PageData } = $props();

  const cardCls = 'rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 shadow-[var(--cairn-shadow)]';

  /** The timeline and stats color language: success for paid/current, warning for pending, and
   *  the muted ink for lapsed (there is nothing to warn about in a season that simply passed). */
  function standingTextCls(segment: 'current' | 'pending' | 'lapsed' | 'archived'): string {
    if (segment === 'current') return 'text-success';
    if (segment === 'pending') return 'text-warning';
    return 'text-muted';
  }
</script>

<a
  href="/admin/club/members"
  class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary"
>
  <span aria-hidden="true">&larr;</span> Back to Members
</a>

{#if !data.member}
  <div class="{cardCls} py-10 text-center">
    <p class="text-sm text-muted">No such member. They may have left the club, or this link is stale.</p>
  </div>
{:else}
  {@const visibility = VISIBILITY_CHIP[data.member.directoryVisibility]}
  {@const segment = SEGMENT_CHIP[data.segment]}
  {@const displayStanding = data.currentSeasonPaymentStatus === 'pending' && data.segment === 'current' ? 'pending' : data.segment}
  <header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex flex-col gap-0.5">
      <span class={HEADER_CELL}>Club</span>
      <h1 class="text-2xl font-bold tracking-tight font-[family-name:var(--font-display)]">{data.member.name}</h1>
      <p class="text-sm text-muted">
        {data.household ? `${data.household.name}, ${data.household.city}` : 'No household on file'}
        {#if data.isPrimary}&middot; Household primary{/if}
      </p>
    </div>
    <span class="badge {visibility.cls}">{visibility.label}</span>
  </header>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <!-- Identity: the one-column card (name, standing, contact, household, credits). -->
    <div class="{cardCls} lg:col-span-1">
      <!-- The stats component atop the essentials, DaisyUI-native, colored to match the
           timeline pane's own success/warning language rather than the list screen's
           primary/warning/ghost chips (see the header comment). One stat only, so
           stats-vertical/stats-horizontal is moot; `p-0 pb-4` drops the component's own
           block/inline padding, which would otherwise double up against the card's `p-6`. -->
      <div class="stats stats-vertical w-full">
        <div class="stat p-0 pb-4">
          <div class="stat-title">Standing</div>
          <div class="stat-value text-xl {standingTextCls(displayStanding)}">
            {displayStanding === 'pending' ? 'Payment due' : segment.label}
          </div>
          <div class="stat-desc">
            {data.household && data.mostRecentTier ? `${TIER_LABEL[data.mostRecentTier]} membership` : 'No membership on file'}
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1 border-t border-[var(--cairn-card-border)] pt-4">
        <a class="text-sm text-muted hover:text-primary hover:underline" href={`mailto:${data.member.email}`}>
          {data.member.email}
        </a>
        <a class="text-sm text-muted hover:text-primary hover:underline" href={`tel:${data.member.phone}`}>
          {data.member.phone}
        </a>
      </div>

      {#if data.creditsGranted > 0}
        <div class="mt-4 border-t border-[var(--cairn-card-border)] pt-4">
          <h2 class={HEADER_CELL}>Class credits</h2>
          <p class="mt-1 text-sm">
            <span class="font-semibold">{data.creditsRemaining} of {data.creditsGranted}</span>
            <span class="text-muted">remaining, household-wide</span>
          </p>
        </div>
      {/if}

      <div class="mt-4 border-t border-[var(--cairn-card-border)] pt-4">
        <h2 class={HEADER_CELL}>Household</h2>
        {#if data.otherHouseholdMembers.length}
          <ul class="mt-2 flex flex-col gap-1">
            {#each data.otherHouseholdMembers as other (other.id)}
              <li>
                <a class="text-sm hover:text-primary hover:underline" href={`/admin/club/members/${other.id}`}>
                  {other.name}
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="mt-2 text-sm text-muted">No other members in this household.</p>
        {/if}
      </div>
    </div>

    <!-- Activity: the two-column card, the household's membership/payment and credit history. -->
    <div class="{cardCls} lg:col-span-2">
      <h2 class={HEADER_CELL}>Household membership &amp; payments</h2>
      {#if data.timeline.length}
        <ul class="timeline timeline-vertical mt-2">
          {#each data.timeline as entry, i (entry.date + i)}
            {@const paid = entry.kind === 'membership' && entry.paymentStatus === 'paid'}
            {@const spine = entry.kind === 'redemption' ? 'bg-primary' : paid ? 'bg-success' : 'bg-warning'}
            <li>
              {#if i > 0}<hr class={spine} />{/if}
              <div class="timeline-middle">
                <span
                  class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-primary-content {spine}"
                  aria-hidden="true"
                >
                  {entry.kind === 'redemption' ? '★' : paid ? '✓' : '!'}
                </span>
              </div>
              <div class="timeline-end timeline-box">
                {#if entry.kind === 'membership'}
                  <p class="font-semibold">{entry.season} season &middot; <span class="font-normal text-muted">{TIER_LABEL[entry.tier]}</span></p>
                  <p class="text-sm text-muted">
                    {formatDollars(entry.amount)} &middot;
                    <span class="font-medium {paid ? 'text-success' : 'text-warning'}">
                      {paid ? `Paid ${formatCivilDate(entry.paidDate)}` : 'Payment due'}
                    </span>
                  </p>
                {:else}
                  <p class="font-semibold">Class credit redeemed</p>
                  <p class="text-sm text-muted">
                    {entry.memberName} &middot; {formatCivilDate(entry.date)}
                  </p>
                {/if}
              </div>
              {#if i < data.timeline.length - 1}<hr class={spine} />{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-sm text-muted">No membership history on file yet.</p>
      {/if}
    </div>
  </div>
{/if}
