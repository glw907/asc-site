<!--
@component
The Classes create screen (Task 6), the same shape `events/new/+page.svelte` established:
a bare form over `ClassForm`'s shared fields, posting to this route's own `create` action.
-->
<script lang="ts">
  import type { ActionData } from './$types';
  import { CsrfField, OfficeList } from '@glw907/cairn-cms/components';
  import ClassForm from '../ClassForm.svelte';
  import type { ClassTrack } from '$admin-club/lib/classes-store';

  let { form }: { form: ActionData } = $props();

  let name = $state('');
  let slug = $state('');
  let track = $state<ClassTrack>('adult-teen');
  let capacity = $state('10');
  let fee = $state('100');
  let startDate = $state('');
  let endDate = $state('');
  let location = $state('');
  let description = $state('');
  let instructorNotes = $state('');
  let visible = $state(true);
</script>

<a href="/admin/club/classes" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Classes
</a>

<OfficeList eyebrow="Club" title="New class" subtitle="Add a class to the current season.">
  {#if form?.error}
    <p class="border-b border-[var(--cairn-card-border)] px-6 py-3 text-sm font-medium text-error" role="alert">
      {form.error}
    </p>
  {/if}
  <form method="post" action="?/create">
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
      <button type="submit" class="btn btn-primary btn-sm">Create class</button>
    </div>
  </form>
</OfficeList>
