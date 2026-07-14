<!--
@component
The Club section's Money & Renewals screen (Task 7): the season-flat companion to the household-
grouped Members screen. Four stat tiles (`getMoneyOverview`), the read-only renewal-candidate and
attention lists (ruling 6: no per-row send button, the automated reminders already exist), the
season-flat memberships table behind a plain GET season picker, and the recent-transactions list
with a refund link that routes to the charge's own household desk (Task 6's refund dialog lives
there; this screen never re-implements it). Every list row that names a household links to its
desk. Record manual payment opens the Task 5 payment form with a household picker in front of it,
since (unlike the desk) this screen has no single household in its own URL.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { ActionData, PageData } from './$types';
  import { CsrfField } from '@glw907/cairn-cms/components';
  import { FieldLabel, SelectField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatCents, formatCivilDate, formatClubTimestamp, formatDollars } from '$admin-club/lib/ui';
  import { LINE_ITEM_LABEL, TIER_LABEL, TRANSACTION_KIND_LABEL, TRANSACTION_SOURCE_LABEL } from '$admin-club/lib/member-format';
  import type { MembershipTier } from '$admin-club/lib/member-types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** Matches the household desk's own `closeDialogOnSettle` (`members/[id]/+page.svelte`): keeps
   *  the modal open with entered values and the inline error on a `fail()`, closes it once the
   *  action settles with anything else. */
  function closeDialogOnSettle(dialog: () => HTMLDialogElement | undefined): SubmitFunction {
    return () => {
      return async ({ result, update }) => {
        await update();
        if (result.type !== 'failure') dialog()?.close();
      };
    };
  }

  const cardCls = 'rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 shadow-[var(--cairn-shadow)]';

  const TIER_OPTIONS: { value: MembershipTier; label: string }[] = [
    { value: 'individual', label: TIER_LABEL.individual },
    { value: 'family', label: TIER_LABEL.family },
    { value: 'young-adult', label: TIER_LABEL['young-adult'] },
  ];
  const SOURCE_OPTIONS = [
    { value: 'check', label: 'Check' },
    { value: 'cash', label: 'Cash' },
    { value: 'comp', label: 'Comp' },
  ];
  const householdOptions = $derived(
    data.households.map((household) => ({
      value: household.id,
      label: household.city ? `${household.name} — ${household.city}` : household.name,
    })),
  );

  // -- record payment dialog: a household picker in front of the Task 5 payment form --
  let paymentDialog: HTMLDialogElement | undefined = $state();
  let paymentHouseholdId = $state('');
  let paymentSeason = $state(untrack(() => String(data.currentSeason)));
  let paymentTier = $state<MembershipTier>('individual');
  let paymentAmount = $state('');
  let paymentSource = $state<'check' | 'cash' | 'comp'>('check');
  let paymentMemo = $state('');
  function openPaymentDialog() {
    paymentHouseholdId = data.households[0]?.id ?? '';
    paymentSeason = String(data.currentSeason);
    paymentTier = 'individual';
    paymentAmount = data.tierPrices ? String(data.tierPrices.individual) : '';
    paymentSource = 'check';
    paymentMemo = '';
    paymentDialog?.showModal();
  }
  $effect(() => {
    if (data.tierPrices && paymentSource !== 'comp') paymentAmount = String(data.tierPrices[paymentTier]);
    else if (paymentSource === 'comp') paymentAmount = '0';
  });
</script>

<header class="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
  <div class="flex flex-col gap-0.5">
    <span class={HEADER_CELL}>Club</span>
    <h1 class="text-2xl font-bold tracking-tight font-[family-name:var(--font-display)]">Money &amp; Renewals</h1>
    <p class="text-sm text-muted">The {data.currentSeason} season, ledger and standing together.</p>
  </div>
  <button type="button" class="btn btn-primary btn-sm" onclick={openPaymentDialog} disabled={data.households.length === 0}>
    Record manual payment
  </button>
</header>

{#if form?.error}
  <p class="mb-4 rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm font-medium text-error" role="alert">
    {form.error}
  </p>
{/if}

{#if data.error}
  <p class="{cardCls} text-center text-sm text-warning">{data.error}</p>
{:else}
  <div class="flex flex-col gap-6">
    <!-- A plain grid, not DaisyUI stats: the stats component CSS is not part of this
         project's compiled set, so those classes render inert. -->
    <div class="grid w-full grid-cols-2 gap-6 rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 shadow-[var(--cairn-shadow)] xl:grid-cols-4">
      <div>
        <div class={HEADER_CELL}>Current households</div>
        <div class="stat-value text-xl">{data.overview.currentHouseholds} / {data.overview.totalHouseholds}</div>
        <div class="stat-desc">Paid for {data.currentSeason}</div>
      </div>
      <div>
        <div class={HEADER_CELL}>Dues collected</div>
        <div class="stat-value text-xl">{formatDollars(data.overview.duesCollected)}</div>
        <div class="stat-desc">{data.currentSeason} season</div>
      </div>
      <div>
        <div class={HEADER_CELL}>Renewal candidates</div>
        <div class="stat-value text-xl" class:text-warning={data.overview.renewalCandidates > 0}>{data.overview.renewalCandidates}</div>
        <div class="stat-desc">Lapsed since {data.currentSeason - 1}</div>
      </div>
      <div>
        <div class={HEADER_CELL}>Attention</div>
        <div class="stat-value text-xl" class:text-warning={data.overview.attentionCount > 0}>{data.overview.attentionCount}</div>
        <div class="stat-desc">Active assets, no current membership</div>
      </div>
    </div>

    <div class={cardCls}>
      <h2 class={HEADER_CELL}>Renewal candidates</h2>
      <p class="mt-1 text-sm text-muted">Households whose last paid season was {data.currentSeason - 1}. Read-only; the automated reminders already reach them.</p>
      {#if data.renewalCandidates.length}
        <table class="table mt-3">
          <thead>
            <tr>
              <th class={HEADER_CELL}>Household</th>
              <th class={HEADER_CELL}>Last season</th>
              <th class={HEADER_CELL}>Tier</th>
              <th class={HEADER_CELL}>Amount</th>
              <th class={HEADER_CELL}>Paid</th>
            </tr>
          </thead>
          <tbody>
            {#each data.renewalCandidates as row (row.householdId)}
              <tr>
                <td><a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/members/${row.householdId}`}>{row.householdName}</a></td>
                <td>{row.lastSeason}</td>
                <td>{TIER_LABEL[row.tier]}</td>
                <td>{formatDollars(row.pricePaid)}</td>
                <td>{formatCivilDate(row.paidAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="mt-2 text-sm text-muted">No renewal candidates right now.</p>
      {/if}
    </div>

    <div class={cardCls}>
      <h2 class={HEADER_CELL}>Attention</h2>
      <p class="mt-1 text-sm text-muted">Active asset assignments whose household has no paid, non-refunded {data.currentSeason} membership.</p>
      {#if data.attentionItems.length}
        <ul class="mt-3 flex flex-col divide-y divide-[var(--cairn-card-border)]">
          {#each data.attentionItems as row (row.assignmentId)}
            <li class="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div>
                <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/members/${row.householdId}`}>{row.householdName}</a>
                <p class="text-sm text-muted">{row.assetTypeName}</p>
              </div>
              <span class="badge badge-sm border-transparent bg-warning/15 font-medium text-warning-content">
                Against a {row.membershipSeason} membership
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-sm text-muted">Nothing needs attention right now.</p>
      {/if}
    </div>

    <div class={cardCls}>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class={HEADER_CELL}>Memberships by season</h2>
        <form method="get" class="flex items-center gap-2">
          <FieldLabel label="Season">
            <input class="input input-sm w-24" type="number" name="season" min="2020" step="1" value={data.selectedSeason} />
          </FieldLabel>
          <button type="submit" class="btn btn-sm">View</button>
        </form>
      </div>
      {#if data.seasonMemberships.length}
        <table class="table mt-3">
          <thead>
            <tr>
              <th class={HEADER_CELL}>Household</th>
              <th class={HEADER_CELL}>Tier</th>
              <th class={HEADER_CELL}>Amount</th>
              <th class={HEADER_CELL}>Paid</th>
              <th class={HEADER_CELL}>Source</th>
              <th class={HEADER_CELL}>State</th>
            </tr>
          </thead>
          <tbody>
            {#each data.seasonMemberships as row (row.id)}
              <tr class={row.refundedAt ? 'opacity-60' : ''}>
                <td><a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/members/${row.householdId}`}>{row.householdName}</a></td>
                <td>{TIER_LABEL[row.tier]}</td>
                <td>{formatDollars(row.pricePaid)}</td>
                <td>{formatCivilDate(row.paidAt, 'Not paid')}</td>
                <td class="text-sm text-muted">{row.source ? TRANSACTION_SOURCE_LABEL[row.source] : '—'}</td>
                <td>
                  {#if row.refundedAt}
                    <span class="badge badge-ghost badge-sm font-medium">Refunded {formatCivilDate(row.refundedAt)}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="mt-2 text-sm text-muted">No memberships on file for {data.selectedSeason}.</p>
      {/if}
    </div>

    <div class={cardCls}>
      <h2 class={HEADER_CELL}>Recent transactions</h2>
      {#if data.recentTransactions.length}
        <ul class="mt-3 flex flex-col divide-y divide-[var(--cairn-card-border)]">
          {#each data.recentTransactions as tx (tx.id)}
            <li class="py-3 first:pt-0 last:pb-0">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="font-semibold">
                  {#if tx.householdId}
                    <a class="hover:text-primary hover:underline" href={`/admin/club/members/${tx.householdId}`}>{tx.householdName}</a>
                  {:else}
                    <span>{tx.payerName ?? 'No household on file'}</span>
                  {/if}
                  <span class="ml-1 font-normal text-muted">
                    {TRANSACTION_KIND_LABEL[tx.kind]} &middot; {TRANSACTION_SOURCE_LABEL[tx.source]} &middot; {formatClubTimestamp(tx.occurredAt)}
                  </span>
                </p>
                <div class="flex items-center gap-2">
                  <p class="font-semibold tabular-nums">{formatCents(tx.amountTotalCents)}</p>
                  {#if tx.kind === 'charge' && tx.refundable && tx.householdId}
                    <a class="btn btn-ghost btn-xs text-error" href={`/admin/club/members/${tx.householdId}`}>Refund on desk</a>
                  {/if}
                </div>
              </div>
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
  </div>
{/if}

<dialog bind:this={paymentDialog} class="modal" aria-labelledby="money-payment-dialog-title">
  <div class="modal-box">
    <h2 id="money-payment-dialog-title" class="text-lg font-bold">Record a manual payment</h2>
    <p class="py-2 text-sm text-muted">A check, cash, or comp payment; creates the membership and the ledger entry together.</p>
    <form method="post" action="?/recordPayment" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => paymentDialog)}>
      <CsrfField />
      <SelectField label="Household" name="householdId" bind:value={paymentHouseholdId} options={householdOptions} />
      <FieldLabel label="Season">
        <input class="input input-sm" type="number" name="season" min="2020" step="1" bind:value={paymentSeason} required />
      </FieldLabel>
      <SelectField label="Tier" name="tier" bind:value={paymentTier} options={TIER_OPTIONS} />
      <FieldLabel label="Amount (USD)">
        <input class="input input-sm" type="number" name="amount" min="0" step="1" bind:value={paymentAmount} required />
      </FieldLabel>
      <SelectField label="Source" name="source" bind:value={paymentSource} options={SOURCE_OPTIONS} />
      <FieldLabel label="Memo">
        <input class="input input-sm" type="text" name="memo" bind:value={paymentMemo} />
      </FieldLabel>
      <div class="modal-action">
        <button type="button" class="btn btn-sm" onclick={() => paymentDialog?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">Record payment</button>
      </div>
    </form>
  </div>
</dialog>
