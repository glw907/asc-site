<!-- @component
The public class signup/waitlist form (Task 8): reachable from the events listing's class cards.
An open class enrolls immediately on submit; a full one joins the waitlist instead, both through
the same `joinClass` remote function (class-signup.remote.ts), which decides the outcome
server-side (this page never guesses). Turnstile-gated, degrading gracefully with no secret
configured, matching the family's own ContactForm/DonateForm precedent. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { joinClass } from '$theme/class-signup.remote';
  import { CLASS_TRACK_LABEL } from '$admin-club/lib/classes-store';
  import { WAIVER_RELEASE_TEXT } from '$theme/waiver-text';
  import { DATE_TBD, formatDateRange } from '$theme/season-data';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';

  let { data }: { data: PageData } = $props();

  const dateDisplay = $derived(data.cls.startDate ? formatDateRange(data.cls.startDate, data.cls.endDate) : DATE_TBD);
  const spotsLeft = $derived(Math.max(0, data.cls.capacity - data.cls.enrolledCount));

  const { name, email, phone, waiverAccepted } = joinClass.fields;
</script>

<svelte:head>
  <title>{data.cls.name} — Sign Up — {siteConfig.siteName}</title>
</svelte:head>

<h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
  Sign up: {data.cls.name}
</h1>

<dl class="class-meta mt-s flex flex-wrap gap-x-l gap-y-2xs text-step--1 text-muted">
  <div><dt class="sr-only">Track</dt><dd>{CLASS_TRACK_LABEL[data.cls.track]}</dd></div>
  <div><dt class="sr-only">Dates</dt><dd>{dateDisplay}</dd></div>
  {#if data.cls.location}
    <div><dt class="sr-only">Location</dt><dd>{data.cls.location}</dd></div>
  {/if}
</dl>

{#if data.cls.description}
  <p class="mt-m max-w-measure-wide text-step-0 text-base-content">{data.cls.description}</p>
{/if}

<p class="mt-s max-w-measure-wide text-step-0" class:text-warning={data.cls.isFull} class:text-success={!data.cls.isFull}>
  {#if data.cls.isFull}
    This class is full. Join the waitlist below and we'll email you if a spot opens.
  {:else}
    {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} open.
  {/if}
</p>

{#if joinClass.result?.outcome === 'enrolled'}
  <div class="mt-l max-w-measure-wide rounded-box border border-success bg-success/10 p-m">
    <p class="m-0 font-semibold text-base-content">You're signed up for {data.cls.name}.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      The $100 class fee is due before your first day, paid the same way as membership dues today;
      online payment is coming with the member portal. We'll follow up by email with anything else
      you need before class.
    </p>
  </div>
{:else if joinClass.result?.outcome === 'waitlisted'}
  <div class="mt-l max-w-measure-wide rounded-box border border-info bg-info/10 p-m">
    <p class="m-0 font-semibold text-base-content">You're on the waitlist, position {joinClass.result.position}.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      Cancellations are common in the weeks before class. If a spot opens, we'll email you a link to
      claim it, good for a limited window; passing on an offer is a fine choice and keeps your place
      for a future opening.
    </p>
  </div>
{:else}
  <form {...joinClass} class="mt-l flex max-w-measure-wide flex-col gap-m">
    {#each joinClass.fields.allIssues() ?? [] as issue (issue.message)}
      <p class="rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
        {issue.message}
      </p>
    {/each}

    <input type="hidden" name="classId" value={data.cls.id} />

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Full name</legend>
      <input class="input w-full" autocomplete="name" required {...name.as('text')} />
    </fieldset>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Email address</legend>
      <input class="input w-full" autocomplete="email" required {...email.as('email')} />
    </fieldset>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Phone number (optional)</legend>
      <input class="input w-full" autocomplete="tel" {...phone.as('tel')} />
    </fieldset>

    <fieldset class="fieldset waiver-fieldset">
      <legend class="fieldset-legend">Liability release</legend>
      <details class="waiver-text">
        <summary>Read the release (version {data.waiverVersion})</summary>
        <p>{WAIVER_RELEASE_TEXT}</p>
      </details>
      <label class="mt-xs flex items-start gap-xs text-step--1">
        <input class="checkbox mt-[0.15em]" required {...waiverAccepted.as('checkbox')} />
        I have read and accept the liability release above (version {data.waiverVersion}).
      </label>
    </fieldset>

    <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>

    <button type="submit" class="btn btn-primary self-start" disabled={!!joinClass.pending}>
      {#if joinClass.pending}
        Submitting…
      {:else if data.cls.isFull}
        Join the waitlist
      {:else}
        Sign up
      {/if}
    </button>
  </form>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
{/if}

<style>
  /* Matches ContactForm/DonateForm's own eyebrow legend, the site's field-label convention. */
  .fieldset-legend {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .class-meta dd {
    margin: 0;
  }

  .waiver-fieldset {
    border: var(--border) solid var(--color-card-border);
    border-radius: var(--radius-box);
    padding: var(--spacing-s) var(--spacing-m);
  }
  .waiver-text summary {
    cursor: pointer;
    font-size: var(--text-step--1);
    color: var(--color-primary);
  }
  .waiver-text p {
    margin: var(--spacing-2xs) 0 0;
    font-size: var(--text-step--1);
    line-height: var(--leading-body);
    color: var(--color-muted);
  }
</style>
