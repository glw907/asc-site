<!-- @component
/my-account/household: primary only. Members add/remove, per-member directory listing (the
primary sets any household member's), and the lean leave-the-club action (design doc's own
"5. Household"). -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let confirmingLeave = $state(false);
</script>

<svelte:head>
  <title>Household — My Account — {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="text-step--1 text-primary underline-offset-2 hover:underline">&larr; My account</a>

<h1 class="mt-xs m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
  Household
</h1>
<p class="mt-s max-w-measure-wide text-step-0 text-muted">
  As the primary, you can add or remove household members and set anyone's directory listing.
  Each member can also change their own listing from their own profile.
</p>

{#if form && 'error' in form && form.error}
  <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">{form.error}</p>
{/if}

<ul class="mt-l flex max-w-measure-wide flex-col gap-xs">
  {#each data.members as member (member.id)}
    <li class="rounded-box border border-card-border bg-base-100 p-s text-step--1">
      <div class="flex flex-wrap items-center justify-between gap-xs">
        <span class="text-base-content">
          {member.name}
          {#if member.isPrimary}<span class="text-muted"> · primary</span>{/if}
        </span>
        {#if !member.isPrimary}
          <form method="POST" action="?/removeMember">
            <input type="hidden" name="csrf" value={data.csrf} />
            <input type="hidden" name="memberId" value={member.id} />
            <button type="submit" class="btn btn-ghost btn-xs">Remove</button>
          </form>
        {/if}
      </div>
      <form method="POST" action="?/setVisibility" class="mt-xs flex flex-wrap items-center gap-xs">
        <input type="hidden" name="csrf" value={data.csrf} />
        <input type="hidden" name="memberId" value={member.id} />
        <select name="visibility" class="select select-xs">
          <option value="visible" selected={member.directoryVisibility === 'visible'}>Visible</option>
          <option value="partial" selected={member.directoryVisibility === 'partial'}>Partial</option>
          <option value="hidden" selected={member.directoryVisibility === 'hidden'}>Hidden</option>
        </select>
        <button type="submit" class="btn btn-ghost btn-xs">Update listing</button>
      </form>
    </li>
  {/each}
</ul>

<section class="mt-l max-w-measure-wide">
  <h2 class="m-0 text-step-1 font-semibold text-base-content">Add a household member</h2>
  <form method="POST" action="?/addMember" class="mt-xs flex flex-col gap-s">
    <input type="hidden" name="csrf" value={data.csrf} />
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Name</legend>
      <input class="input w-full" type="text" name="name" required />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Email (optional)</legend>
      <input class="input w-full" type="email" name="email" />
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Birthdate (optional)</legend>
      <input class="input w-full" type="date" name="birthdate" />
    </fieldset>
    <button type="submit" class="btn btn-primary self-start">Add member</button>
  </form>
</section>

<section class="mt-l max-w-measure-wide rounded-box border border-error/40 bg-error/5 p-m">
  <h2 class="m-0 text-step-0 font-semibold text-base-content">Leave the club</h2>
  {#if form && 'left' in form && form.left}
    <p class="mt-2xs mb-0 text-step--1 text-base-content">Recorded. The club will follow up.</p>
  {:else if !confirmingLeave}
    <p class="mt-2xs mb-0 text-step--1 text-muted">Stops renewal reminders and lets the club know. This does not delete your history.</p>
    <button type="button" class="btn btn-sm portal-quiet-action mt-xs" onclick={() => (confirmingLeave = true)}>Leave the club</button>
  {:else}
    <p class="mt-2xs mb-0 text-step--1 text-base-content">Are you sure? This stops renewal reminders for your household.</p>
    <div class="mt-xs flex gap-xs">
      <form method="POST" action="?/leave">
        <input type="hidden" name="csrf" value={data.csrf} />
        <button type="submit" class="btn btn-error btn-sm">Yes, leave the club</button>
      </form>
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmingLeave = false)}>Cancel</button>
    </div>
  {/if}
</section>

<style>
  .fieldset-legend {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }

  /* Portal quiet-action tier (2026-07-15 invisible-polish fix): matches my-account/+page.svelte's
     own `.portal-quiet-action` (plain unmodified `.btn`, the profile page's own "Update" button
     convention, plus muted ink), a step up from `.btn-ghost`'s chromeless rest state. This button
     opens the confirm step; it must not read as destructive itself, that weight belongs only to the
     "Yes, leave the club" `.btn-error` confirm below. */
  .portal-quiet-action {
    color: var(--color-muted);
  }
</style>
