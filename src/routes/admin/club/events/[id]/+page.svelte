<!--
@component
The Events edit screen (Task 5): the detail form over a live asc-club row, plus the delete
action behind the destructive-confirm `<dialog>` recipe the signup queue's Deny button already
established (docs/internal/daisyui-v5-hard-components.md): `method="dialog"`, the Cancel button
autofocused and `formnovalidate` so it always closes, the real Delete button overriding
`formmethod`/`formaction` to actually submit, and the dialog's own `cancel` event prevented so
ESC or a backdrop click can't quietly dismiss a genuinely rare, deliberate action. This is the
mockups' build-tier refinement: destructive actions move behind the detail's own confirm, never
a per-row trash icon on the list.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import EventForm from '../EventForm.svelte';
  import type { EventCategory } from '$admin-club/lib/events-store';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let deleteDialog: HTMLDialogElement | undefined = $state();

  // A one-time seed from the load's own current row, not a live mirror: the post-submit
  // re-render must not clobber whatever the editor just typed (the same `untrack` idiom the
  // Settings screen's offerWindowHours field and the engine's own CairnTidySettings.svelte use).
  let title = $state(untrack(() => data.event?.title ?? ''));
  let slug = $state(untrack(() => data.event?.slug ?? ''));
  let category = $state<EventCategory>(untrack(() => data.event?.category ?? 'social'));
  let startDate = $state(untrack(() => data.event?.startDate ?? ''));
  let startTime = $state(untrack(() => data.event?.startTime ?? ''));
  let endDate = $state(untrack(() => data.event?.endDate ?? ''));
  let endTime = $state(untrack(() => data.event?.endTime ?? ''));
  let location = $state(untrack(() => data.event?.location ?? ''));
  let shortDescription = $state(untrack(() => data.event?.shortDescription ?? ''));
  let longDescription = $state(untrack(() => data.event?.longDescription ?? ''));
  let visible = $state(untrack(() => data.event?.visible ?? true));
</script>

<a href="/admin/club/events" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Events
</a>

{#if !data.event}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 py-10 text-center shadow-[var(--cairn-shadow)]">
    <p class="text-sm text-muted">
      {data.error ?? 'No such event. It may have been deleted, or this link is stale.'}
    </p>
  </div>
{:else}
  <!-- Keyed on the event's own id: without this, navigating from one event's detail screen
       straight to another's (both matching this same dynamic route) reuses the component
       instance, and the `$state(untrack(...))` seeds above only ever run once, leaving the
       form showing the PREVIOUS event's values under the new event's own submit actions. -->
  {#key data.event.id}
    <OfficeList eyebrow="Club" title={data.event.title} subtitle="Edit this event, then save.">
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
        <EventForm
          bind:title
          bind:slug
          bind:category
          bind:startDate
          bind:startTime
          bind:endDate
          bind:endTime
          bind:location
          bind:shortDescription
          bind:longDescription
          bind:visible
          heroImage={data.event.heroImage}
          heroImageAlt={data.event.heroImageAlt}
        />
        <div class="flex justify-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
          <CsrfField />
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
        </div>
      </form>
    </OfficeList>

    <dialog bind:this={deleteDialog} class="modal" oncancel={(event) => event.preventDefault()}>
      <div class="modal-box">
        <h2 class="text-lg font-bold">Delete {data.event.title}?</h2>
        <p class="py-2 text-sm text-muted">
          This removes the event from the calendar for good. There is no undo.
        </p>
        <form method="dialog">
          <CsrfField />
          <div class="modal-action">
            <!-- Deliberately autofocused (docs/internal/daisyui-v5-hard-components.md's
                 destructive-confirm recipe): DaisyUI v5's showModal has a known focus bug
                 (upstream #3440), and an accidental Enter must land on Cancel, never Delete. -->
            <!-- svelte-ignore a11y_autofocus -->
            <button type="submit" class="btn" autofocus formnovalidate>Cancel</button>
            <button type="submit" class="btn btn-error" formmethod="post" formaction="?/delete">Delete event</button>
          </div>
        </form>
      </div>
    </dialog>
  {/key}
{/if}
