<!--
@component
The Club section's household desk (Task 4's read side, Task 5's write side): every action from
the design doc's own household-desk section lands here as a `clubAdminAction` form -- roster
CRUD (add/edit/archive/visibility), household edit (name/city/primary), move member, merge
household, a manual (check/cash/comp) payment, a per-membership tier change, and (Task 6) the
refund action on a refundable timeline charge -- the admin picks which lines and how much of
each to refund, the dialog states whether the refund can reach Stripe or records only, and
submitting runs the whole thing atomically server-side. A merge or move's target household is
entered by id (the id visible in any household desk's own URL) -- a proper household picker is a
follow-up, out of this task's scope.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { ActionData, PageData } from './$types';
  import { CsrfField } from '@glw907/cairn-cms/components';
  import { FieldLabel, SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatCents, formatCivilDate, formatClubTimestamp, formatDollars } from '$admin-club/lib/ui';
  import { LINE_ITEM_LABEL, STANDING_CHIP, TIER_LABEL, TRANSACTION_KIND_LABEL, TRANSACTION_SOURCE_LABEL, VISIBILITY_CHIP } from '$admin-club/lib/member-format';
  import type { TransactionSource } from '$admin-club/lib/ledger';
  import type { DirectoryVisibility, MembershipTier } from '$admin-club/lib/member-types';
  import type { HouseholdMembershipRow, HouseholdRosterMember } from '$admin-club/lib/households-store';
  import type { TimelineTransaction } from '$admin-club/lib/money-store';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** Every dialog form's own `use:enhance`: keeps the modal open with whatever the admin already
   *  typed and shows the server's `fail()` message inline (`form?.error` at the page top) rather
   *  than a full-page navigation that would discard it; closes the dialog once the action settles
   *  with anything but a failure (a success, or a redirect `enhance`'s own default `update()`
   *  already follows). */
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
  const VISIBILITY_OPTIONS: { value: DirectoryVisibility; label: string }[] = [
    { value: 'visible', label: VISIBILITY_CHIP.visible.label },
    { value: 'partial', label: VISIBILITY_CHIP.partial.label },
    { value: 'hidden', label: VISIBILITY_CHIP.hidden.label },
  ];
  const SOURCE_OPTIONS = [
    { value: 'check', label: 'Check' },
    { value: 'cash', label: 'Cash' },
    { value: 'comp', label: 'Comp' },
  ];

  /** The most recent `dues` line's own transaction source for each membership, read off the
   *  already-loaded timeline (newest first) rather than a second query: the first dues line seen
   *  per membership id is its most recent source. */
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

  // -- household edit dialog --
  let householdDialog: HTMLDialogElement | undefined = $state();
  let householdName = $state('');
  let householdCity = $state('');
  let householdPrimaryId = $state('');
  function openHouseholdDialog() {
    if (!data.desk) return;
    householdName = data.desk.name;
    householdCity = data.desk.city ?? '';
    householdPrimaryId = data.desk.primaryMemberId ?? '';
    householdDialog?.showModal();
  }

  // -- add / edit member dialog (shared) --
  let memberDialog: HTMLDialogElement | undefined = $state();
  let memberDialogMode = $state<'add' | 'edit'>('add');
  let memberId = $state('');
  let memberName = $state('');
  let memberEmail = $state('');
  let memberPhone = $state('');
  let memberBirthdate = $state('');
  function openAddMemberDialog() {
    memberDialogMode = 'add';
    memberId = '';
    memberName = '';
    memberEmail = '';
    memberPhone = '';
    memberBirthdate = '';
    memberDialog?.showModal();
  }
  function openEditMemberDialog(member: HouseholdRosterMember) {
    memberDialogMode = 'edit';
    memberId = member.id;
    memberName = member.name;
    memberEmail = member.email ?? '';
    memberPhone = member.phone ?? '';
    memberBirthdate = member.birthdate ?? '';
    memberDialog?.showModal();
  }

  // -- move member dialog --
  let moveDialog: HTMLDialogElement | undefined = $state();
  let moveMemberId = $state('');
  let moveMemberName = $state('');
  let moveTargetHouseholdId = $state('');
  let moveNewPrimaryId = $state('');
  function openMoveDialog(member: HouseholdRosterMember) {
    moveMemberId = member.id;
    moveMemberName = member.name;
    moveTargetHouseholdId = '';
    moveNewPrimaryId = '';
    moveDialog?.showModal();
  }

  // -- merge household dialog --
  let mergeDialog: HTMLDialogElement | undefined = $state();
  let mergedHouseholdId = $state('');

  // -- tier change dialog --
  let tierDialog: HTMLDialogElement | undefined = $state();
  let tierMembershipId = $state('');
  let tierMembershipLabel = $state('');
  let tierValue = $state<MembershipTier>('individual');
  function openTierDialog(membership: HouseholdMembershipRow) {
    tierMembershipId = membership.id;
    tierMembershipLabel = `${membership.season} season`;
    tierValue = membership.tier;
    tierDialog?.showModal();
  }

  // -- record payment dialog --
  let paymentDialog: HTMLDialogElement | undefined = $state();
  let paymentSeason = $state(untrack(() => String(data.currentSeason)));
  let paymentTier = $state<MembershipTier>('individual');
  let paymentAmount = $state('');
  let paymentSource = $state<'check' | 'cash' | 'comp'>('check');
  let paymentMemo = $state('');
  function openPaymentDialog() {
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

  // -- refund dialog: the admin picks which of the charge's own lines to refund, and how much of
  // each (a partial dues refund leaves the membership standing, per the design doc's own rule).
  let refundDialog: HTMLDialogElement | undefined = $state();
  let refundTx: TimelineTransaction | null = $state(null);
  let refundSelected = $state<Record<string, boolean>>({});
  let refundAmounts = $state<Record<string, string>>({});
  function openRefundDialog(tx: TimelineTransaction) {
    refundTx = tx;
    // Default to the REMAINING balance, not the line's original amount: a line already partially
    // refunded (`line.refundedCents > 0`) preselects for only what is left, matching the per-line
    // cumulative cap `refunds.ts`'s own `buildRefundPlan` now enforces server-side. A line with
    // nothing left to refund starts unchecked.
    refundSelected = Object.fromEntries(tx.lines.map((line) => [line.id, line.amountCents - line.refundedCents > 0]));
    refundAmounts = Object.fromEntries(tx.lines.map((line) => [line.id, ((line.amountCents - line.refundedCents) / 100).toFixed(2)]));
    refundDialog?.showModal();
  }
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
  {#key desk.id}
  <header class="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex flex-col gap-0.5">
      <span class={HEADER_CELL}>Club</span>
      <h1 class="text-2xl font-bold tracking-tight font-[family-name:var(--font-display)]">{desk.name}</h1>
      {#if desk.city}<p class="text-sm text-muted">{desk.city}</p>{/if}
    </div>
    <div class="flex items-center gap-2">
      {#if standing}
        {@const chip = STANDING_CHIP[standing.status]}
        <span class="badge {chip.cls}">
          {standing.status === 'lapsed' && standing.lastSeason ? `${chip.label} — last ${standing.lastSeason}` : chip.label}
        </span>
      {/if}
      <button type="button" class="btn btn-ghost btn-sm" onclick={openHouseholdDialog}>Edit household</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => { mergedHouseholdId = ''; mergeDialog?.showModal(); }}>Merge in&hellip;</button>
    </div>
  </header>

  {#if form?.error}
    <p class="mb-4 rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm font-medium text-error" role="alert">
      {form.error}
    </p>
  {/if}

  <div class="flex flex-col gap-6">
    <!-- Roster: contact fields, visibility, archive/primary state, plus add/edit/move/archive. -->
    <div class={cardCls}>
      <div class="flex items-center justify-between">
        <h2 class={HEADER_CELL}>Roster</h2>
        <button type="button" class="btn btn-ghost btn-xs" onclick={openAddMemberDialog}>Add member</button>
      </div>
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
                <a class="btn btn-ghost btn-xs" href="/admin/club/documents/member/{member.id}">Signatures</a>
                <button type="button" class="btn btn-ghost btn-xs" onclick={() => openEditMemberDialog(member)}>Edit</button>
                <button type="button" class="btn btn-ghost btn-xs" onclick={() => openMoveDialog(member)}>Move&hellip;</button>
                <form method="post" action="?/setArchived">
                  <CsrfField />
                  <input type="hidden" name="memberId" value={member.id} />
                  <input type="hidden" name="archived" value={member.archived ? '0' : '1'} />
                  <button type="submit" class="btn btn-ghost btn-xs {member.archived ? '' : 'text-error'}">
                    {member.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </form>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-2 text-sm text-muted">No members on file yet.</p>
      {/if}
    </div>

    <!-- Memberships: season/tier/amount/paid-date/source, refunded state, tier change. -->
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
              <th class="{HEADER_CELL} w-24"></th>
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
                <td>
                  <button type="button" class="btn btn-ghost btn-xs" onclick={() => openTierDialog(membership)}>Change tier</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="mt-2 text-sm text-muted">No membership history on file yet.</p>
      {/if}
    </div>

    <!-- Money timeline: every ledger transaction for the household, newest first, its lines nested. -->
    <div class={cardCls}>
      <div class="flex items-center justify-between">
        <h2 class={HEADER_CELL}>Money timeline</h2>
        <button type="button" class="btn btn-ghost btn-xs" onclick={openPaymentDialog}>Record manual payment</button>
      </div>
      {#if data.timeline.length}
        <ul class="mt-3 flex flex-col divide-y divide-[var(--cairn-card-border)]">
          {#each data.timeline as tx (tx.id)}
            <li class="py-3 first:pt-0 last:pb-0">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="font-semibold">
                  {TRANSACTION_KIND_LABEL[tx.kind]} &middot; {TRANSACTION_SOURCE_LABEL[tx.source]}
                  <span class="ml-1 font-normal text-muted">{formatClubTimestamp(tx.occurredAt)}</span>
                </p>
                <div class="flex items-center gap-2">
                  <p class="font-semibold tabular-nums">{formatCents(tx.amountTotalCents)}</p>
                  {#if tx.kind === 'charge' && tx.refundable}
                    <button type="button" class="btn btn-ghost btn-xs text-error" onclick={() => openRefundDialog(tx)}>Refund</button>
                  {/if}
                </div>
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

  <dialog bind:this={householdDialog} class="modal" aria-labelledby="household-dialog-title">
    <div class="modal-box">
      <h2 id="household-dialog-title" class="text-lg font-bold">Edit household</h2>
      <form method="post" action="?/updateHousehold" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => householdDialog)}>
        <CsrfField />
        <TextField label="Household name" name="name" bind:value={householdName} />
        <TextField label="City" name="city" bind:value={householdCity} />
        <SelectField
          label="Primary member"
          name="primaryMemberId"
          bind:value={householdPrimaryId}
          options={desk.roster.map((member) => ({ value: member.id, label: member.name }))}
        />
        <div class="modal-action">
          <button type="button" class="btn btn-sm" onclick={() => householdDialog?.close()}>Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
        </div>
      </form>
    </div>
  </dialog>

  <dialog bind:this={memberDialog} class="modal" aria-labelledby="member-dialog-title">
    <div class="modal-box">
      <h2 id="member-dialog-title" class="text-lg font-bold">{memberDialogMode === 'add' ? 'Add member' : 'Edit member'}</h2>
      <form
        method="post"
        action={memberDialogMode === 'add' ? '?/addMember' : '?/updateMember'}
        class="flex flex-col gap-3"
        use:enhance={closeDialogOnSettle(() => memberDialog)}
      >
        <CsrfField />
        {#if memberDialogMode === 'edit'}<input type="hidden" name="memberId" value={memberId} />{/if}
        <TextField label="Name" name="name" bind:value={memberName} />
        <TextField label="Email" name="email" type="email" bind:value={memberEmail} />
        <TextField label="Phone" name="phone" bind:value={memberPhone} />
        <FieldLabel label="Birthdate">
          <input class="input input-sm" type="date" name="birthdate" bind:value={memberBirthdate} />
        </FieldLabel>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" onclick={() => memberDialog?.close()}>Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
        </div>
      </form>
    </div>
  </dialog>

  <dialog bind:this={moveDialog} class="modal" aria-labelledby="move-dialog-title">
    <div class="modal-box">
      <h2 id="move-dialog-title" class="text-lg font-bold">Move {moveMemberName}</h2>
      <p class="py-2 text-sm text-muted">
        Re-parents this member to another household. Moving the household's own primary needs a new
        primary named first.
      </p>
      <form method="post" action="?/moveMember" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => moveDialog)}>
        <CsrfField />
        <input type="hidden" name="memberId" value={moveMemberId} />
        <TextField label="Target household id" name="targetHouseholdId" bind:value={moveTargetHouseholdId} />
        <SelectField
          label="New primary (only if moving the primary)"
          name="newPrimaryId"
          bind:value={moveNewPrimaryId}
          options={[{ value: '', label: 'Not applicable' }, ...desk.roster.filter((m) => m.id !== moveMemberId).map((m) => ({ value: m.id, label: m.name }))]}
        />
        <div class="modal-action">
          <button type="button" class="btn btn-sm" onclick={() => moveDialog?.close()}>Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Move</button>
        </div>
      </form>
    </div>
  </dialog>

  <dialog bind:this={mergeDialog} class="modal" aria-labelledby="merge-dialog-title">
    <div class="modal-box">
      <h2 id="merge-dialog-title" class="text-lg font-bold">Merge a household into {desk.name}</h2>
      <p class="py-2 text-sm text-muted">
        Members, memberships, and ledger transactions move here; the other household is marked left.
        Refused when both hold a membership for the same season.
      </p>
      <form method="post" action="?/mergeHousehold" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => mergeDialog)}>
        <CsrfField />
        <TextField label="Household id to merge in" name="mergedHouseholdId" bind:value={mergedHouseholdId} />
        <div class="modal-action">
          <button type="button" class="btn btn-sm" onclick={() => mergeDialog?.close()}>Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Merge</button>
        </div>
      </form>
    </div>
  </dialog>

  <dialog bind:this={tierDialog} class="modal" aria-labelledby="tier-dialog-title">
    <div class="modal-box">
      <h2 id="tier-dialog-title" class="text-lg font-bold">Change tier &middot; {tierMembershipLabel}</h2>
      <p class="py-2 text-sm text-muted">Edits the tier label only. Trueing up money happens through a manual payment or refund.</p>
      <form method="post" action="?/changeTier" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => tierDialog)}>
        <CsrfField />
        <input type="hidden" name="membershipId" value={tierMembershipId} />
        <SelectField label="Tier" name="tier" bind:value={tierValue} options={TIER_OPTIONS} />
        <div class="modal-action">
          <button type="button" class="btn btn-sm" onclick={() => tierDialog?.close()}>Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
        </div>
      </form>
    </div>
  </dialog>

  <dialog bind:this={paymentDialog} class="modal" aria-labelledby="payment-dialog-title">
    <div class="modal-box">
      <h2 id="payment-dialog-title" class="text-lg font-bold">Record a manual payment</h2>
      <p class="py-2 text-sm text-muted">A check, cash, or comp payment; creates the membership and the ledger entry together.</p>
      <form method="post" action="?/recordPayment" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => paymentDialog)}>
        <CsrfField />
        <FieldLabel label="Season">
          <input class="input input-sm" type="number" name="season" min="2020" step="1" bind:value={paymentSeason} required />
        </FieldLabel>
        <SelectField label="Tier" name="tier" bind:value={paymentTier} options={TIER_OPTIONS} />
        <FieldLabel label="Amount (USD)">
          <input class="input input-sm" type="number" name="amount" min="0" step="1" bind:value={paymentAmount} required />
        </FieldLabel>
        <SelectField label="Source" name="source" bind:value={paymentSource} options={SOURCE_OPTIONS} />
        <TextField label="Memo" name="memo" bind:value={paymentMemo} />
        <div class="modal-action">
          <button type="button" class="btn btn-sm" onclick={() => paymentDialog?.close()}>Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Record payment</button>
        </div>
      </form>
    </div>
  </dialog>

  <dialog bind:this={refundDialog} class="modal" aria-labelledby="refund-dialog-title">
    <div class="modal-box">
      <h2 id="refund-dialog-title" class="text-lg font-bold">Refund</h2>
      {#if refundTx}
        {@const tx = refundTx}
        <p class="py-2 text-sm text-muted">
          {tx.apiEligible
            ? 'This charge went through Stripe checkout: the refund issues through Stripe automatically.'
            : 'This charge did not go through Stripe checkout (an imported, PayPal, or check/cash payment): the refund records here only.'}
        </p>
        <form method="post" action="?/refund" class="flex flex-col gap-3" use:enhance={closeDialogOnSettle(() => refundDialog)}>
          <CsrfField />
          <input type="hidden" name="transactionId" value={tx.id} />
          <ul class="flex flex-col gap-2">
            {#each tx.lines as line (line.id)}
              {@const remainingCents = line.amountCents - line.refundedCents}
              <li class="flex items-center gap-2">
                <label class="flex items-center gap-2" for={`refund-select-${line.id}`}>
                  <input
                    id={`refund-select-${line.id}`}
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    name="lineIds"
                    value={line.id}
                    bind:checked={refundSelected[line.id]}
                    aria-label={`Refund ${LINE_ITEM_LABEL[line.item]} -- ${line.description}`}
                  />
                </label>
                <span class="flex-1 text-sm">
                  {LINE_ITEM_LABEL[line.item]} &middot; {line.description}
                  {#if line.refundedCents > 0}
                    <span class="text-muted">({formatCents(line.refundedCents)} already refunded)</span>
                  {/if}
                </span>
                <label class="sr-only" for={`refund-amount-${line.id}`}>
                  Refund amount for {LINE_ITEM_LABEL[line.item]}, {line.description}
                </label>
                <input
                  id={`refund-amount-${line.id}`}
                  class="input input-xs w-24"
                  type="number"
                  name="amount-{line.id}"
                  min="0.01"
                  max={remainingCents / 100}
                  step="0.01"
                  disabled={!refundSelected[line.id]}
                  bind:value={refundAmounts[line.id]}
                />
              </li>
            {/each}
          </ul>
          <div class="modal-action">
            <button type="button" class="btn btn-sm" onclick={() => refundDialog?.close()}>Cancel</button>
            <button type="submit" class="btn btn-error btn-sm">Refund</button>
          </div>
        </form>
      {/if}
    </div>
  </dialog>
  {/key}
{/if}
