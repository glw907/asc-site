<!-- @component
The public class signup/waitlist form (Task 8): reachable from the events listing's class cards.
An open class enrolls immediately on submit; a full one joins the waitlist instead, both through
the same `joinClass` remote function (class-signup.remote.ts), which decides the outcome
server-side (this page never guesses). Turnstile-gated, degrading gracefully with no secret
configured, matching the family's own ContactForm/DonateForm precedent.

The class-door standing gate (Task 4): `joinClass`'s own submission is gated server-side on
membership standing, so a non-member (or lapsed household) never enrolls here — the action answers
a `{ pivot: 'join' }` outcome instead, which this page renders as an invitation into `/join/apply`
with the submitted fields carried over as query params. With JS available, an email-blur probe
(`checkKnownEmail` then `checkClassEligibility`) offers the same invitation before the visitor
fills out the rest of the form. -->
<script lang="ts">
  import { browser } from '$app/environment';
  import type { PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { joinClass, checkClassEligibility } from '$theme/class-signup.remote';
  import { checkKnownEmail } from '$theme/join-apply.remote';
  import { payClassFee } from '$theme/class-fee-checkout.remote';
  import { CLASS_TRACK_LABEL } from '$admin-club/lib/classes-store';
  import { WAIVER_RELEASE_TEXT } from '$theme/waiver-text';
  import { DATE_TBD, formatDateRange } from '$theme/season-data';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';

  let { data }: { data: PageData } = $props();

  const dateDisplay = $derived(data.cls.startDate ? formatDateRange(data.cls.startDate, data.cls.endDate) : DATE_TBD);
  const spotsLeft = $derived(Math.max(0, data.cls.capacity - data.cls.enrolledCount));

  const { name, email, phone, interests, waiverAccepted } = joinClass.fields;

  /** Set once the email-blur probe finds the visitor ineligible, so the page can show the join
   *  invitation before a full submit. `null` until a blur decides otherwise. */
  let blurPivot = $state<{ name: string; email: string; phone: string } | null>(null);

  async function onEmailBlur(): Promise<void> {
    const enteredEmail = email.value() ?? '';
    if (!enteredEmail.trim()) {
      blurPivot = null;
      return;
    }
    const known = await checkKnownEmail(enteredEmail);
    const eligible = known.known ? (await checkClassEligibility(enteredEmail)).eligible : false;
    blurPivot = eligible ? null : { name: name.value() ?? '', email: enteredEmail, phone: phone.value() ?? '' };
  }

  const pivot = $derived(
    joinClass.result && 'pivot' in joinClass.result
      ? { name: joinClass.result.name, email: joinClass.result.email, phone: joinClass.result.phone ?? '' }
      : blurPivot,
  );

  const joinApplyHref = $derived.by(() => {
    if (!pivot) return '';
    const params = new URLSearchParams({ class: data.cls.id, name: pivot.name, email: pivot.email });
    if (pivot.phone) params.set('phone', pivot.phone);
    return `/join/apply?${params.toString()}`;
  });

  $effect(() => {
    const url = payClassFee.result && 'url' in payClassFee.result ? payClassFee.result.url : undefined;
    if (browser && url) window.location.href = url;
  });
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

<p class="mt-s max-w-measure-wide text-step-0" class:text-warning={!data.open} class:text-success={data.open}>
  {#if data.open}
    {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} open.
  {:else}
    This class is full. Join the waitlist below and we'll email you if a spot opens.
  {/if}
</p>

{#if joinClass.result && 'outcome' in joinClass.result && joinClass.result.outcome === 'enrolled'}
  <div class="mt-l max-w-measure-wide rounded-box border border-success bg-success/10 p-m">
    <p class="m-0 font-semibold text-base-content">You're signed up for {data.cls.name}.</p>
    {#if data.cls.fee > 0}
      <p class="mt-xs mb-0 text-step--1 text-base-content">
        The ${data.cls.fee} class fee is due before your first day. We'll follow up by email with
        anything else you need before class.
      </p>
      {#if payClassFee.result && 'stub' in payClassFee.result}
        <p class="mt-xs mb-0 text-step--1 text-base-content">
          Online payment isn't available yet; the club will follow up by email with how to pay.
        </p>
      {:else}
        {#each payClassFee.fields.allIssues() ?? [] as issue (issue.message)}
          <p class="mt-xs rounded-field border border-error bg-error/10 px-s py-xs text-step--1 text-error">
            {issue.message}
          </p>
        {/each}
        <form {...payClassFee} class="mt-s">
          <input type="hidden" name="enrollmentId" value={joinClass.result.enrollmentId} />
          <input type="hidden" name="classId" value={data.cls.id} />
          <button type="submit" class="btn btn-primary btn-sm" disabled={!!payClassFee.pending}>
            {payClassFee.pending ? 'Redirecting…' : `Pay $${data.cls.fee} now`}
          </button>
        </form>
      {/if}
    {:else}
      <!-- The free-clinic journey (Geoff, 2026-07-07): the signup IS the roster, so the
           confirmation says so instead of inventing a fee. -->
      <p class="mt-xs mb-0 text-step--1 text-base-content">
        It's free; signing up just lets us know you're coming. We'll follow up by email with
        anything you need before the weekend.
      </p>
    {/if}
  </div>
{:else if joinClass.result && 'outcome' in joinClass.result && joinClass.result.outcome === 'waitlisted'}
  <div class="mt-l max-w-measure-wide rounded-box border border-info bg-info/10 p-m">
    <p class="m-0 font-semibold text-base-content">You're on the waitlist, position {joinClass.result.position}.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      Cancellations are common in the weeks before class. If a spot opens, we'll email you a link to
      claim it, good for a limited window; passing on an offer is a fine choice and keeps your place
      for a future opening.
    </p>
  </div>
{:else if pivot}
  <div class="mt-l max-w-measure-wide rounded-box border border-info bg-info/10 p-m">
    <p class="m-0 font-semibold text-base-content">Classes are for current members.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      Join the club to sign up for {data.cls.name}; we'll carry your class pick over so you don't
      have to enter it twice.
    </p>
    <a class="btn btn-primary btn-sm mt-s" href={joinApplyHref}>Join the club</a>
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
      <input class="input w-full" autocomplete="email" required {...email.as('email')} onblur={onEmailBlur} />
    </fieldset>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Phone number (optional)</legend>
      <input class="input w-full" autocomplete="tel" {...phone.as('tel')} />
    </fieldset>

    <fieldset class="fieldset">
      <legend class="fieldset-legend">Anything specific you'd like to learn?</legend>
      <textarea class="textarea h-24 w-full" {...interests.as('text')}></textarea>
      <p class="mt-2xs mb-0 text-step--2 text-muted">
        Optional. Your answer helps us shape class time around what you want to learn.
      </p>
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
      {:else if data.open}
        Sign up
      {:else}
        Join the waitlist
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
