<!-- @component
/my-account/directory: the members-only directory, one card per household, honoring each
member's own directory-visibility choice ($member-portal/lib/directory.ts already excludes a
hidden or archived member; a `partial` member's card row carries no contact line). The search
field filters by name only, entirely client-side: the whole list is already in `data`, and at the
club's scale (roughly 210 members) a client-side filter is plenty, no pagination needed. Each
member's contact stacks under their name (a shared left edge regardless of name length) in the
page's own reading ink, `text-base-content`: the member came here to read it, so it carries the
same weight as the name, not the lighter `text-muted` metadata tone the household's city keeps. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { formatPhone } from '$member-portal/lib/directory';

  let { data }: { data: PageData } = $props();

  let query = $state('');

  const filteredHouseholds = $derived.by(() => {
    if (data.households === null) return [];
    const needle = query.trim().toLowerCase();
    return data.households
      .map((household) => ({
        ...household,
        members: household.members.filter((member) => member.name.toLowerCase().includes(needle)),
      }))
      .filter((household) => household.members.length > 0);
  });

  const totalShown = $derived(filteredHouseholds.reduce((sum, household) => sum + household.members.length, 0));
</script>

<svelte:head>
  <title>Member Directory — My Account — {siteConfig.siteName}</title>
</svelte:head>

<a href="/my-account" class="text-step--1 text-primary underline-offset-2 hover:underline">&larr; My account</a>

<h1 class="mt-xs m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
  Member directory
</h1>
<p class="mt-s max-w-measure-wide text-step-0 text-muted">
  Fellow members who've chosen to be listed. Change your own listing, or your household's, from
  <a href="/my-account/profile" class="text-primary underline-offset-2 hover:underline">Profile</a>.
</p>

{#if data.households === null}
  <p class="mt-l max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
    The directory isn't available right now. Try again in a few minutes.
  </p>
{:else}
  <div class="mt-l max-w-measure-wide">
    <label for="directory-search" class="fieldset-legend portal-field-label">Search by name</label>
    <input
      id="directory-search"
      type="search"
      class="input mt-2xs w-full"
      placeholder="Search members"
      bind:value={query}
    />
  </div>

  <p class="mt-xs max-w-measure-wide text-step--1 text-muted" aria-live="polite">
    {totalShown} {totalShown === 1 ? 'member' : 'members'} shown
  </p>

  {#if data.households.length === 0}
    <p class="mt-l max-w-measure-wide text-step--1 text-muted">No members are listed in the directory yet.</p>
  {:else if filteredHouseholds.length === 0}
    <p class="mt-l max-w-measure-wide text-step--1 text-muted">No members match "{query}".</p>
  {:else}
    <ul class="mt-l flex max-w-measure-wide flex-col gap-s" aria-label="Member directory">
      {#each filteredHouseholds as household (household.id)}
        <li class="rounded-box border border-card-border bg-base-100 p-m">
          <h2 class="m-0 flex flex-wrap items-baseline gap-2xs text-step-0 font-semibold text-base-content">
            <span>{household.name}</span>
            {#if household.city}<span class="text-muted">· {household.city}</span>{/if}
          </h2>
          <ul class="mt-xs flex flex-col gap-s text-step--1">
            {#each household.members as member (member.id)}
              <li class="flex flex-col gap-3xs">
                <span class="text-base-content">{member.name}</span>
                {#if member.email || member.phone}
                  <p class="m-0 flex flex-wrap items-center gap-2xs text-base-content">
                    {#if member.email}
                      <a href="mailto:{member.email}" class="underline-offset-2 hover:text-primary hover:underline">{member.email}</a>
                    {/if}
                    {#if member.email && member.phone}<span class="text-muted" aria-hidden="true">·</span>{/if}
                    {#if member.phone}
                      <a href="tel:{member.phone}" class="underline-offset-2 hover:text-primary hover:underline">{formatPhone(member.phone)}</a>
                    {/if}
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
