<!-- @component
/my-account/profile: the lean fields (email, phone, birthdate) and directory visibility, with a
"how others see you" preview that updates live as the visibility control changes (design doc's
own "3. Profile"). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // A full page load follows every form POST here (no use:enhance), so this component remounts
  // on every save; the one-time snapshot svelte-check warns about is exactly what is wanted, so
  // `untrack` marks the read as deliberate (the documented escape hatch for this warning).
  let visibility = $state(untrack(() => data.profile.directoryVisibility));

  const previewLine = $derived(
    visibility === 'hidden'
      ? 'Not listed in the member directory.'
      : visibility === 'partial'
        ? 'Name only, no contact details.'
        : 'Name, email, and phone visible to other members.',
  );
</script>

<svelte:head>
  <title>Profile — My Account — {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="text-step--1 text-primary underline-offset-2 hover:underline">&larr; My account</a>

<h1 class="mt-xs m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
  Profile
</h1>

{#if form && 'error' in form && form.error}
  <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">{form.error}</p>
{:else if form && 'saved' in form && form.saved}
  <p class="mt-s max-w-measure-wide rounded-field border border-success bg-success/10 px-s py-xs text-step--1 text-success">Saved.</p>
{/if}

<form method="POST" action="?/updateProfile" class="mt-l flex max-w-measure-wide flex-col gap-m">
  <input type="hidden" name="csrf" value={data.csrf} />
  <fieldset class="fieldset">
    <legend class="fieldset-legend portal-field-label">Email address</legend>
    <input class="input w-full" type="email" name="email" autocomplete="email" value={data.profile.email} />
  </fieldset>
  <fieldset class="fieldset">
    <legend class="fieldset-legend portal-field-label">Phone number</legend>
    <input class="input w-full" type="tel" name="phone" autocomplete="tel" placeholder="+19075551234" value={data.profile.phone} />
    <p class="mt-2xs mb-0 text-step--2 text-muted">With a country code, like +19075551234.</p>
  </fieldset>
  <fieldset class="fieldset">
    <legend class="fieldset-legend portal-field-label">Birthdate</legend>
    <input class="input w-full" type="date" name="birthdate" value={data.profile.birthdate} />
    <p class="mt-2xs mb-0 text-step--2 text-muted">Used for class age groups and the young-adult rate; never shown to other members.</p>
  </fieldset>
  <button type="submit" class="btn btn-primary self-start">Save</button>
</form>

<section class="mt-l max-w-measure-wide rounded-box border border-card-border bg-base-100 p-m">
  <h2 class="m-0 text-step-0 font-semibold text-base-content">Directory listing</h2>
  <p class="mt-2xs mb-0 text-step--1 text-muted">How others see you: <span class="text-base-content">{previewLine}</span></p>

  <form method="POST" action="?/updateVisibility" class="mt-s flex flex-wrap items-center gap-xs">
    <input type="hidden" name="csrf" value={data.csrf} />
    <select name="visibility" class="select select-sm" bind:value={visibility}>
      <option value="visible">Visible</option>
      <option value="partial">Partial (name only)</option>
      <option value="hidden">Hidden</option>
    </select>
    <button type="submit" class="btn btn-sm">Update</button>
  </form>
</section>
