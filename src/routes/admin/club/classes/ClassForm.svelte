<!--
@component
The Classes detail/edit fields (Task 6), shared between the create screen (`classes/new`) and
the edit screen (`classes/[id]`), the same one-copy shape `events/EventForm.svelte` already
established for this section. `capacity` and `fee` are plain numeric text inputs (whole
numbers only, `class-form-input.ts` validates); `season` is not a field here (assigned once at
creation from the current season, see `classes-store.ts`'s `createClass`, never edited
afterward). `heroImage`/`heroImageAlt` render read-only, the same recipe `EventForm.svelte`
already established: no media-library picker seam is wired for this custom `/admin/club`
screen yet, so the field only ever displays whatever image reference migration 0003's backfill
carried.
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
    customNote = $bindable(),
    visible = $bindable(),
    dropIn = $bindable(),
    heroImage = null,
    heroImageAlt = null,
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
    customNote: string;
    visible: boolean;
    dropIn: boolean;
    heroImage?: string | null;
    heroImageAlt?: string | null;
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
  <div>
    <label class="flex items-center gap-1.5 text-sm">
      <input type="checkbox" class="checkbox checkbox-sm" name="dropIn" bind:checked={dropIn} />
      Drop-in
    </label>
    <p class="mt-1 text-xs text-muted">
      No registration. The public schedule shows "Just show up!" instead of a Register link.
    </p>
  </div>
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
  <FieldLabel label="Reminder note override">
    <textarea class="textarea textarea-sm w-full" name="customNote" rows="2" bind:value={customNote}
    ></textarea>
  </FieldLabel>
  <p class="text-xs text-muted">
    A member-facing aside this class's own reminder email includes ("bring your own PFD"). Blank
    sends no override.
  </p>
</div>

{#if heroImage}
  <!-- Read-only this pass: the media-library picker reuse seam (design suite Part B) is not
       wired for a custom /admin/club screen yet, so the hero image only displays what migration
       0003's backfill carried. Replacing or clearing it needs the picker seam, a later pass's
       work (the same recipe EventForm.svelte's own comment documents). -->
  <div class="flex flex-wrap items-center gap-2 border-t border-[var(--cairn-card-border)] p-6 text-sm">
    <span class="font-medium text-muted">Hero image (read-only):</span>
    <span>{heroImage}</span>
    {#if heroImageAlt}<span class="text-muted">&middot; {heroImageAlt}</span>{/if}
  </div>
{/if}
