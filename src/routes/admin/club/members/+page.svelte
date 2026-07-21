<!--
@component
The Club section's Members screen (household-grouped list; Members pass T7 rebuild,
docs/2026-07-20-members-pass-design.md): search-first household rows built entirely from the
toolkit (`$admin-club/toolkit`) plus this route's own layout -- `ListToolbar` (search, the four
promoted filters, the primary "Add household" action, applied-filter pills, the scope-stating
count line), `AdminTable`/`ExpandableRow` (the compact zebra rows, one expanded household panel at
a time), `StatusChip` (standing and paid/owing states), and `Pagination`. Any styling this screen
needs beyond a toolkit component's own contract lives in this file's own scoped `<style>` block
(the panel grid, cell truncation, the archived toggle) -- never a bespoke component, per the
toolkit README's own compiled-CSS constraint (`/admin/**` loads only cairn's precompiled CSS, so
an unverified Tailwind utility silently renders nothing there).

Search/standing/holdings/role/class/archived filtering is all server-driven
(`+page.server.ts`'s own header explains why: a matched member's own phone/name never reaches the
client in a form a client-side re-filter could reproduce), so every control push here is a `goto`
that reloads `data.households`; pagination alone stays client-side over that already-filtered set.
The expanded panel needs no separate fetch and no navigation at all: `listHouseholds` already
returns every row's full contacts/members/holdings/enrollments alongside it
(`households-store.ts`'s own header on why), so `ExpandableRow`'s `datum` prop already carries
everything the panel renders.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { goto } from '$app/navigation';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL } from '$admin-club/lib/ui';
  import { HOUSEHOLD_STANDING_CHIP, HOUSEHOLD_STANDING_TONE } from '$admin-club/lib/member-format';
  import type { HouseholdListRow, HouseholdMemberChip } from '$admin-club/lib/households-store';
  import type { AssetPaymentStanding } from '$admin-club/lib/assets-store';
  import { ageFromBirthdate } from '$admin-club/toolkit/format';
  import StatusChip, { type StatusChipTone } from '$admin-club/toolkit/StatusChip.svelte';
  import AdminTable from '$admin-club/toolkit/AdminTable.svelte';
  import ExpandableRow from '$admin-club/toolkit/ExpandableRow.svelte';
  import ListToolbar, { type ListToolbarFilter } from '$admin-club/toolkit/ListToolbar.svelte';
  import Pagination from '$admin-club/toolkit/Pagination.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // -- add household dialog (the walk-up-join entry point) --
  let addHouseholdDialog: HTMLDialogElement | undefined = $state();
  let newHouseholdName = $state('');
  let newHouseholdCity = $state('');
  let newMemberName = $state('');
  let newMemberEmail = $state('');
  let newMemberPhone = $state('');
  let newMemberBirthdate = $state('');
  function openAddHouseholdDialog() {
    newHouseholdName = '';
    newHouseholdCity = '';
    newMemberName = '';
    newMemberEmail = '';
    newMemberPhone = '';
    newMemberBirthdate = '';
    addHouseholdDialog?.showModal();
  }

  const PAGE_SIZE = 10;

  type StandingFilterValue = 'members' | 'current' | 'overdue' | 'former';
  type HoldingsFilterValue = 'all' | 'holding';
  type RoleFilterValue = 'all' | 'instructor';

  // Seeded once from the URL `load` already parsed; every later change flows the other way (this
  // state pushes a new URL via `pushFilters`, not the reverse), so `untrack` here is deliberate,
  // not a missed dependency (mirrors the Assets screen's own seeding idiom).
  let searchQuery = $state(untrack(() => data.search));
  let standingFilter = $state<StandingFilterValue>(untrack(() => data.standing));
  let holdingsFilter = $state<HoldingsFilterValue>(untrack(() => data.holdings));
  let roleFilter = $state<RoleFilterValue>(untrack(() => data.role));
  let classFilter = $state(untrack(() => data.classId));
  let includeArchived = $state(untrack(() => data.includeArchived));
  let page = $state(1);
  let expandedId: string | null = $state(null);

  /** Push the current filter state into the URL (a `goto`, not a form submit): SvelteKit re-runs
   *  `+page.server.ts`'s `load` and swaps in the new `data.households` without a full page
   *  reload. `keepFocus` matters for the search box, which calls this on every keystroke via the
   *  debounce below. */
  function pushFilters() {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (standingFilter !== 'members') params.set('standing', standingFilter);
    if (holdingsFilter !== 'all') params.set('holdings', holdingsFilter);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (classFilter !== 'all') params.set('class', classFilter);
    if (includeArchived) params.set('archived', '1');
    const query = params.toString();
    goto(query ? `?${query}` : '?', { replaceState: true, keepFocus: true, noScroll: true, invalidateAll: true });
  }

  let debounceHandle: ReturnType<typeof setTimeout> | undefined;
  function scheduleSearchPush() {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(pushFilters, 300);
  }

  function onSearch(value: string) {
    searchQuery = value;
    scheduleSearchPush();
  }

  // The four promoted filters and the archived checkbox are discrete controls (no debounce
  // needed); `skipFirstRun` keeps the initial mount (local state already matches the URL `load`
  // produced) from firing a redundant `goto`.
  let skipFirstRun = true;
  $effect(() => {
    standingFilter;
    holdingsFilter;
    roleFilter;
    classFilter;
    includeArchived;
    if (skipFirstRun) {
      skipFirstRun = false;
      return;
    }
    clearTimeout(debounceHandle);
    pushFilters();
  });

  // Any filter change can strand the current page past the new result count, so every reload
  // resets to page 1 rather than showing an empty page with real rows still above it.
  $effect(() => {
    data.households;
    page = 1;
  });

  const filters: ListToolbarFilter[] = $derived([
    {
      id: 'standing',
      label: 'Standing',
      value: standingFilter,
      defaultValue: 'members',
      options: [
        { value: 'members', label: 'Current + Overdue' },
        { value: 'current', label: HOUSEHOLD_STANDING_CHIP.current.label },
        { value: 'overdue', label: HOUSEHOLD_STANDING_CHIP.overdue.label },
        { value: 'former', label: HOUSEHOLD_STANDING_CHIP.former.label },
      ],
      onChange: (value) => (standingFilter = value as StandingFilterValue),
    },
    {
      id: 'holdings',
      label: 'Holdings',
      value: holdingsFilter,
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'Any holdings' },
        { value: 'holding', label: 'Holding assets' },
      ],
      onChange: (value) => (holdingsFilter = value as HoldingsFilterValue),
    },
    {
      id: 'role',
      label: 'Role',
      value: roleFilter,
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'Any role' },
        { value: 'instructor', label: 'Instructor' },
      ],
      onChange: (value) => (roleFilter = value as RoleFilterValue),
    },
    {
      id: 'class',
      label: 'Class',
      value: classFilter,
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'Any class' },
        ...data.classOptions.map((cls) => ({ value: cls.id, label: cls.name })),
      ],
      onChange: (value) => (classFilter = value),
    },
  ]);

  const totalPages = $derived(Math.max(1, Math.ceil(data.households.length / PAGE_SIZE)));
  const pageStart = $derived((page - 1) * PAGE_SIZE);
  const paged = $derived(data.households.slice(pageStart, pageStart + PAGE_SIZE));

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  /** The row's own "phone" column and the panel's own Contacts section both read the same
   *  member: the primary, or the first member on file when no primary is set (the visible-but-
   *  empty edge case `households-store.ts`'s own header names). */
  function primaryContact(row: HouseholdListRow): HouseholdMemberChip | undefined {
    return row.members.find((member) => member.isPrimary) ?? row.members[0];
  }

  const HOLDING_STATUS: Record<AssetPaymentStanding, { label: string; tone: StatusChipTone }> = {
    paid: { label: 'Paid', tone: 'success' },
    outstanding: { label: 'Outstanding', tone: 'warning' },
    'not-billed': { label: 'Not billed', tone: 'neutral' },
  };
</script>

<!-- Announces filter/page changes to assistive tech without re-reading the whole table, the same
     pattern the Events screen's filter uses. -->
<span class="sr-only" role="status">
  Showing {data.households.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, data.households.length)} of {data.households.length} households
</span>

<OfficeList eyebrow="Club" title="Members" subtitle="Household roster, standing, and quick actions.">
  {#if form?.error}
    <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
      {form.error}
    </p>
  {/if}
  {#if data.error}
    <!-- text-error, not text-warning: the latter doesn't compile in the packaged cairn-admin.css
         (only bg-warning's bare, unmodified form does), so it silently rendered as plain body
         text; text-error compiles and matches the form-error banner above it, which is the more
         accurate read for a failed load anyway. -->
    <p class="px-6 py-10 text-center text-sm text-error">{data.error}</p>
  {:else}
    <div class="members-toolbar-band border-b border-[var(--cairn-card-border)] p-6">
      <ListToolbar
        search={searchQuery}
        {onSearch}
        searchLabel="Search by name, standing, or phone"
        autofocus
        {filters}
        primaryAction={{ label: 'Add household', onClick: openAddHouseholdDialog }}
        count={data.households.length}
        itemLabel="households"
      />
      <!-- Reads as the toolbar's own scope line, not a separately floated afterthought: matches
           the count line's own type scale/color and sits at the same vertical rhythm ListToolbar's
           internal `gap` uses between its own stacked lines. -->
      <label class="members-archived-toggle">
        <input type="checkbox" class="checkbox checkbox-sm members-archived-checkbox" bind:checked={includeArchived} />
        <span>Include archived</span>
      </label>
    </div>

    <AdminTable density="sm" zebra rowCount={paged.length} emptyColspan={5}>
      {#snippet header()}
        <th class={HEADER_CELL}>Household</th>
        <th class={HEADER_CELL}>Members</th>
        <th class="{HEADER_CELL} w-32 members-narrow-hide">Standing</th>
        <th class="{HEADER_CELL} w-32 members-narrow-hide">Phone</th>
        <th class="sr-only">Details</th>
      {/snippet}
      {#snippet empty()}
        <p>No households match that search.</p>
      {/snippet}
      {#each paged as row (row.id)}
        {@const primary = primaryContact(row)}
        <ExpandableRow
          expanded={expandedId === row.id}
          onToggle={() => toggleExpanded(row.id)}
          datum={row}
          colspan={5}
          triggerLabel={expandedId === row.id ? `Collapse the ${row.name} household` : `Expand the ${row.name} household`}
        >
          {#snippet summary()}
            <td class="members-name-cell">{row.name}</td>
            <td class="members-cell">
              {#each row.members as member, i (member.id)}
                {#if i > 0}<span>, </span>{/if}
                {#if member.matchedSearch}<mark>{member.name}</mark>{:else}{member.name}{/if}<span class="text-muted">{member.isPrimary ? ' (primary)' : ''}</span>
              {:else}
                <span class="text-muted">No members on file</span>
              {/each}
            </td>
            <td class="members-narrow-hide">
              <StatusChip
                tone={HOUSEHOLD_STANDING_TONE[row.standing]}
                label={HOUSEHOLD_STANDING_CHIP[row.standing].label}
                legend={row.standing === 'former' && row.lastSeason ? `Last active ${row.lastSeason}` : undefined}
              />
            </td>
            <td class="text-sm members-narrow-hide">{primary?.phone ?? '—'}</td>
          {/snippet}
          {#snippet panel(datum: HouseholdListRow)}
            {@const contact = primaryContact(datum)}
            <div class="household-panel">
              <div class="household-panel-grid">
                <section>
                  <h2 class={HEADER_CELL}>Contacts</h2>
                  <p class="text-sm">{contact?.email ?? 'No email on file'}</p>
                  <p class="text-sm">{contact?.phone ?? 'No phone on file'}</p>
                </section>
                <section>
                  <h2 class={HEADER_CELL}>Members</h2>
                  <ul class="household-panel-list">
                    {#each datum.members as member (member.id)}
                      <li class="text-sm">
                        {member.name}{member.isPrimary ? ' · Primary' : ''} · Age {ageFromBirthdate(member.birthdate) ?? '—'}
                      </li>
                    {:else}
                      <li class="text-sm text-muted">No members on file.</li>
                    {/each}
                  </ul>
                </section>
                <section>
                  <h2 class={HEADER_CELL}>Holdings</h2>
                  <ul class="household-panel-list">
                    {#each datum.holdings as holding (holding.id)}
                      <li class="text-sm">
                        {holding.assetTypeName}
                        <StatusChip
                          tone={HOLDING_STATUS[holding.paymentStanding].tone}
                          label={HOLDING_STATUS[holding.paymentStanding].label}
                          size="xs"
                        />
                      </li>
                    {:else}
                      <li class="text-sm text-muted">No holdings.</li>
                    {/each}
                  </ul>
                </section>
                <section>
                  <h2 class={HEADER_CELL}>Classes</h2>
                  <ul class="household-panel-list">
                    {#each datum.enrollments as enrollment (enrollment.id)}
                      <li class="text-sm">
                        {enrollment.memberName} &middot; {enrollment.className} ({enrollment.season})
                        <StatusChip
                          tone={enrollment.feePaid ? 'success' : 'warning'}
                          label={enrollment.feePaid ? 'Paid' : 'Owing'}
                          size="xs"
                        />
                      </li>
                    {:else}
                      <li class="text-sm text-muted">No class enrollments.</li>
                    {/each}
                  </ul>
                </section>
              </div>
              <div class="household-panel-actions">
                <a class="btn btn-sm" href={`/admin/club/members/${datum.id}`}>Open household</a>
                <a class="btn btn-sm" href={`/admin/club/email/compose?segment=household:${datum.id}`}>Email household</a>
                <a class="btn btn-sm" href={`/admin/club/members/${datum.id}?action=add-member`}>Add member</a>
              </div>
            </div>
          {/snippet}
        </ExpandableRow>
      {/each}
    </AdminTable>

    <div class="border-t border-[var(--cairn-card-border)] px-6 py-3">
      <Pagination
        {page}
        pageCount={totalPages}
        onPageChange={(p) => (page = p)}
        totalItems={data.households.length}
        pageSize={PAGE_SIZE}
        itemLabel="households"
      />
    </div>
  {/if}
</OfficeList>

<dialog bind:this={addHouseholdDialog} class="modal" aria-labelledby="add-household-dialog-title">
  <div class="modal-box">
    <h2 id="add-household-dialog-title" class="text-lg font-bold">Add a household</h2>
    <p class="py-2 text-sm text-muted">The walk-up-join entry point: a household and its first, primary member. Record a payment from the new desk afterward.</p>
    <form method="post" action="?/addHousehold" class="flex flex-col gap-3">
      <CsrfField />
      <TextField label="Household name" name="name" bind:value={newHouseholdName} />
      <TextField label="City" name="city" bind:value={newHouseholdCity} />
      <TextField label="Primary member's name" name="memberName" bind:value={newMemberName} />
      <TextField label="Email" name="memberEmail" type="email" bind:value={newMemberEmail} />
      <TextField label="Phone" name="memberPhone" bind:value={newMemberPhone} />
      <label class="flex flex-col gap-1 text-sm">
        Birthdate
        <input class="input input-sm" type="date" name="memberBirthdate" bind:value={newMemberBirthdate} />
      </label>
      <div class="modal-action">
        <button type="button" class="btn btn-sm" onclick={() => addHouseholdDialog?.close()}>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">Add household</button>
      </div>
    </form>
  </div>
</dialog>

<style>
  /* Layout only, per the toolkit README's own compiled-CSS constraint: `/admin/**` loads only
     cairn's precompiled CSS, so an arbitrary grid/truncation utility string would render nothing
     there. Values stay literal, matching every toolkit component's own scoped block. */
  .members-toolbar-band {
    display: flex;
    flex-direction: column;
  }

  .members-archived-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    /* Matches ListToolbar's own internal `gap` (0.625rem) so this reads as one more line of the
       toolbar's own vertical rhythm, not a separately floated afterthought; the label's own type
       scale/color below matches the count line's for the same reason. */
    margin-top: 0.625rem;
    width: fit-content;
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--color-muted);
  }

  /* daisyUI's own `--radius-selector` renders `.checkbox` closer to a full circle than a checkbox
     at this small size; a checkbox reads its own semantics through a visibly square (if rounded)
     box, never a circle, which is a radio's own shape language. */
  .members-archived-checkbox {
    border-radius: 0.25rem;
  }

  .members-name-cell {
    font-weight: 600;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .members-cell {
    max-width: 22rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* At a phone width the household-name and members cells otherwise clip mid-word at the
     viewport's own edge before either cell's `max-width` above is ever reached (the table's real
     row is wider than the screen, and the outer scroll containers use overlay scrollbars with no
     visible affordance) -- narrowing both here moves the truncation boundary inside the visible
     viewport, so the ellipsis these two cells already carry actually renders.

     Standing and Phone drop out of the summary row entirely at this width (both already show in
     full inside the expanded panel): a `<td colspan>` panel is real table layout, so its own width
     can never be narrower than the summary rows' widest computed column sum (`ExpandableRow`'s own
     header comment explains why `display: block` doesn't get around this). Dropping these two
     columns is what lets the *whole* row, panel included, fit the viewport with nothing left to
     scroll -- the fix for the coherence round's 390 blocker, not just a phone-cell truncation
     tweak -- and the household/members cells below get the freed-up width back rather than staying
     as cramped as they'd need to be with five columns still fighting for the same space. */
  @media (max-width: 640px) {
    .members-name-cell {
      max-width: 9rem;
    }

    .members-cell {
      max-width: 9rem;
    }

    .members-narrow-hide {
      display: none;
    }
  }

  /* A quiet search-match highlight in the admin theme's own vocabulary, never the browser default
     yellow `<mark>` (glaring in dark, off-palette in light): a light tint of the admin theme's own
     primary color, with the surrounding text's own color left untouched (a measured 9.9:1+
     contrast in both admin themes, well past AA) so the tint never overrides a color a reader
     already relies on to read the row. */
  .members-cell mark {
    background-color: color-mix(in oklab, var(--color-primary) 20%, transparent);
    color: inherit;
    font-weight: 600;
    border-radius: 0.2rem;
    padding: 0 0.15rem;
  }

  .household-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .household-panel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1.5rem;
  }

  .household-panel-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  .household-panel-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--cairn-card-border);
  }
</style>
