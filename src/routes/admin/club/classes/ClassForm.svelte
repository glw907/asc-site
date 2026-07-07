<!--
@component
The Classes detail/edit fields (Task 6), shared between the create screen (`classes/new`) and
the edit screen (`classes/[id]`), the same one-copy shape `events/EventForm.svelte` already
established for this section. `capacity` and `fee` are plain numeric text inputs (whole
numbers only, `class-form-input.ts` validates); `season` is not a field here (assigned once at
creation from the current season, see `classes-store.ts`'s `createClass`, never edited
afterward).
-->
<script lang="ts">
  import { FieldLabel, SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { CLASS_TRACKS, CLASS_TRACK_LABEL, type ClassTrack } from '$admin-club/lib/classes-store';

  let {
    name = $bindable(),
    slug = $bindable(),
    track = $bindable(),
    capacity = $bindable(),
    fee = $bindable(),
    startDate = $bindable(),
    endDate = $bindable(),
    location = $bindable(),
    description = $bindable(),
    instructorNotes = $bindable(),
    visible = $bindable(),
  }: {
    name: string;
    slug: string;
    track: ClassTrack;
    capacity: string;
    fee: string;
    startDate: string;
    endDate: string;
    location: string;
    description: string;
    instructorNotes: string;
    visible: boolean;
  } = $props();

  const trackOptions = CLASS_TRACKS.map((value) => ({ value, label: CLASS_TRACK_LABEL[value] }));
</script>

<div class="grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
  <TextField label="Name" name="name" bind:value={name} />
  <TextField label="Slug" name="slug" bind:value={slug} />
  <SelectField label="Track" name="track" bind:value={track} options={trackOptions} />
  <label class="flex items-center gap-1.5 text-sm">
    <input type="checkbox" class="checkbox checkbox-sm" name="visible" bind:checked={visible} />
    Visible on the public calendar
  </label>
  <FieldLabel label="Capacity">
    <input class="input input-sm" type="number" min="1" step="1" name="capacity" bind:value={capacity} />
  </FieldLabel>
  <FieldLabel label="Fee (USD)">
    <input class="input input-sm" type="number" min="0" step="1" name="fee" bind:value={fee} />
  </FieldLabel>
  <FieldLabel label="Start date">
    <input class="input input-sm" type="date" name="startDate" bind:value={startDate} />
  </FieldLabel>
  <FieldLabel label="End date">
    <input class="input input-sm" type="date" name="endDate" bind:value={endDate} />
  </FieldLabel>
  <TextField label="Location" name="location" bind:value={location} />
</div>

<div class="grid gap-4 border-t border-[var(--cairn-card-border)] p-6">
  <FieldLabel label="Description">
    <textarea class="textarea textarea-sm w-full" name="description" rows="6" bind:value={description}
    ></textarea>
  </FieldLabel>
  <FieldLabel label="Instructor notes">
    <textarea class="textarea textarea-sm w-full" name="instructorNotes" rows="3" bind:value={instructorNotes}
    ></textarea>
  </FieldLabel>
</div>
