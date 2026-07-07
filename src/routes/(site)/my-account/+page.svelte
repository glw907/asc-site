<!-- @component
/my-account: the sign-in form when signed out (mockup frame 01) or the auth-focused landing when
signed in (a minimal placeholder over mockup frame 02: name + standing card + sign out; the full
task-list/receipts/household composition is a later pass's own work). -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { MEMBERSHIP_TIER_LABEL } from '$member-auth/lib/standing';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>My Account — {siteConfig.siteName}</title>
</svelte:head>

{#if !data.member}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Member sign-in
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    Enter the email address the club has on file and we'll send you a sign-in link. No password to
    remember.
  </p>

  {#if form && 'sent' in form && form.sent}
    <div class="mt-l max-w-measure-wide rounded-box border border-success bg-success/10 p-m">
      <p class="m-0 font-semibold text-base-content">Check your inbox.</p>
      <p class="mt-xs mb-0 text-step--1 text-base-content">
        If that address is on file with the club, a sign-in link is on its way. It expires in 15
        minutes.
      </p>
    </div>
  {:else}
    {#if form?.error}
      <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
        {form.error}
      </p>
    {/if}
    <form method="POST" action="?/requestLink" class="mt-l flex max-w-measure-wide flex-col gap-m">
      <input type="hidden" name="csrf" value={data.csrf} />
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Email address</legend>
        <input class="input w-full" type="email" name="email" autocomplete="email" required />
      </fieldset>
      <button type="submit" class="btn btn-primary self-start">Email me a sign-in link</button>
    </form>
    <p class="mt-l max-w-measure-wide text-step--1 text-muted">
      Wrong or old email on file? <a href="/contact" class="text-primary">Contact us</a> and we'll fix
      it.
    </p>
  {/if}
{:else}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Hi, {data.member.name}
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">Your membership, at a glance.</p>

  {#if data.standing}
    <div
      class="mt-l max-w-measure-wide rounded-box border border-l-4 border-card-border bg-base-100 p-m"
      class:border-l-success={data.standing.status === 'current'}
      class:border-l-warning={data.standing.status === 'grace'}
      class:border-l-error={data.standing.status === 'lapsed'}
    >
      <p class="m-0 text-step-1 font-semibold text-base-content">{data.standing.statusLine}</p>
      {#if data.standing.tier && data.standing.season}
        <p class="mt-2xs mb-0 text-step--1 text-muted">
          {MEMBERSHIP_TIER_LABEL[data.standing.tier]} membership · {data.standing.season} season
        </p>
      {/if}
      <!-- SEAM (portal-capstone): a 'grace'/'lapsed' standing's own "Renew now" action lands here,
           once the join/renewal flow creates an unpaid `memberships` row to pay against --
           `createCheckout({ kind: 'dues', refId: membership.id, ... })` (`payments.ts`'s own
           header names this exact seam). Not wired in this worktree; the webhook's own dues
           reconciliation (`stripe-reconcile.ts`) already handles whatever session that call
           creates. -->
    </div>
  {/if}

  <form method="POST" action="?/signOut" class="mt-l">
    <button type="submit" class="btn btn-ghost btn-sm">Sign out</button>
  </form>
{/if}

<style>
  /* Matches the class-signup/DonateForm/ContactForm family's own eyebrow legend convention. */
  .fieldset-legend {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }
</style>
