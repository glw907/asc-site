<!--
@component
The Classes edit screen (Task 6, plus Task 7's waitlist/offer section): the detail form over a
live asc-club row, the same destructive-confirm `<dialog>` recipe `events/[id]/+page.svelte`
already established, plus sections that screen has no equivalent of: instructor assignment (add
by email, remove), the read-only roster, and the waitlist's own per-entry offer state. Every extra
section posts to this route's own actions, independent of the main edit form below them.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import ClassForm from '../ClassForm.svelte';
  import type { ClassTrack } from '$admin-club/lib/classes-store';
  import { formatClubTimestamp } from '$admin-club/lib/ui';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let deleteDialog: HTMLDialogElement | undefined = $state();

  // One resolved offer, or none, per waitlist entry: `activeOffer` is the unresolved row (the
  // load already swept any past-expiry one to `'expired'`), `history` is every offer that entry
  // has ever had resolved, most recent first (the detail screen's own "resolved states render as
  // history chips" requirement). A claimed offer's own waitlist row no longer exists (`claimOffer`
  // deletes it), so a history chip is only ever `'declined'` or `'expired'` here.
  const waitlistView = $derived(
    data.waitlist.map((entry) => {
      const entryOffers = data.offers.filter((offer) => offer.waitlistId === entry.id);
      return {
        entry,
        activeOffer: entryOffers.find((offer) => offer.resolved === null) ?? null,
        history: entryOffers.filter((offer) => offer.resolved !== null),
      };
    }),
  );

  // A one-time seed from the load's own current row, not a live mirror (the same `untrack`
  // idiom `events/[id]/+page.svelte` and the Settings screen already use): the post-submit
  // re-render must not clobber whatever the editor just typed.
  let name = $state(untrack(() => data.class?.name ?? ''));
  let slug = $state(untrack(() => data.class?.slug ?? ''));
  let track = $state<ClassTrack>(untrack(() => data.class?.track ?? 'adult-teen'));
  let capacity = $state(untrack(() => String(data.class?.capacity ?? '')));
  let fee = $state(untrack(() => String(data.class?.fee ?? '')));
  let startDate = $state(untrack(() => data.class?.startDate ?? ''));
  let endDate = $state(untrack(() => data.class?.endDate ?? ''));
  let location = $state(untrack(() => data.class?.location ?? ''));
  let description = $state(untrack(() => data.class?.description ?? ''));
  let instructorNotes = $state(untrack(() => data.class?.instructorNotes ?? ''));
  let customNote = $state(untrack(() => data.class?.customNote ?? ''));
  let visible = $state(untrack(() => data.class?.visible ?? true));

  let newInstructorEmail = $state('');
  let newInstructorName = $state('');
</script>

<a href="/admin/club/classes" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Classes
</a>

{#if !data.class}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 py-10 text-center shadow-[var(--cairn-shadow)]">
    <p class="text-sm text-muted">
      {data.error ?? 'No such class. It may have been deleted, or this link is stale.'}
    </p>
  </div>
{:else}
  <!-- Keyed on the class's own id: without this, navigating from one class's detail screen
       straight to another's (both matching this same dynamic route) reuses the component
       instance, and the `$state(untrack(...))` seeds above only ever run once, leaving the
       form showing the PREVIOUS class's values under the new class's own submit actions. -->
  {#key data.class.id}
  <OfficeList
    eyebrow="Club"
    title={data.class.name}
    subtitle="{data.class.enrolledCount}/{data.class.capacity} enrolled, {data.class.isFull ? 'full' : 'open'}."
  >
    {#snippet action()}
      <button type="button" class="btn btn-ghost btn-sm text-error" onclick={() => deleteDialog?.showModal()}>
        Delete
      </button>
    {/snippet}
    {#if form?.error}
      <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
        {form.error}
      </p>
    {/if}
    <form method="post" action="?/update">
      <ClassForm
        bind:name
        bind:slug
        bind:track
        bind:capacity
        bind:fee
        bind:startDate
        bind:endDate
        bind:location
        bind:description
        bind:instructorNotes
        bind:customNote
        bind:visible
        heroImage={data.class.heroImage}
        heroImageAlt={data.class.heroImageAlt}
      />
      <div class="flex justify-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
        <CsrfField />
        <button type="submit" class="btn btn-primary btn-sm">Save</button>
      </div>
    </form>
  </OfficeList>

  <div class="mt-6 rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]">
    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="text-sm font-semibold">Instructors</h2>
      <p class="mt-1 text-sm text-muted">Assign by email; an instructor's own account arrives in a later pass.</p>
    </div>
    <ul class="divide-y divide-[var(--cairn-card-border)]">
      {#each data.instructors as instructor (instructor.email)}
        <li class="flex items-center justify-between gap-4 px-6 py-3">
          <span class="text-sm">
            <span class="font-medium">{instructor.name ?? instructor.email}</span>
            {#if instructor.name}<span class="text-muted"> &middot; {instructor.email}</span>{/if}
          </span>
          <form method="post" action="?/unassignInstructor">
            <CsrfField />
            <input type="hidden" name="email" value={instructor.email} />
            <button type="submit" class="btn btn-ghost btn-xs text-error">Remove</button>
          </form>
        </li>
      {:else}
        <li class="px-6 py-6 text-center text-sm text-muted">No instructor assigned yet.</li>
      {/each}
    </ul>
    <form method="post" action="?/assignInstructor" class="flex flex-wrap items-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
      <CsrfField />
      <label class="flex flex-col gap-1 text-sm">
        Email
        <input class="input input-sm" type="email" name="email" bind:value={newInstructorEmail} required />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Display name
        <input class="input input-sm" type="text" name="name" bind:value={newInstructorName} />
      </label>
      <button type="submit" class="btn btn-sm">Assign</button>
    </form>
  </div>

  <div class="mt-6 rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]">
    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="text-sm font-semibold">Roster</h2>
      <p class="mt-1 text-sm text-muted">
        {data.class.enrolledCount} enrolled, {data.class.waitlistCount} on the waitlist. Dropping an
        enrollee frees the spot; a nonempty waitlist gets an automatic offer.
      </p>
    </div>
    <ul class="divide-y divide-[var(--cairn-card-border)]">
      {#each data.enrollments as enrollment (enrollment.id)}
        <li class="flex items-center justify-between gap-4 px-6 py-3 text-sm">
          <span>{enrollment.memberId}</span>
          <span class="flex items-center gap-3">
            <span class="text-muted">{enrollment.feePaid ? 'Paid' : 'Unpaid'}</span>
            <form method="post" action="?/dropEnrollment">
              <input type="hidden" name="enrollmentId" value={enrollment.id} />
              <CsrfField />
              <button type="submit" class="btn btn-ghost btn-xs">Drop</button>
            </form>
          </span>
        </li>
      {:else}
        <li class="px-6 py-6 text-center text-sm text-muted">No one is enrolled yet.</li>
      {/each}
    </ul>
  </div>

  <div class="mt-6 rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]">
    <div class="border-b border-[var(--cairn-card-border)] p-6">
      <h2 class="text-sm font-semibold">Waitlist</h2>
      <p class="mt-1 text-sm text-muted">
        Position order. Offering a spot mints a one-time claim code; it appears here only once, right
        after you offer it.
      </p>
    </div>
    <ul class="divide-y divide-[var(--cairn-card-border)]">
      {#each waitlistView as { entry, activeOffer, history } (entry.id)}
        <li class="flex flex-col gap-2 px-6 py-3 text-sm">
          <div class="flex items-center justify-between gap-4">
            <span>
              <span class="font-medium">{entry.applicantName ?? entry.applicantEmail}</span>
              <span class="text-muted"> &middot; #{entry.position}</span>
            </span>
            {#if history.length > 0 && !activeOffer}
              <span class="badge badge-ghost badge-sm font-medium capitalize">{history[0].resolved}</span>
            {/if}
          </div>

          {#if activeOffer}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-box bg-base-200/60 px-3 py-2 text-sm">
              <span>Offered, expires {formatClubTimestamp(activeOffer.expiresAt)}.</span>
              <form method="post" action="?/cancelOffer">
                <CsrfField />
                <input type="hidden" name="waitlistId" value={entry.id} />
                <button type="submit" class="btn btn-ghost btn-xs text-error">Cancel offer</button>
              </form>
            </div>
            {#if form && 'offered' in form && form.offered?.waitlistId === entry.id}
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <label class="flex flex-1 flex-col gap-1" for={`claim-code-${entry.id}`}>
                  Claim code (copy it now; it will not show again)
                  <input id={`claim-code-${entry.id}`} class="input input-sm font-mono" readonly value={form.offered.token} />
                </label>
              </div>
            {/if}
          {:else}
            <form method="post" action="?/offer">
              <CsrfField />
              <input type="hidden" name="waitlistId" value={entry.id} />
              <button type="submit" class="btn btn-sm" disabled={data.class.isFull}>Offer the spot</button>
            </form>
          {/if}
        </li>
      {:else}
        <li class="px-6 py-6 text-center text-sm text-muted">No one is on the waitlist.</li>
      {/each}
    </ul>
  </div>

  <dialog bind:this={deleteDialog} class="modal" oncancel={(event) => event.preventDefault()}>
    <div class="modal-box">
      <h2 class="text-lg font-bold">Delete {data.class.name}?</h2>
      <p class="py-2 text-sm text-muted">
        This removes the class for good. There is no undo.
      </p>
      <form method="dialog">
        <CsrfField />
        <div class="modal-action">
          <!-- svelte-ignore a11y_autofocus -->
          <button type="submit" class="btn" autofocus formnovalidate>Cancel</button>
          <button type="submit" class="btn btn-error" formmethod="post" formaction="?/delete">Delete class</button>
        </div>
      </form>
    </div>
  </dialog>
  {/key}
{/if}
