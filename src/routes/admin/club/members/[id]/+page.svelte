<!--
@component
The Club section's household desk (Task 4): the fixture-backed member-detail screen's
successor, restructured around the design doc's own four blocks -- roster, memberships, money
timeline, assets -- stacked per the office-list pattern rather than the old two-pane identity/
activity split (a household, not a single member, is this route's own record now). Read-only in
this task: roster edits, household surgery (move/merge), manual payments, tier changes, and
refunds all land in Tasks 5-6 as form actions alongside these same blocks. The standing summary
(current/grace/lapsed/none) reads `data.standing`, a single-household lookup
(`getHouseholdStanding`) distinct from the list screen's own batch query, per `+page.server.ts`'s
header. A membership row's payment `source` is not itself a `households-store.ts` fact (that
module's own header explains why); it is read here off `data.timeline`'s dues lines instead, the
same cross-reference that module's comment names.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { HEADER_CELL, formatCents, formatCivilDate, formatClubTimestamp, formatDollars } from '$admin-club/lib/ui';
  import { LINE_ITEM_LABEL, STANDING_CHIP, TIER_LABEL, TRANSACTION_KIND_LABEL, TRANSACTION_SOURCE_LABEL, VISIBILITY_CHIP } from '$admin-club/lib/member-format';
  import type { TransactionSource } from '$admin-club/lib/ledger';

  let { data }: { data: PageData } = $props();

  const cardCls = 'rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 shadow-[var(--cairn-shadow)]';

  /** The most recent `dues` line's own transaction source for each membership, read off the
   *  already-loaded timeline (newest first) rather than a second query: the first dues line seen
   *  per membership id is its most recent source. `undefined` when a membership has never had a
   *  linked ledger charge (an invoiced-but-unpaid row). */
  const membershipSource = $derived.by(() => {
    const map = new Map<string, TransactionSource>();
    for (const tx of data.timeline) {
      for (const line of tx.lines) {
        if (line.item === 'dues' && line.membershipId && !map.has(line.membershipId)) {
          map.set(line.membershipId, tx.source);
        }
      }
    }
    return map;
  });
</script>

<a
  href="/admin/club/members"
  class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary"
>
  <span aria-hidden="true">&larr;</span> Back to Members
</a>

{#if !data.desk}
  <div class="{cardCls} py-10 text-center">
    <p class="text-sm text-muted">
      {data.error ?? 'No such household. It may have merged into another, or this link is stale.'}
    </p>
  </div>
{:else}
  {@const desk = data.desk}
  {@const standing = data.standing}
  <header class="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex flex-col gap-0.5">
      <span class={HEADER_CELL}>Club</span>
      <h1 class="text-2xl font-bold tracking-tight font-[family-name:var(--font-display)]">{desk.name}</h1>
      {#if desk.city}<p class="text-sm text-muted">{desk.city}</p>{/if}
    </div>
    {#if standing}
      {@const chip = STANDING_CHIP[standing.status]}
      <span class="badge {chip.cls}">
        {standing.status === 'lapsed' && standing.lastSeason ? `${chip.label} — last ${standing.lastSeason}` : chip.label}
      </span>
    {/if}
  </header>

  <div class="flex flex-col gap-6">
    <!-- Roster: contact fields, visibility, archive/primary state (read-only here; Task 5 adds CRUD). -->
    <div class={cardCls}>
      <h2 class={HEADER_CELL}>Roster</h2>
      {#if desk.roster.length}
        <ul class="mt-3 flex flex-col divide-y divide-[var(--cairn-card-border)]">
          {#each desk.roster as member (member.id)}
            {@const visibility = VISIBILITY_CHIP[member.directoryVisibility]}
            <li class="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <p class="font-semibold {member.archived ? 'opacity-50' : ''}">
                  {member.name}{member.isPrimary ? ' · Primary' : ''}
                </p>
                <p class="text-sm text-muted">
                  {member.email ?? 'No email on file'} &middot; {member.phone ?? 'No phone on file'}
                  {#if member.birthdate}&middot; {formatCivilDate(member.birthdate)}{/if}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span class="badge {visibility.cls}">{visibility.label}</span>
                {#if member.archived}<span class="badge badge-ghost badge-sm font-medium opacity-60">Archived</span>{/if}
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-sm text-muted">No members on file yet.</p>
      {/if}
    </div>

    <!-- Memberships: season/tier/amount/paid-date/source, with refunded state. -->
    <div class={cardCls}>
      <h2 class={HEADER_CELL}>Memberships</h2>
      {#if desk.memberships.length}
        <table class="table mt-2">
          <thead>
            <tr>
              <th class={HEADER_CELL}>Season</th>
              <th class={HEADER_CELL}>Tier</th>
              <th class={HEADER_CELL}>Amount</th>
              <th class={HEADER_CELL}>Paid</th>
              <th class={HEADER_CELL}>Source</th>
              <th class={HEADER_CELL}>State</th>
            </tr>
          </thead>
          <tbody>
            {#each desk.memberships as membership (membership.id)}
              {@const source = membershipSource.get(membership.id)}
              <tr class={membership.refundedAt ? 'opacity-60' : ''}>
                <td class="font-medium">{membership.season}</td>
                <td>{TIER_LABEL[membership.tier]}</td>
                <td>{formatDollars(membership.pricePaid)}</td>
                <td>{formatCivilDate(membership.paidAt, 'Not paid')}</td>
                <td class="text-sm text-muted">{source ? TRANSACTION_SOURCE_LABEL[source] : '—'}</td>
                <td>
                  {#if membership.refundedAt}
                    <span class="badge badge-ghost badge-sm font-medium">Refunded {formatCivilDate(membership.refundedAt)}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="mt-2 text-sm text-muted">No membership history on file yet.</p>
      {/if}
    </div>

    <!-- Money timeline: every ledger transaction for this household, newest first, its lines nested. -->
    <div class={cardCls}>
      <h2 class={HEADER_CELL}>Money timeline</h2>
      {#if data.timeline.length}
        <ul class="mt-3 flex flex-col divide-y divide-[var(--cairn-card-border)]">
          {#each data.timeline as tx (tx.id)}
            <li class="py-3 first:pt-0 last:pb-0">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="font-semibold">
                  {TRANSACTION_KIND_LABEL[tx.kind]} &middot; {TRANSACTION_SOURCE_LABEL[tx.source]}
                  <span class="ml-1 font-normal text-muted">{formatClubTimestamp(tx.occurredAt)}</span>
                </p>
                <p class="font-semibold tabular-nums">{formatCents(tx.amountTotalCents)}</p>
              </div>
              {#if tx.memo}<p class="text-sm text-muted">{tx.memo}</p>{/if}
              <ul class="mt-1 flex flex-col gap-0.5 pl-4 text-sm text-muted">
                {#each tx.lines as line (line.id)}
                  <li class="flex justify-between gap-2">
                    <span>{LINE_ITEM_LABEL[line.item]} &middot; {line.description}</span>
                    <span class="tabular-nums">{formatCents(line.amountCents)}</span>
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-sm text-muted">No ledger transactions on file yet.</p>
      {/if}
    </div>

    <!-- Assets: active and released assignments, read-only (asset management keeps its own screen). -->
    <div class={cardCls}>
      <h2 class={HEADER_CELL}>Assets</h2>
      {#if desk.assets.length}
        <ul class="mt-3 flex flex-col divide-y divide-[var(--cairn-card-border)]">
          {#each desk.assets as asset (asset.id)}
            <li class="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <p class="font-semibold">{asset.assetTypeName}</p>
                <p class="text-sm text-muted">
                  {asset.season} season{#if asset.description}&middot; {asset.description}{/if}
                </p>
              </div>
              <span class="badge badge-sm {asset.status === 'active' ? 'border-transparent bg-primary/10 font-medium text-primary' : 'badge-ghost font-medium'}">
                {asset.status === 'active' ? 'Active' : 'Released'}
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-sm text-muted">No asset assignments on file.</p>
      {/if}
    </div>
  </div>
{/if}
