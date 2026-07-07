<!--
@component
The Classes edit screen (Task 6): the detail form over a live asc-club row, the same
destructive-confirm `<dialog>` recipe `events/[id]/+page.svelte` already established, plus two
sections that screen has no equivalent of: instructor assignment (add by email, remove) and the
read-only roster (enrolled rows, this pass) with the waitlist count. Both extra sections post to
this route's own actions, independent of the main edit form below them.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import ClassForm from '../ClassForm.svelte';
  import type { ClassTrack } from '$admin-club/lib/classes-store';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let deleteDialog: HTMLDialogElement | undefined = $state();

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
        bind:visible
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
        {data.class.enrolledCount} enrolled, {data.class.waitlistCount} on the waitlist. Read-only this pass.
      </p>
    </div>
    <ul class="divide-y divide-[var(--cairn-card-border)]">
      {#each data.enrollments as enrollment (enrollment.id)}
        <li class="flex items-center justify-between gap-4 px-6 py-3 text-sm">
          <span>{enrollment.memberId}</span>
          <span class="text-muted">{enrollment.feePaid ? 'Paid' : 'Unpaid'}</span>
        </li>
      {:else}
        <li class="px-6 py-6 text-center text-sm text-muted">No one is enrolled yet.</li>
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
{/if}
