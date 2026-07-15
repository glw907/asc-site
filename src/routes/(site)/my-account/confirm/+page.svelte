<!-- @component
/my-account/confirm: the POST-confirm sign-in button (a click, not the link's own GET, actually
consumes the token — see +page.server.ts's header). A failed confirm re-renders in the "cold edge"
state (mockup frame 09): "That sign-in link expired", the reason blamed on the link rather than
the member, and a one-button "send me a fresh link" recovery with the email pre-filled when it
could be traced back to a member. -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { siteConfig } from '$theme/cairn.config';
  import { TURNSTILE_SITE_KEY } from '$theme/turnstile';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Sign In — {siteConfig.siteName}</title>
</svelte:head>

{#if form?.resent}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Check your inbox
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    If that address is on file with the club, a fresh sign-in link is on its way.
  </p>
{:else if form && !form.ok}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    That sign-in link expired
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">
    Links work once and for a short while, to keep your account safe. No harm done.
  </p>
  <form method="POST" action="?/resend" class="mt-l flex max-w-measure-wide flex-col gap-m">
    <input type="hidden" name="csrf" value={data.csrf} />
    <fieldset class="fieldset">
      <legend class="fieldset-legend">Email address</legend>
      <input class="input w-full" type="email" name="email" autocomplete="email" required value={form.prefillEmail ?? ''} />
    </fieldset>
    <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>
    <button type="submit" class="btn btn-primary self-start">Send me a fresh link</button>
  </form>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
{:else}
  <h1 class="m-0 font-display text-step-4 font-semibold leading-tight tracking-tight text-base-content">
    Sign in to {siteConfig.siteName}
  </h1>
  <p class="mt-s max-w-measure-wide text-step-0 text-muted">Click below to finish signing in.</p>
  <form method="POST" action="?/confirm" class="mt-l flex flex-col items-start gap-s">
    <input type="hidden" name="csrf" value={data.csrf} />
    <input type="hidden" name="token" value={data.token} />
    <div class="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY}></div>
    <button type="submit" class="btn btn-primary">Sign in</button>
  </form>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
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
