<!--
@component
The Club section's Assets screen (Part 2, the redesign's own architecture): the by-asset and
by-person lenses ops proved, re-expressed as two views over the SAME active-assignment read
(`listActiveAssignments`, never a separate query per lens), plus the single polymorphic waitlist
queue with type chips. Assignment CRUD (assign / release / record a payment, including an offline
check or cash payment) and waitlist CRUD (add / remove / move-to-end) all post through this
route's own `+page.server.ts` actions. Replaces the structural placeholder this route previously
shipped.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { FieldLabel, SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatCivilDate, formatDollars } from '$admin-club/lib/ui';
  import { PAYMENT_METHODS, type AssetPaymentStanding, type AssignmentDisplayRow, type PaymentMethod } from '$admin-club/lib/assets-store';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type View = 'by-asset' | 'by-person' | 'waitlist';
  let view = $state<View>('by-asset');

  const VIEW_TABS: { id: View; label: string }[] = [
    { id: 'by-asset', label: 'By asset' },
    { id: 'by-person', label: 'By person' },
    { id: 'waitlist', label: 'Waitlist' },
  ];

  const STANDING_CHIP: Record<AssetPaymentStanding, { label: string; cls: string }> = {
    paid: { label: 'Paid', cls: 'badge-sm border-transparent bg-primary/10 font-medium text-primary' },
    outstanding: { label: 'Outstanding', cls: 'badge-sm border-transparent bg-warning/15 font-medium text-warning-content' },
    'not-billed': { label: 'Not billed', cls: 'badge-ghost badge-sm font-medium' },
  };

  const METHOD_LABEL: Record<PaymentMethod, string> = { card: 'Card', check: 'Check', cash: 'Cash' };

  const byAssetGroups = $derived(
    data.assetTypes.map((type) => ({ type, rows: data.assignments.filter((a) => a.assetType === type.id) })),
  );

  const byPersonGroups = $derived.by(() => {
    const map = new Map<string, { householdId: string; householdName: string; primaryMemberName: string | null; rows: AssignmentDisplayRow[] }>();
    for (const row of data.assignments) {
      if (!map.has(row.householdId)) {
        map.set(row.householdId, { householdId: row.householdId, householdName: row.householdName, primaryMemberName: row.primaryMemberName, rows: [] });
      }
      map.get(row.householdId)!.rows.push(row);
    }
    return [...map.values()].sort((a, b) => a.householdName.localeCompare(b.householdName));
  });

  const feeByType = $derived(new Map(data.assetTypes.map((t) => [t.id, t.fee])));

  // -- assign form --
  const assetTypeOptions = $derived(data.assetTypes.map((t) => ({ value: t.id, label: `${t.name} (${formatDollars(t.fee)})` })));
  let assignAssetType = $state(untrack(() => data.assetTypes[0]?.id ?? ''));
  let householdQuery = $state('');
  let assignMembershipId = $state('');
  let assignDescription = $state('');
  const filteredMemberships = $derived(
    data.membershipOptions.filter((m) => {
      const q = householdQuery.trim().toLowerCase();
      if (!q) return true;
      return m.householdName.toLowerCase().includes(q) || (m.primaryMemberName ?? '').toLowerCase().includes(q);
    }),
  );
  // The already-picked household stays in the option list even once a later keystroke narrows it
  // out of `filteredMemberships`: otherwise a native <select> silently falls back to whatever
  // option happens to render first the instant its own bound value is no longer among its
  // children, swapping the assign form's target household without the editor noticing.
  const membershipOptions = $derived.by(() => {
    const base = filteredMemberships;
    const picked = data.membershipOptions.find((m) => m.membershipId === assignMembershipId);
    const list = picked && !base.includes(picked) ? [picked, ...base] : base;
    return list.map((m) => ({
      value: m.membershipId,
      label: m.primaryMemberName ? `${m.householdName} (${m.primaryMemberName})` : m.householdName,
    }));
  });

  // -- release confirm dialog --
  let releaseDialog: HTMLDialogElement | undefined = $state();
  let releaseTargetId = $state('');
  let releaseTargetLabel = $state('');
  function openReleaseDialog(row: AssignmentDisplayRow) {
    releaseTargetId = row.id;
    releaseTargetLabel = `${row.assetTypeName} — ${row.householdName}`;
    releaseDialog?.showModal();
  }

  // -- record payment dialog --
  let paymentDialog: HTMLDialogElement | undefined = $state();
  let paymentTargetId = $state('');
  let paymentTargetLabel = $state('');
  let paymentAmount = $state('');
  let paymentMethod = $state<PaymentMethod>('card');
  let paymentReference = $state('');
  function openPaymentDialog(row: AssignmentDisplayRow) {
    paymentTargetId = row.id;
    paymentTargetLabel = `${row.assetTypeName} — ${row.householdName}`;
    paymentAmount = String(feeByType.get(row.assetType) ?? '');
    paymentMethod = 'card';
    paymentReference = '';
    paymentDialog?.showModal();
  }
  const paymentMethodOptions = PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }));

  // -- waitlist add form --
  let waitlistAssetType = $state(untrack(() => data.assetTypes[0]?.id ?? ''));
  let memberQuery = $state('');
  let waitlistMemberId = $state('');
  let waitlistNotes = $state('');
  const filteredMembers = $derived(
    data.memberOptions.filter((m) => {
      const q = memberQuery.trim().toLowerCase();
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q) || m.householdName.toLowerCase().includes(q);
    }),
  );
  // Same already-picked-stays-selectable fix `membershipOptions` documents, for the waitlist
  // form's member picker.
  const memberSelectOptions = $derived.by(() => {
    const base = filteredMembers;
    const picked = data.memberOptions.find((m) => m.memberId === waitlistMemberId);
    const list = picked && !base.includes(picked) ? [picked, ...base] : base;
    return list.map((m) => ({ value: m.memberId, label: `${m.name} (${m.householdName})` }));
  });

  const subtitle = $derived(
    data.error ? data.error : `${data.assignments.length} active assignment(s) across ${data.assetTypes.length} asset type(s).`,
  );
</script>

<OfficeList eyebrow="Club" title="Assets" {subtitle}>
  {#snippet action()}
    <div class="join" role="tablist" aria-label="Assets view">
      {#each VIEW_TABS as tab (tab.id)}
        <button
          type="button"
          role="tab"
          aria-selected={view === tab.id}
          class="join-item btn btn-sm {view === tab.id ? 'btn-primary' : ''}"
          onclick={() => (view = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </div>
  {/snippet}

  {#if form?.error}
    <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
      {form.error}
    </p>
  {/if}

  {#if view === 'by-asset'}
    {#each byAssetGroups as group (group.type.id)}
      <div class="border-b border-[var(--cairn-card-border)] p-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            {group.type.name}
            <span class="ml-1 font-normal text-muted">
              {group.rows.length}{group.type.capacity != null ? `/${group.type.capacity}` : ''} assigned &middot; {formatDollars(group.type.fee)}
            </span>
          </h2>
        </div>
        <table class="table">
          <caption class="sr-only">{group.type.name} assignments</caption>
          <thead>
            <tr>
              <th class={HEADER_CELL}>Household</th>
              <th class={HEADER_CELL}>Description</th>
              <th class="{HEADER_CELL} w-28">Payment</th>
              <th class="{HEADER_CELL} w-40"></th>
            </tr>
          </thead>
          <tbody>
            {#each group.rows as row (row.id)}
              {@const standing = STANDING_CHIP[row.paymentStanding]}
              <tr class="transition-colors hover:bg-base-200/60">
                <td class="text-sm">
                  <span class="font-medium">{row.householdName}</span>
                  {#if row.primaryMemberName}<span class="text-muted"> &middot; {row.primaryMemberName}</span>{/if}
                </td>
                <td class="text-sm text-muted">{row.description ?? '—'}</td>
                <td><span class="badge {standing.cls}">{standing.label}</span></td>
                <td class="flex justify-end gap-1">
                  <button type="button" class="btn btn-ghost btn-xs" onclick={() => openPaymentDialog(row)}>Record payment</button>
                  <button type="button" class="btn btn-ghost btn-xs text-error" onclick={() => openReleaseDialog(row)}>Release</button>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="4" class="px-6 py-6 text-center text-sm text-muted">No one holds this asset right now.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}

    <form method="post" action="?/assign" class="p-6">
      <h2 class="mb-3 text-sm font-semibold">Assign an asset</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <SelectField label="Asset type" name="assetType" bind:value={assignAssetType} options={assetTypeOptions} />
        <TextField label="Search household" name="householdQuery" type="search" placeholder="Name" bind:value={householdQuery} />
        <SelectField label="Household" name="membershipId" bind:value={assignMembershipId} options={membershipOptions} />
        <TextField label="Description" name="description" placeholder="Buoy M-14" bind:value={assignDescription} />
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Assign</button>
      </div>
    </form>
  {:else if view === 'by-person'}
    <table class="table">
      <caption class="sr-only">Active asset assignments by household</caption>
      <thead>
        <tr>
          <th class={HEADER_CELL}>Household</th>
          <th class={HEADER_CELL}>Assets held</th>
        </tr>
      </thead>
      <tbody>
        {#each byPersonGroups as group (group.householdId)}
          <tr class="align-top">
            <td class="whitespace-nowrap text-sm">
              <span class="font-medium">{group.householdName}</span>
              {#if group.primaryMemberName}<br /><span class="text-muted">{group.primaryMemberName}</span>{/if}
            </td>
            <td>
              <ul class="flex flex-col gap-1">
                {#each group.rows as row (row.id)}
                  {@const standing = STANDING_CHIP[row.paymentStanding]}
                  <li class="flex flex-wrap items-center gap-2 text-sm">
                    <span class="font-medium">{row.assetTypeName}</span>
                    {#if row.description}<span class="text-muted">{row.description}</span>{/if}
                    <span class="badge {standing.cls}">{standing.label}</span>
                    <button type="button" class="btn btn-ghost btn-xs" onclick={() => openPaymentDialog(row)}>Record payment</button>
                    <button type="button" class="btn btn-ghost btn-xs text-error" onclick={() => openReleaseDialog(row)}>Release</button>
                  </li>
                {/each}
              </ul>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="2" class="px-6 py-10 text-center text-sm text-muted">No household holds an asset right now.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <table class="table">
      <caption class="sr-only">The asset waitlist, every type, position order</caption>
      <thead>
        <tr>
          <th class="{HEADER_CELL} w-32">Asset</th>
          <th class="{HEADER_CELL} w-16">#</th>
          <th class={HEADER_CELL}>Member</th>
          <th class="{HEADER_CELL} w-28">Requested</th>
          <th class="{HEADER_CELL} w-40"></th>
        </tr>
      </thead>
      <tbody>
        {#each data.waitlist as entry (entry.id)}
          <tr class="transition-colors hover:bg-base-200/60">
            <td><span class="badge badge-sm badge-neutral font-medium">{entry.assetTypeName}</span></td>
            <td class="text-sm tabular-nums text-muted">{entry.position}</td>
            <td class="text-sm">
              <span class="font-medium">{entry.memberName}</span>
              {#if entry.memberEmail}<span class="text-muted"> &middot; {entry.memberEmail}</span>{/if}
            </td>
            <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatCivilDate(entry.requestedAt)}</td>
            <td class="flex justify-end gap-1">
              <form method="post" action="?/waitlistMoveToEnd">
                <CsrfField />
                <input type="hidden" name="waitlistId" value={entry.id} />
                <button type="submit" class="btn btn-ghost btn-xs">Move to end</button>
              </form>
              <form method="post" action="?/waitlistRemove">
                <CsrfField />
                <input type="hidden" name="waitlistId" value={entry.id} />
                <button type="submit" class="btn btn-ghost btn-xs text-error">Remove</button>
              </form>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="px-6 py-10 text-center text-sm text-muted">No one is waiting for an asset right now.</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <form method="post" action="?/waitlistAdd" class="border-t border-[var(--cairn-card-border)] p-6">
      <h2 class="mb-3 text-sm font-semibold">Add to the waitlist</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <SelectField label="Asset type" name="assetType" bind:value={waitlistAssetType} options={assetTypeOptions} />
        <TextField label="Search member" name="memberQuery" type="search" placeholder="Name or email" bind:value={memberQuery} />
        <SelectField label="Member" name="memberId" bind:value={waitlistMemberId} options={memberSelectOptions} />
        <TextField label="Notes" name="notes" bind:value={waitlistNotes} />
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Add to waitlist</button>
      </div>
    </form>
  {/if}
</OfficeList>

<dialog bind:this={releaseDialog} class="modal" oncancel={(event) => event.preventDefault()}>
  <div class="modal-box">
    <h2 class="text-lg font-bold">Release {releaseTargetLabel}?</h2>
    <p class="py-2 text-sm text-muted">The asset returns to the pool. This does not remove its payment history.</p>
    <form method="dialog">
      <CsrfField />
      <div class="modal-action">
        <!-- svelte-ignore a11y_autofocus -->
        <button type="submit" class="btn" autofocus formnovalidate>Cancel</button>
        <button type="submit" class="btn btn-error" formmethod="post" formaction="?/release" name="assignmentId" value={releaseTargetId}>
          Release
        </button>
      </div>
    </form>
  </div>
</dialog>

<dialog bind:this={paymentDialog} class="modal">
  <div class="modal-box">
    <h2 class="text-lg font-bold">Record a payment</h2>
    <p class="py-2 text-sm text-muted">{paymentTargetLabel}</p>
    <form method="post" action="?/recordPayment" class="flex flex-col gap-3">
      <CsrfField />
      <input type="hidden" name="assignmentId" value={paymentTargetId} />
      <FieldLabel label="Amount (USD)">
        <input class="input input-sm" type="number" min="1" step="1" name="amount" bind:value={paymentAmount} />
      </FieldLabel>
      <SelectField label="Method" name="method" bind:value={paymentMethod} options={paymentMethodOptions} />
      <TextField label="Reference" name="reference" placeholder="Check #1234" bind:value={paymentReference} />
      <div class="modal-action">
        <button type="button" class="btn btn-sm" onclick={() => paymentDialog?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">Record payment</button>
      </div>
    </form>
  </div>
</dialog>
