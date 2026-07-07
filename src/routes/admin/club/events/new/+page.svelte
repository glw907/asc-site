<!--
@component
The Events create screen (Task 5): the same detail-form field set `events/[id]` edits,
pre-filled empty. There is nothing to delete on a draft that has never been saved, so this
screen carries no confirm dialog, unlike the edit screen.
-->
<script lang="ts">
  import type { ActionData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import EventForm from '../EventForm.svelte';
  import type { EventCategory } from '$admin-club/lib/events-store';

  let { form }: { form: ActionData } = $props();

  let title = $state('');
  let slug = $state('');
  let category = $state<EventCategory>('social');
  let startDate = $state('');
  let startTime = $state('');
  let endDate = $state('');
  let endTime = $state('');
  let location = $state('');
  let shortDescription = $state('');
  let longDescription = $state('');
  let visible = $state(true);
</script>

<a href="/admin/club/events" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Events
</a>

<OfficeList eyebrow="Club" title="New event" subtitle="Fill in the details, then save.">
  {#if form?.error}
    <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
      {form.error}
    </p>
  {/if}
  <form method="post" action="?/create">
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
    />
    <div class="flex justify-end gap-2 border-t border-[var(--cairn-card-border)] p-6">
      <CsrfField />
      <button type="submit" class="btn btn-primary btn-sm">Save</button>
    </div>
  </form>
</OfficeList>
