<!--
@component
The Club section's Committees screen (member-directory pass T6): a minimal CRUD admin surface
over the whole roles model. Two views over the loaded data: Committees (create/edit/archive a
committee, and manage its roster -- add, approve or decline a pending request, change a role, or
remove a member) and Positions (assign/edit/remove a member_positions row and reorder it), each
grouped for an election-time sitting (by committee, and by title, per the task's own framing).
This screen is a deliberate stopgap the queued admin-nav-reorg + admin-roles pass absorbs later;
it stays intentionally small.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { FieldLabel, SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL } from '$admin-club/lib/ui';
  import {
    COMMITTEE_KINDS,
    COMMITTEE_ROLES,
    POSITION_KINDS,
    type CommitteeKind,
    type CommitteeMemberRow,
    type CommitteeRole,
    type CommitteeRow,
    type PositionKind,
  } from '$admin-club/lib/committees-store';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type View = 'committees' | 'positions';
  let view = $state<View>('committees');

  const VIEW_TABS: { id: View; label: string }[] = [
    { id: 'committees', label: 'Committees' },
    { id: 'positions', label: 'Positions' },
  ];

  const KIND_LABEL: Record<CommitteeKind, string> = { standing: 'Standing', established: 'Established' };
  const POSITION_KIND_LABEL: Record<PositionKind, string> = { officer: 'Officer', director: 'Director', appointed: 'Appointed' };

  const committeeGroups = $derived(
    data.committees.map((committee) => ({
      committee,
      rows: data.committeeMembers.filter((m: CommitteeMemberRow) => m.committeeId === committee.id),
    })),
  );
  const activeCommittees = $derived(committeeGroups.filter((g) => !g.committee.archived));
  const archivedCommittees = $derived(data.committees.filter((c: CommitteeRow) => c.archived));

  // A Map preserves insertion order, and `data.memberPositions` already arrives sorted by
  // sort_order then title (`listMemberPositions`'s own ORDER BY), so grouping by title here
  // needs no extra sort: every same-titled seat (three "Director" rows, say) lands together in
  // the order the roster already carries.
  const positionGroups = $derived.by(() => {
    const map = new Map<string, { title: string; kind: PositionKind; rows: typeof data.memberPositions }>();
    for (const row of data.memberPositions) {
      if (!map.has(row.title)) map.set(row.title, { title: row.title, kind: row.kind, rows: [] });
      map.get(row.title)!.rows.push(row);
    }
    return [...map.values()];
  });

  // -- new committee form --
  const kindOptions = COMMITTEE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }));
  let newName = $state('');
  let newDescription = $state('');
  let newKind = $state<CommitteeKind>('established');
  let newSortOrder = $state('0');

  // -- edit committee dialog --
  let editDialog: HTMLDialogElement | undefined = $state();
  let editId = $state('');
  let editName = $state('');
  let editDescription = $state('');
  let editKind = $state<CommitteeKind>('established');
  let editSortOrder = $state('0');
  function openEditDialog(committee: CommitteeRow) {
    editId = committee.id;
    editName = committee.name;
    editDescription = committee.description ?? '';
    editKind = committee.kind;
    editSortOrder = String(committee.sortOrder);
    editDialog?.showModal();
  }

  // -- add committee member form --
  const activeCommitteeOptions = $derived(data.committees.filter((c: CommitteeRow) => !c.archived).map((c) => ({ value: c.id, label: c.name })));
  let addCommitteeId = $state(untrack(() => data.committees.find((c: CommitteeRow) => !c.archived)?.id ?? ''));
  let memberQuery = $state('');
  let addMemberId = $state('');
  let addRole = $state<CommitteeRole>('member');
  const roleOptions = COMMITTEE_ROLES.map((r) => ({ value: r, label: r }));
  const filteredMembers = $derived(
    data.memberOptions.filter((m) => {
      const q = memberQuery.trim().toLowerCase();
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q) || m.householdName.toLowerCase().includes(q);
    }),
  );
  // Same already-picked-stays-selectable fix `assets/+page.svelte`'s own member picker documents.
  const memberSelectOptions = $derived.by(() => {
    const base = filteredMembers;
    const picked = data.memberOptions.find((m) => m.memberId === addMemberId);
    const list = picked && !base.includes(picked) ? [picked, ...base] : base;
    return list.map((m) => ({ value: m.memberId, label: `${m.name} (${m.householdName})` }));
  });

  // -- new position form --
  const positionKindOptions = POSITION_KINDS.map((k) => ({ value: k, label: POSITION_KIND_LABEL[k] }));
  let newPositionMemberId = $state('');
  let newPositionKind = $state<PositionKind>('appointed');
  let newPositionTitle = $state('');

  // -- edit position dialog --
  let editPositionDialog: HTMLDialogElement | undefined = $state();
  let editPositionId = $state('');
  let editPositionMemberId = $state('');
  let editPositionKind = $state<PositionKind>('appointed');
  let editPositionTitle = $state('');
  function openEditPositionDialog(row: (typeof data.memberPositions)[number]) {
    editPositionId = row.id;
    editPositionMemberId = row.memberId;
    editPositionKind = row.kind;
    editPositionTitle = row.title;
    editPositionDialog?.showModal();
  }

  const subtitle = $derived(
    data.error ? data.error : `${data.committees.length} committee(s), ${data.memberPositions.length} position(s).`,
  );
</script>

<OfficeList eyebrow="Club" title="Committees" {subtitle}>
  {#snippet action()}
    <div class="join" role="tablist" aria-label="Committees view">
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

  {#if view === 'committees'}
    {#each activeCommittees as group (group.committee.id)}
      <div class="border-b border-[var(--cairn-card-border)] p-6">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">
              {group.committee.name}
              <span class="badge badge-ghost badge-sm ml-1 font-medium">{KIND_LABEL[group.committee.kind]}</span>
            </h2>
            {#if group.committee.description}<p class="mt-1 text-sm text-muted">{group.committee.description}</p>{/if}
          </div>
          <div class="flex gap-1">
            <button type="button" class="btn btn-ghost btn-xs" onclick={() => openEditDialog(group.committee)}>Edit</button>
            <form method="post" action="?/archiveCommittee">
              <CsrfField />
              <input type="hidden" name="committeeId" value={group.committee.id} />
              <input type="hidden" name="archived" value="true" />
              <button type="submit" class="btn btn-ghost btn-xs text-error">Archive</button>
            </form>
          </div>
        </div>
        <table class="table">
          <caption class="sr-only">{group.committee.name} roster</caption>
          <thead>
            <tr>
              <th class={HEADER_CELL}>Member</th>
              <th class="{HEADER_CELL} w-32">Role</th>
              <th class="{HEADER_CELL} w-24">Status</th>
              <th class="{HEADER_CELL} w-40"></th>
            </tr>
          </thead>
          <tbody>
            {#each group.rows as row (row.id)}
              <tr class="transition-colors hover:bg-base-200/60">
                <td class="text-sm font-medium">{row.memberName}</td>
                <td>
                  {#if row.status === 'active'}
                    <form method="post" action="?/setMemberRole">
                      <CsrfField />
                      <input type="hidden" name="committeeMemberId" value={row.id} />
                      <select
                        name="role"
                        class="select select-xs"
                        value={row.role}
                        onchange={(event) => event.currentTarget.form?.requestSubmit()}
                      >
                        {#each roleOptions as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
                      </select>
                    </form>
                  {:else}
                    <span class="badge badge-ghost badge-sm font-medium">{row.role}</span>
                  {/if}
                </td>
                <td>
                  <span class="badge badge-sm font-medium {row.status === 'pending' ? 'badge-warning' : 'border-transparent bg-primary/10 text-primary'}">
                    {row.status}
                  </span>
                </td>
                <td class="flex justify-end gap-1">
                  {#if row.status === 'pending'}
                    <form method="post" action="?/approveMember">
                      <CsrfField />
                      <input type="hidden" name="committeeMemberId" value={row.id} />
                      <button type="submit" class="btn btn-ghost btn-xs">Approve</button>
                    </form>
                    <form method="post" action="?/declineMember">
                      <CsrfField />
                      <input type="hidden" name="committeeMemberId" value={row.id} />
                      <button type="submit" class="btn btn-ghost btn-xs text-error">Decline</button>
                    </form>
                  {:else}
                    <form method="post" action="?/removeMember">
                      <CsrfField />
                      <input type="hidden" name="committeeMemberId" value={row.id} />
                      <button type="submit" class="btn btn-ghost btn-xs text-error">Remove</button>
                    </form>
                  {/if}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="4" class="px-6 py-6 text-center text-sm text-muted">No one is on this committee yet.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}

    <form method="post" action="?/createCommittee" class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="mb-3 text-sm font-semibold">New committee</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" name="name" bind:value={newName} />
        <SelectField label="Kind" name="kind" bind:value={newKind} options={kindOptions} />
        <FieldLabel label="Sort order">
          <input class="input input-sm" type="number" step="1" name="sortOrder" bind:value={newSortOrder} />
        </FieldLabel>
      </div>
      <FieldLabel label="Description">
        <textarea class="textarea textarea-sm mt-3 w-full" name="description" rows="2" bind:value={newDescription}></textarea>
      </FieldLabel>
      <div class="mt-3 flex justify-end gap-2">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Create committee</button>
      </div>
    </form>

    <form method="post" action="?/addMember" class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="mb-3 text-sm font-semibold">Add a committee member</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <SelectField label="Committee" name="committeeId" bind:value={addCommitteeId} options={activeCommitteeOptions} />
        <SelectField label="Role" name="role" bind:value={addRole} options={roleOptions} />
        <TextField label="Search member" name="memberQuery" type="search" placeholder="Name, email, or household" bind:value={memberQuery} />
        <SelectField label="Member" name="memberId" bind:value={addMemberId} options={memberSelectOptions} />
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Add member</button>
      </div>
    </form>

    {#if archivedCommittees.length > 0}
      <div class="p-6">
        <h2 class="mb-3 text-sm font-semibold text-muted">Archived committees</h2>
        <ul class="flex flex-col gap-2">
          {#each archivedCommittees as committee (committee.id)}
            <li class="flex items-center justify-between text-sm">
              <span class="text-muted">{committee.name}</span>
              <form method="post" action="?/archiveCommittee">
                <CsrfField />
                <input type="hidden" name="committeeId" value={committee.id} />
                <input type="hidden" name="archived" value="false" />
                <button type="submit" class="btn btn-ghost btn-xs">Restore</button>
              </form>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else}
    {#each positionGroups as group (group.title)}
      <div class="border-b border-[var(--cairn-card-border)] p-6">
        <h2 class="mb-3 text-sm font-semibold">
          {group.title}
          <span class="badge badge-ghost badge-sm ml-1 font-medium">{POSITION_KIND_LABEL[group.kind]}</span>
        </h2>
        <table class="table">
          <caption class="sr-only">{group.title} holders</caption>
          <thead>
            <tr>
              <th class={HEADER_CELL}>Member</th>
              <th class="{HEADER_CELL} w-48"></th>
            </tr>
          </thead>
          <tbody>
            {#each group.rows as row, index (row.id)}
              <tr class="transition-colors hover:bg-base-200/60">
                <td class="text-sm font-medium">{row.memberName}</td>
                <td class="flex justify-end gap-1">
                  <form method="post" action="?/movePosition">
                    <CsrfField />
                    <input type="hidden" name="positionId" value={row.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" class="btn btn-ghost btn-xs" aria-label="Move {row.memberName} up" disabled={index === 0}>Up</button>
                  </form>
                  <form method="post" action="?/movePosition">
                    <CsrfField />
                    <input type="hidden" name="positionId" value={row.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      class="btn btn-ghost btn-xs"
                      aria-label="Move {row.memberName} down"
                      disabled={index === group.rows.length - 1}
                    >
                      Down
                    </button>
                  </form>
                  <button type="button" class="btn btn-ghost btn-xs" onclick={() => openEditPositionDialog(row)}>Edit</button>
                  <form method="post" action="?/removePosition">
                    <CsrfField />
                    <input type="hidden" name="positionId" value={row.id} />
                    <button type="submit" class="btn btn-ghost btn-xs text-error">Remove</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="px-6 py-10 text-center text-sm text-muted">No positions are assigned yet.</p>
    {/each}

    <form method="post" action="?/createPosition" class="p-6">
      <h2 class="mb-3 text-sm font-semibold">New position</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <TextField label="Search member" name="memberQuery" type="search" placeholder="Name, email, or household" bind:value={memberQuery} />
        <SelectField label="Member" name="memberId" bind:value={newPositionMemberId} options={memberSelectOptions} />
        <SelectField label="Kind" name="kind" bind:value={newPositionKind} options={positionKindOptions} />
        <TextField label="Title" name="title" placeholder="Commodore" bind:value={newPositionTitle} />
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Assign position</button>
      </div>
    </form>
  {/if}
</OfficeList>

<dialog bind:this={editDialog} class="modal">
  <div class="modal-box">
    <h2 class="text-lg font-bold">Edit committee</h2>
    <form method="post" action="?/updateCommittee" class="flex flex-col gap-3 py-2">
      <CsrfField />
      <input type="hidden" name="committeeId" value={editId} />
      <TextField label="Name" name="name" bind:value={editName} />
      <SelectField label="Kind" name="kind" bind:value={editKind} options={kindOptions} />
      <FieldLabel label="Sort order">
        <input class="input input-sm" type="number" step="1" name="sortOrder" bind:value={editSortOrder} />
      </FieldLabel>
      <FieldLabel label="Description">
        <textarea class="textarea textarea-sm w-full" name="description" rows="2" bind:value={editDescription}></textarea>
      </FieldLabel>
      <div class="modal-action">
        <button type="button" class="btn btn-sm" onclick={() => editDialog?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">Save</button>
      </div>
    </form>
  </div>
</dialog>

<dialog bind:this={editPositionDialog} class="modal">
  <div class="modal-box">
    <h2 class="text-lg font-bold">Edit position</h2>
    <form method="post" action="?/updatePosition" class="flex flex-col gap-3 py-2">
      <CsrfField />
      <input type="hidden" name="positionId" value={editPositionId} />
      <input type="hidden" name="memberId" value={editPositionMemberId} />
      <SelectField label="Kind" name="kind" bind:value={editPositionKind} options={positionKindOptions} />
      <TextField label="Title" name="title" bind:value={editPositionTitle} />
      <div class="modal-action">
        <button type="button" class="btn btn-sm" onclick={() => editPositionDialog?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">Save</button>
      </div>
    </form>
  </div>
</dialog>
