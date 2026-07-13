<!--
@component
The Club section's Settings screen (Task 4, extended pass 2.2): who holds an owner or admin seat,
how long a waitlist offer stays open before it expires, the three membership tier prices, and the
season rollover. All are the kind of setting an owner touches rarely, so one screen suits them
better than several. Every write is owner-only (see the route's own header comment); an admin
still sees the roster and every current value, just not the forms to change any of them, the same
"sees the section, some actions still refuse" posture Signups already uses for its own audit-gated
writes.

The rollover section is this screen's one DESTRUCTIVE action (per the design suite's own naming:
"the type-to-confirm gate every serious admin uses"): a `<dialog>` asking the owner to type the
NEW season year exactly, the same confirm-dialog recipe `classes/[id]/+page.svelte`'s delete
dialog uses, adapted from a plain Cancel/Delete choice to a typed match. The client-side
`matchesExpectedYear` check is pure UX (a disabled button before the owner has finished typing);
the server's own `runSeasonRollover` re-validates the exact same string, and that check is the
only one that actually matters (see `rollover.ts`'s own header on why the confirm gate and the
forward-only check collapse into the one comparison).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageData, ActionData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import { SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatCivilDate } from '$admin-club/lib/ui';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let newRoleEmail = $state('');
  let newRole = $state('admin');
  // A one-time seed from the load's current value, not a live mirror (the post-submit re-render
  // would otherwise clobber whatever the owner just typed); `untrack` marks that deliberately, the
  // same idiom the engine's own settings screens use (CairnTidySettings.svelte).
  let offerWindowHours = $state(untrack(() => (data.offerWindowHours == null ? '' : String(data.offerWindowHours))));
  let classRegistrationOpens = $state(untrack(() => data.classRegistrationOpens ?? ''));
  let individualPrice = $state(untrack(() => (data.tierPrices == null ? '' : String(data.tierPrices.individual))));
  let familyPrice = $state(untrack(() => (data.tierPrices == null ? '' : String(data.tierPrices.family))));
  let youngAdultPrice = $state(untrack(() => (data.tierPrices == null ? '' : String(data.tierPrices['young-adult']))));

  let rolloverDialog: HTMLDialogElement | undefined = $state();
  let typedYear = $state('');
  const matchesExpectedYear = $derived(data.rollover != null && typedYear.trim() === String(data.rollover.nextSeason));

  // A successful rollover re-runs `load` (SvelteKit's own post-action behavior), so `data.rollover`
  // already reflects the new season by the time this fires; the dialog itself has no reason to stay
  // open once that has happened, and the typed year is now stale against the new `nextSeason`.
  $effect(() => {
    if (form && 'rollover' in form && form.rollover) {
      rolloverDialog?.close();
      typedYear = '';
    }
  });

  const subtitle = $derived(data.error ?? 'Club roles, the waitlist offer window, tier prices, and the season.');
</script>

<OfficeList eyebrow="Club" title="Settings" {subtitle}>
  {#if form?.error}
    <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
      {form.error}
    </p>
  {/if}

  <div class="grid gap-8 p-6 lg:grid-cols-2">
    <section>
      <h2 class={HEADER_CELL}>Club roles</h2>
      <ul class="list mt-3">
        {#each data.roles as grant (grant.email + grant.role)}
          <li class="list-row items-center">
            <div class="list-col-grow">
              <span class="font-semibold">{grant.email}</span>
              <span class="badge badge-ghost badge-sm ml-2 font-medium">{grant.role === 'owner' ? 'Owner' : 'Admin'}</span>
              <p class="text-xs text-muted">
                Granted by {grant.grantedBy} &middot; {formatCivilDate(grant.grantedAt.slice(0, 10))}
              </p>
            </div>
            {#if data.isOwner}
              <form method="post" action="?/removeRole">
                <input type="hidden" name="email" value={grant.email} />
                <CsrfField />
                <button type="submit" class="btn btn-ghost btn-sm">Revoke</button>
              </form>
            {/if}
          </li>
        {:else}
          <li class="list-row">
            <p class="w-full py-4 text-center text-sm text-muted">No roles granted yet.</p>
          </li>
        {/each}
      </ul>

      {#if data.isOwner}
        <form method="post" action="?/setRole" class="mt-4 flex flex-wrap items-end gap-3">
          <TextField label="Email" name="email" type="email" bind:value={newRoleEmail} />
          <SelectField
            label="Role"
            name="role"
            bind:value={newRole}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'owner', label: 'Owner' },
            ]}
          />
          <CsrfField />
          <button type="submit" class="btn btn-sm">Grant</button>
        </form>
      {/if}
    </section>

    <section>
      <h2 class={HEADER_CELL}>Waitlist offer window</h2>
      <p class="mt-1 text-sm text-muted">
        How long a class waitlist offer stays open before it expires and the spot frees up.
      </p>
      {#if data.isOwner}
        <form method="post" action="?/updateOfferWindow" class="mt-3 flex flex-wrap items-end gap-3">
          <TextField label="Hours" name="offerWindowHours" bind:value={offerWindowHours} />
          <CsrfField />
          <button type="submit" class="btn btn-sm">Save</button>
        </form>
      {:else}
        <p class="mt-3 text-sm font-semibold">{data.offerWindowHours} hours</p>
      {/if}
    </section>

    <section>
      <h2 class={HEADER_CELL}>Class registration opens</h2>
      <p class="mt-1 text-sm text-muted">
        Before this date the public class schedule shows "Opens &lt;date&gt;" instead of Open.
        Clear it to disable the gate.
      </p>
      {#if data.isOwner}
        <form method="post" action="?/updateClassRegistrationOpens" class="mt-3 flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm" for="class-registration-opens">
            Opens
            <input
              id="class-registration-opens"
              class="input input-sm"
              type="date"
              name="classRegistrationOpens"
              bind:value={classRegistrationOpens}
            />
          </label>
          <CsrfField />
          <button type="submit" class="btn btn-sm">Save</button>
        </form>
      {:else}
        <p class="mt-3 text-sm font-semibold">{data.classRegistrationOpens || 'No gate configured'}</p>
      {/if}
    </section>

    <section>
      <h2 class={HEADER_CELL}>Membership tier prices</h2>
      <p class="mt-1 text-sm text-muted">
        Whole dollars. A change here only affects a membership purchased AFTER this save; every
        past season's own price stays exactly what was paid.
      </p>
      {#if data.isOwner}
        <form method="post" action="?/updateTierPrices" class="mt-3 flex flex-wrap items-end gap-3">
          <TextField label="Individual" name="individual" bind:value={individualPrice} />
          <TextField label="Family" name="family" bind:value={familyPrice} />
          <TextField label="Young adult" name="youngAdult" bind:value={youngAdultPrice} />
          <CsrfField />
          <button type="submit" class="btn btn-sm">Save</button>
        </form>
      {:else if data.tierPrices}
        <p class="mt-3 text-sm font-semibold">
          Individual ${data.tierPrices.individual} &middot; Family ${data.tierPrices.family} &middot; Young adult ${data
            .tierPrices['young-adult']}
        </p>
      {/if}
    </section>

    <section>
      <h2 class={HEADER_CELL}>Season</h2>
      {#if data.rollover}
        <p class="mt-1 text-sm text-muted">
          The current season is <span class="font-semibold text-base-content">{data.rollover.currentSeason}</span>.
          Rolling over to {data.rollover.nextSeason} lets
          {data.rollover.classesFallingOutOfCurrency}
          {data.rollover.classesFallingOutOfCurrency === 1 ? 'class' : 'classes'} and
          {data.rollover.waitlistFallingOutOfCurrency}
          waitlist {data.rollover.waitlistFallingOutOfCurrency === 1 ? 'entry' : 'entries'}
          fall out of currency. Nothing is deleted: past-season rows stay exactly as they are, and
          next season's classes are set up fresh through the Classes screen.
        </p>
        {#if data.isOwner}
          <button type="button" class="btn btn-outline btn-error btn-sm mt-3" onclick={() => rolloverDialog?.showModal()}>
            Roll over to {data.rollover.nextSeason}
          </button>
        {/if}
      {:else}
        <p class="mt-1 text-sm text-muted">The season could not be read.</p>
      {/if}
    </section>
  </div>
</OfficeList>

{#if data.rollover}
  <dialog bind:this={rolloverDialog} class="modal" oncancel={(event) => event.preventDefault()}>
    <div class="modal-box">
      <h2 class="text-lg font-bold">Roll over to {data.rollover.nextSeason}?</h2>
      <p class="py-2 text-sm text-muted">
        This advances the current season and nothing else: memberships and asset waitlists are
        untouched (neither is season-bound), and no class or waitlist row is deleted or edited.
        Type <span class="font-mono font-semibold">{data.rollover.nextSeason}</span> to confirm.
      </p>
      <form method="dialog">
        <label class="flex flex-col gap-1 text-sm" for="rollover-typed-year">
          New season year
          <input
            id="rollover-typed-year"
            class="input input-sm font-mono"
            type="text"
            inputmode="numeric"
            name="typedYear"
            bind:value={typedYear}
          />
        </label>
        <CsrfField />
        <div class="modal-action">
          <!-- svelte-ignore a11y_autofocus -->
          <button type="submit" class="btn" autofocus formnovalidate>Cancel</button>
          <button type="submit" class="btn btn-error" formmethod="post" formaction="?/rollover" disabled={!matchesExpectedYear}>
            Roll over the season
          </button>
        </div>
      </form>
    </div>
  </dialog>
{/if}
