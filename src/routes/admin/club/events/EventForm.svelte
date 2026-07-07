<!--
@component
The Events detail/edit fields (Task 5), shared between the create screen (`events/new`) and the
edit screen (`events/[id]`) so the field set has exactly one copy. Composed from the engine's
`admin-fields` primitives (`TextField`/`SelectField`/`FieldLabel`), in the same horizontal
label-beside-input rhythm the Settings screen (Task 4) already established for this site; the
ratified mockup's stacked "label above input" detail-panel layout is a future `admin-fields`
addition (per that subpath's own header comment: "a date field... likely the next addition"),
not something this pass hand-rolls in parallel to the shipped primitives. The date/time fields
compose `FieldLabel` directly around a bare `<input type="date">`/`type="time">`, per that
component's own header comment ("compose it directly around a bare custom control when a site's
own field needs the admin's label rhythm with no bundled primitive to match"): `TextField`'s
`type` prop only accepts `text`/`search`/`email`/`url` today, not `date`/`time`.
-->
<script lang="ts">
  import { FieldLabel, SelectField, TextField } from '@glw907/cairn-cms/admin-fields';
  import { EVENT_CATEGORIES, EVENT_CATEGORY_LABEL, type EventCategory } from '$admin-club/lib/events-store';

  let {
    title = $bindable(),
    slug = $bindable(),
    category = $bindable(),
    startDate = $bindable(),
    startTime = $bindable(),
    endDate = $bindable(),
    endTime = $bindable(),
    location = $bindable(),
    shortDescription = $bindable(),
    longDescription = $bindable(),
    visible = $bindable(),
    heroImage = null,
    heroImageAlt = null,
  }: {
    title: string;
    slug: string;
    category: EventCategory;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    location: string;
    shortDescription: string;
    longDescription: string;
    visible: boolean;
    heroImage?: string | null;
    heroImageAlt?: string | null;
  } = $props();

  const categoryOptions = EVENT_CATEGORIES.map((value) => ({ value, label: EVENT_CATEGORY_LABEL[value] }));
</script>

<div class="grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
  <TextField label="Title" name="title" bind:value={title} />
  <TextField label="Slug" name="slug" bind:value={slug} />
  <SelectField label="Category" name="category" bind:value={category} options={categoryOptions} />
  <label class="flex items-center gap-1.5 text-sm">
    <input type="checkbox" class="checkbox checkbox-sm" name="visible" bind:checked={visible} />
    Visible on the public calendar
  </label>
  <FieldLabel label="Start date">
    <input class="input input-sm" type="date" name="startDate" bind:value={startDate} />
  </FieldLabel>
  <FieldLabel label="Start time">
    <input class="input input-sm" type="time" name="startTime" bind:value={startTime} />
  </FieldLabel>
  <FieldLabel label="End date">
    <input class="input input-sm" type="date" name="endDate" bind:value={endDate} />
  </FieldLabel>
  <FieldLabel label="End time">
    <input class="input input-sm" type="time" name="endTime" bind:value={endTime} />
  </FieldLabel>
  <TextField label="Location" name="location" bind:value={location} />
</div>

<div class="grid gap-4 border-t border-[var(--cairn-card-border)] p-6">
  <FieldLabel label="Short description">
    <textarea class="textarea textarea-sm w-full" name="shortDescription" rows="2" bind:value={shortDescription}
    ></textarea>
  </FieldLabel>
  <FieldLabel label="Long description">
    <textarea class="textarea textarea-sm w-full" name="longDescription" rows="8" bind:value={longDescription}
    ></textarea>
  </FieldLabel>
</div>

{#if heroImage}
  <!-- Read-only this pass: the media-library picker reuse seam (design suite Part B) is not
       wired for a custom /admin/club screen yet, so the hero image only displays what the ops
       import carried. Replacing or clearing it needs the picker seam, a later pass's work. -->
  <div class="flex flex-wrap items-center gap-2 border-t border-[var(--cairn-card-border)] p-6 text-sm">
    <span class="font-medium text-muted">Hero image (read-only):</span>
    <span>{heroImage}</span>
    {#if heroImageAlt}<span class="text-muted">&middot; {heroImageAlt}</span>{/if}
  </div>
{/if}
