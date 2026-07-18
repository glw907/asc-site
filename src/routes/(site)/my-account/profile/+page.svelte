<!-- @component
/my-account/profile: the lean fields (email, phone, birthdate) and directory visibility, with a
"how others see you" preview that updates live as the visibility control changes (design doc's
own "3. Profile"). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { profilePreviewLines } from '$member-portal/lib/profile-preview';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // A full page load follows every form POST here (no use:enhance), so this component remounts
  // on every save; the one-time snapshot svelte-check warns about is exactly what is wanted, so
  // `untrack` marks the read as deliberate (the documented escape hatch for this warning).
  let visibility = $state(untrack(() => data.profile.directoryVisibility));

  const previewLines = $derived(profilePreviewLines(visibility, data.preview));
</script>

<svelte:head>
  <title>Profile — My Account — {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="portal-back-link">&larr; My account</a>

<h1 class="portal-page-title">Profile</h1>

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
  <p class="mt-2xs mb-0 text-step--1 text-muted">How others see you:</p>
  <ul class="mt-2xs mb-0 flex flex-col gap-3xs text-step--1 text-base-content">
    {#each previewLines as line (line)}
      <li>{line}</li>
    {/each}
  </ul>

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

<section class="mt-l max-w-measure-wide">
  <h2 class="m-0 text-step-1 font-semibold text-base-content">Your boats</h2>
  <p class="mt-2xs mb-0 text-step--1 text-muted">A boat belongs to its owner; add, edit, or remove your own here.</p>

  {#if data.boats.length > 0}
    <ul class="mt-s flex flex-col gap-xs">
      {#each data.boats as boat (boat.id)}
        <li class="rounded-box border border-card-border bg-base-100 p-s">
          <form method="POST" action="?/updateBoat" class="flex flex-col gap-s">
            <input type="hidden" name="csrf" value={data.csrf} />
            <input type="hidden" name="boatId" value={boat.id} />
            <fieldset class="fieldset">
              <legend class="fieldset-legend portal-field-label">Boat name</legend>
              <input class="input input-sm w-full" type="text" name="name" value={boat.name ?? ''} required />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend portal-field-label">Model</legend>
              <select class="select select-sm w-full" name="modelPicker">
                <option value="Buccaneer 18" selected={boat.model === 'Buccaneer 18'}>Buccaneer 18</option>
                <option value="Laser" selected={boat.model === 'Laser'}>Laser</option>
                <option value="Other" selected={boat.model !== 'Buccaneer 18' && boat.model !== 'Laser'}>Other</option>
              </select>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend portal-field-label">If Other, type the model</legend>
              <input
                class="input input-sm w-full"
                type="text"
                name="otherModel"
                value={boat.model !== 'Buccaneer 18' && boat.model !== 'Laser' ? boat.model : ''}
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend portal-field-label">Sail number (optional)</legend>
              <input class="input input-sm w-full" type="text" name="sailNumber" value={boat.sailNumber ?? ''} />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend portal-field-label">Kept on</legend>
              <select class="select select-sm w-full" name="keptOn">
                <option value="trailer" selected={boat.keptOn === 'trailer'}>Trailer</option>
                <option value="mooring" selected={boat.keptOn === 'mooring'}>Mooring</option>
              </select>
            </fieldset>
            <button type="submit" class="btn btn-sm portal-quiet-action self-start">Save</button>
          </form>
          <form method="POST" action="?/removeBoat" class="mt-xs">
            <input type="hidden" name="csrf" value={data.csrf} />
            <input type="hidden" name="boatId" value={boat.id} />
            <button type="submit" class="btn btn-xs portal-quiet-action">Remove</button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}

  <form method="POST" action="?/addBoat" class="mt-s flex flex-col gap-s">
    <input type="hidden" name="csrf" value={data.csrf} />
    <fieldset class="fieldset">
      <legend class="fieldset-legend portal-field-label">Boat name</legend>
      <input class="input w-full" type="text" name="name" required />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend portal-field-label">Model</legend>
      <select class="select w-full" name="modelPicker">
        <option value="Buccaneer 18">Buccaneer 18</option>
        <option value="Laser">Laser</option>
        <option value="Other">Other</option>
      </select>
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend portal-field-label">If Other, type the model</legend>
      <input class="input w-full" type="text" name="otherModel" />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend portal-field-label">Sail number (optional)</legend>
      <input class="input w-full" type="text" name="sailNumber" />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend portal-field-label">Kept on</legend>
      <select class="select w-full" name="keptOn">
        <option value="trailer">Trailer</option>
        <option value="mooring">Mooring</option>
      </select>
    </fieldset>
    <button type="submit" class="btn btn-primary self-start">Add boat</button>
  </form>
</section>
