<!-- @component
The public class signup/waitlist form: reachable from the events listing's class cards. An open
class enrolls immediately on submit; a full one joins the waitlist instead, both through the same
`joinClass` remote function (class-signup.remote.ts), which decides the outcome server-side (this
page never guesses). Turnstile-gated, degrading gracefully with no secret configured, matching the
family's own ContactForm/DonateForm precedent.

The class-door standing gate: `joinClass`'s own submission is gated server-side on membership
standing, so a non-member never enrolls here — the action answers a `{ pivot: 'join' }` outcome
instead, which this page renders as an invitation into `/join/apply` with the submitted fields
carried over as query params. A `lapsed` household gets `{ pivot: 'renew' }` instead (amended
2026-07-14): joining fresh would duplicate that household, so the page offers a button that emails
the member's own sign-in link (`requestRenewLink`) rather than the join carry-over. With JS
available, an email-blur probe (`checkKnownEmail` then `checkClassEligibility`) offers the same
pivot before the visitor fills out the rest of the form. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { joinClass, checkClassEligibility, requestRenewLink } from '$theme/class-signup.remote';
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

  /** The class-door standing gate's own pivot shape: the join invitation carries the entered
   *  fields, the renewal handoff carries just the email the "email me a sign-in link" button
   *  needs. Set once the email-blur probe (or a full submit) finds the visitor ineligible, so the
   *  page can show the right pivot before a full submit; `null` until then. */
  type Pivot = { mode: 'join'; name: string; email: string; phone: string } | { mode: 'renew'; email: string };

  let blurPivot = $state<Pivot | null>(null);

  async function onEmailBlur(): Promise<void> {
    const enteredEmail = email.value() ?? '';
    if (!enteredEmail.trim()) {
      blurPivot = null;
      return;
    }
    const known = await checkKnownEmail(enteredEmail);
    if (!known.known) {
      blurPivot = { mode: 'join', name: name.value() ?? '', email: enteredEmail, phone: phone.value() ?? '' };
      return;
    }
    const { status } = await checkClassEligibility(enteredEmail);
    if (status === 'eligible') {
      blurPivot = null;
    } else if (status === 'lapsed') {
      blurPivot = { mode: 'renew', email: enteredEmail };
    } else {
      blurPivot = { mode: 'join', name: name.value() ?? '', email: enteredEmail, phone: phone.value() ?? '' };
    }
  }

  const resultPivot = $derived.by<Pivot | null>(() => {
    const result = joinClass.result;
    if (!result || !('pivot' in result)) return null;
    return result.pivot === 'join'
      ? { mode: 'join', name: result.name, email: result.email, phone: result.phone ?? '' }
      : { mode: 'renew', email: result.email };
  });

  const pivot = $derived(resultPivot ?? blurPivot);

  const joinApplyHref = $derived.by(() => {
    if (!pivot || pivot.mode !== 'join') return '';
    const params = new URLSearchParams({ class: data.cls.id, name: pivot.name, email: pivot.email });
    if (pivot.phone) params.set('phone', pivot.phone);
    return `/join/apply?${params.toString()}`;
  });

  $effect(() => {
    const url = payClassFee.result && 'url' in payClassFee.result ? payClassFee.result.url : undefined;
    if (url) window.location.href = url;
  });

  /**
   * Waits for `window.turnstile` to exist, then hands off to Turnstile's own `ready()` (Cloudflare's
   * client-side rendering docs: `ready()` queues a callback until the API has finished its own
   * internal setup, not just until the object exists) before invoking `callback`. `api.js` loads
   * `async`, and the two explicit-render widgets below (see {@link turnstileExplicit}) can mount
   * before it has finished loading (the pay-fee panel and the renew pivot both appear right after a
   * form submit, which can beat a slow network to api.js), so this polls rather than assuming any
   * ordering between the two. Returns a cancel function so a widget torn down mid-wait never fires a
   * stray render.
   */
  function onTurnstileReady(callback: () => void): () => void {
    let cancelled = false;
    function poll(): void {
      if (cancelled) return;
      if (window.turnstile) {
        window.turnstile.ready(callback);
        return;
      }
      window.setTimeout(poll, 50);
    }
    poll();
    return () => {
      cancelled = true;
    };
  }

  /**
   * Svelte action that explicitly renders a Turnstile widget into `node`, following Cloudflare's
   * client-side/explicit-rendering pattern
   * (developers.cloudflare.com/turnstile/get-started/client-side-rendering). Turnstile's implicit
   * auto-render (the `class="cf-turnstile" data-sitekey=...` convention the plain signup form below
   * still uses) only scans the document for `.cf-turnstile` elements once, when `api.js` first
   * loads; a widget an `{#if}` branch reveals afterward, like the pay-fee and renew-link widgets
   * this action is used on, is never picked up by that scan and so is never rendered without this.
   * Renders at most once per mount (the wait in {@link onTurnstileReady} self-terminates after its
   * first callback) and removes the widget on teardown, so re-entering the branch later never
   * leaves a duplicate.
   */
  function turnstileExplicit(node: HTMLElement): { destroy(): void } {
    let widgetId: string | undefined;
    const cancelWait = onTurnstileReady(() => {
      widgetId = window.turnstile?.render(node, { sitekey: TURNSTILE_SITE_KEY });
    });
    return {
      destroy() {
        cancelWait();
        if (widgetId !== undefined) window.turnstile?.remove(widgetId);
      },
    };
  }
</script>

<svelte:head>
  <title>{data.cls.name} — Sign Up — {siteConfig.siteName}</title>
  <!-- Loaded exactly once, unconditionally: previously this page carried three copies of this
       tag, one per outcome branch below, so transitioning between branches (e.g. plain form ->
       enrolled) removed and re-inserted the tag, re-fetching and re-executing api.js. A single
       tag in the document head persists across every branch transition. The plain signup form's
       widget still renders via Turnstile's own implicit auto-render (its `class="cf-turnstile"`
       markup, scanned once when this loads); the pay-fee and renew-link widgets render via
       {@link turnstileExplicit} instead, since they are not in the DOM at that first scan. -->
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
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
        <form {...payClassFee} class="mt-s flex flex-col items-start gap-s">
          <input type="hidden" name="enrollmentId" value={joinClass.result.enrollmentId} />
          <input type="hidden" name="classId" value={data.cls.id} />
          <div use:turnstileExplicit></div>
          <button type="submit" class="asc-cta-btn" disabled={!!payClassFee.pending}>
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
{:else if pivot && pivot.mode === 'renew'}
  <div class="mt-l max-w-measure-wide rounded-box border border-info bg-info/10 p-m">
    <p class="m-0 font-semibold text-base-content">Renew to sign up for {data.cls.name}.</p>
    <p class="mt-xs mb-0 text-step--1 text-base-content">
      Your membership has lapsed. We'll email you a sign-in link; you can renew and register for
      classes from your account.
    </p>
    {#if requestRenewLink.result?.sent}
      <p class="mt-xs mb-0 text-step--1 text-base-content">Check your inbox. The link expires in 15 minutes.</p>
    {:else}
      <form {...requestRenewLink} class="mt-s flex flex-col items-start gap-s">
        <input type="hidden" name="email" value={pivot.email} />
        <div use:turnstileExplicit></div>
        <button type="submit" class="btn btn-primary btn-sm" disabled={!!requestRenewLink.pending}>
          {requestRenewLink.pending ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
    {/if}
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

    <fieldset class="fieldset">
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

  .waiver-text summary {
    cursor: pointer;
    font-size: var(--text-step--1);
    color: var(--color-primary);
  }
  /* The disclosure triangle rendered the browser's own default marker ink, a plain gray beside
     the navy summary text next to it. Both marker pseudo-elements carry the same navy so the
     whole affordance reads as one link-family control. */
  .waiver-text summary::marker {
    color: var(--color-primary);
  }
  .waiver-text summary::-webkit-details-marker {
    color: var(--color-primary);
  }
  .waiver-text p {
    margin: var(--spacing-2xs) 0 0;
    font-size: var(--text-step--1);
    line-height: var(--leading-body);
    color: var(--color-muted);
  }
</style>
