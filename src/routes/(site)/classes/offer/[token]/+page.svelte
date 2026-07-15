<!-- @component
The public waitlist-offer claim/decline page (Task 8): shows the class and the offer's expiry,
then either Claim (enrolls) or Pass (declines, freeing the block on a fresh offer). An
expired or already-used token renders the honest state instead of the two actions, with a link
back to the class's own signup page. -->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const expiryFmt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  /** `offers.ts`'s own sqlite-datetime shape ("YYYY-MM-DD HH:MM:SS", no offset, UTC). */
  function formatExpiry(sqliteDatetime: string): string {
    return expiryFmt.format(new Date(sqliteDatetime.replace(' ', 'T') + 'Z'));
  }

  const alreadyResolved = $derived(data.offer.resolved !== null || data.isExpired);
</script>

<svelte:head>
  <title>Class Waitlist Offer — {siteConfig.siteName}</title>
</svelte:head>

<h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
  Your spot in {data.offer.className}
</h1>

{#if form?.claimed}
  <div class="mt-l max-w-measure-wide rounded-box border border-success bg-success/10 p-m">
    <p class="m-0 font-semibold text-base-content">You're enrolled in {data.offer.className}.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      The $100 class fee is due before your first day, paid the same way as membership dues today;
      online payment is coming with the member portal. We'll follow up by email with anything else
      you need before class.
    </p>
  </div>
{:else if form?.declined}
  <div class="mt-l max-w-measure-wide rounded-box border border-card-border bg-base-200 p-m">
    <p class="m-0 font-semibold text-base-content">No problem, we've passed on this spot for you.</p>
    <p class="mt-xs mb-0 text-step--1 text-muted">
      Passing is a fine choice. You're still on the waitlist for {data.offer.className}, and we'll
      offer the spot to the next person in line.
    </p>
  </div>
{:else if alreadyResolved}
  <div class="mt-l max-w-measure-wide rounded-box border border-card-border bg-base-200 p-m">
    <p class="m-0 font-semibold text-base-content">
      {data.isExpired ? 'This offer has expired.' : 'This offer has already been used.'}
    </p>
    <p class="mt-xs mb-0 text-step--1 text-muted">
      <a href="/classes/{data.offer.classId}/signup" class="text-primary">Visit the class page</a> to
      sign up or join the waitlist again.
    </p>
  </div>
{:else}
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    This offer is good until {formatExpiry(data.offer.expiresAt)}.
  </p>

  {#if form?.error}
    <p class="mt-s max-w-measure-wide rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
      {form.error}
    </p>
  {/if}

  <div class="mt-l flex flex-wrap items-start gap-l">
    <form method="POST" action="?/claim" class="flex flex-col items-start gap-s">
      <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>
      <button type="submit" class="btn btn-primary">Claim my spot</button>
    </form>
    <form method="POST" action="?/decline" class="flex flex-col items-start gap-s">
      <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>
      <button type="submit" class="btn btn-ghost">Pass this time</button>
    </form>
  </div>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
{/if}
